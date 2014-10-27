(ns traffic.core
  (:require [compojure.core :refer [defroutes GET POST DELETE ANY]]
            [compojure.route :as route]
            [compojure.handler :as handler]
            [ring.middleware.reload :as reload]
            [org.httpkit.server :as httpkit]
            [clojure.data.json :as json]
            [clojure.java.io :as io]
            [clojure.string :as s])
  (:gen-class))

(defn- parse-world
  [world]
  {"edges" @(:edges world)
   "vehicles" @(:vehicles world)})

(defn- send-event
  [channel world-id type data]
  (httpkit/send! channel (json/write-str {"worldId" world-id "type" type "data" data})))

(defn handle-get-world
  [{:keys [params worlds channels] :as req}]
  (httpkit/with-channel req channel
    (httpkit/on-close channel (fn [status] (swap! channels disj channel)))
    (httpkit/on-receive channel (fn [data] (println "Received:" data)))
    (swap! channels conj channel)
    (when-let [world (get @worlds (:id params))]
      (send-event channel (:id params) "snapshot" (parse-world world)))))

(defn parse-json-request
  [req]
  (with-open [rdr (io/reader (:body req))]
    (try
      (json/read rdr)
      (catch java.io.EOFException e))))

(defn- ensure-world-exists
  [worlds world-id]
  (swap! worlds (fn [worlds]
    (if-not (contains? worlds world-id)
      (assoc worlds world-id {:edges (atom []) :vehicles (atom [])})
      worlds))))

(defn handle-add-vehicle
  [{:keys [params worlds channels] :as req}]
  (ensure-world-exists worlds (:id params))
  (let [vehicle-id (str (java.util.UUID/randomUUID))
        vehicle (assoc (parse-json-request req) "id" vehicle-id)]
    (swap! (:vehicles (get @worlds (:id params))) conj vehicle)
    (doseq [channel @channels]
      (send-event channel (:id params) "vehicleAdded" vehicle))
    {:status 201
     :body (json/write-str {"id" vehicle-id})}))

(defn handle-remove-vehicle
  [{:keys [params worlds channels]}]
  (let [{world-id :id vehicle-id :vid} params]
    (swap! (:vehicles (get @worlds world-id))
           (fn [vehicles]
             (remove #(= (get % "id") vehicle-id)
                     vehicles)))
    (doseq [channel @channels]
      (send-event channel world-id "vehicleRemoved" vehicle-id))
    {:status 204}))

(defn- points-equal?
  [a b]
  (and (= (get a "x") (get b "x"))
       (= (get a "y") (get b "y"))))

(defn handle-add-edge
  [{:keys [params worlds channels] :as req}]
  (ensure-world-exists worlds (:id params))
  (let [edge (parse-json-request req)
        edges (:edges (get @worlds (:id params)))]
    (swap! edges (fn [edges]
                  (when (some #(or (and (points-equal? (get % "from") (get edge "from"))
                                        (points-equal? (get % "to") (get edge "to")))
                                   (and (points-equal? (get % "from") (get edge "to"))
                                        (points-equal? (get % "to") (get edge "from"))))
                            edges)
                    (throw (Exception. "Edge already exists.")))
                   (conj edges edge)))
    (doseq [channel @channels]
      (send-event channel (:id params) "edgeAdded" edge))
    {:status 201}))

(defn- parse-long
  [long-str]
  (try
    (Long/parseLong long-str)
    (catch NumberFormatException e)))

(defn- parse-point
  [point-str]
  (let [[x y] (map parse-long (s/split point-str #","))]
    {"x" x, "y" y}))

(defn handle-remove-edge
  [{:keys [params worlds channels]}]
  (let [{world-id :id edge-str :edge} params
        edges (:edges (get @worlds world-id))
        [from-str to-str] (s/split edge-str #":")
        from (parse-point from-str)
        to (parse-point to-str)]
    (swap! edges (fn [edges]
                   (remove #(and (points-equal? (get % "from") from)
                                 (points-equal? (get % "to") to)) edges)))
    (doseq [channel @channels]
      (send-event channel world-id "edgeRemoved" {"from" from "to" to}))
    {:status 204}))

(defroutes main-routes
  (GET "/worlds/:id" req handle-get-world)
  (POST "/worlds/:id/vehicles" req handle-add-vehicle)
  (DELETE "/worlds/:id/vehicles/:vid" req handle-remove-vehicle)
  (POST "/worlds/:id/edges" req handle-add-edge)
  (DELETE "/worlds/:id/edges/:edge" req handle-remove-edge)
  (route/resources "/static")
  (route/not-found "<h1>Not Found</h1>"))

(defn- wrap-state
  [handler key value]
  (fn [req]
    (handler (assoc req key value))))

(def ^:private update-interval-ms 500)

(defn- find-edge
  [edges vehicle]
  (let [candidates (filter #(points-equal? (get % "from") vehicle) edges)]
    (when (seq candidates)
      (rand-nth candidates))))

(defn- find-vehicle
  [vehicles point except-id]
  (first (filter #(and (points-equal? point %)
                       (not= (get % "id") except-id))
                 vehicles)))

(defn- update-vehicle
  [vehicle world-id edges old-vehicles new-vehicles channels]
  (if-let [edge (find-edge edges vehicle)]
    (let [to (get edge "to")]
      (if-not (or (find-vehicle old-vehicles to (get vehicle "id"))
                  (find-vehicle @new-vehicles to nil))
        (let [new-vehicle (merge vehicle to)]
          (doseq [channel channels]
            (send-event channel world-id "vehicleUpdated" new-vehicle))
          new-vehicle)
        vehicle))
    vehicle))

(defn- update-vehicles
  [vehicles edges channels world-id]
  (let [new-vehicles (atom [])]
    (doseq [vehicle (shuffle vehicles)]
      (swap! new-vehicles conj (update-vehicle vehicle world-id edges vehicles new-vehicles channels)))
    @new-vehicles))

(defn update-worlds
  [worlds channels]
  (while true
    (let [start-time (System/currentTimeMillis)]
      (doseq [[world-id world] @worlds]
        (try
          (swap! (:vehicles world) update-vehicles @(:edges world) @channels world-id)
          (catch Exception e
            (.printStackTrace e))))
      (let [sleep-ms (max (- update-interval-ms (- (System/currentTimeMillis) start-time)) 0)]
        (Thread/sleep sleep-ms)))))

(defn -main
  [& args]
  (let [server-port 3000
        worlds (atom {})
        channels (atom #{})]
    (-> #'main-routes
      (handler/api)
      (reload/wrap-reload)
      (wrap-state :worlds worlds)
      (wrap-state :channels channels)
      (httpkit/run-server {:port server-port}))
    (future (update-worlds worlds channels))
    (println (str "Server started (listening on port " server-port ")."))))
