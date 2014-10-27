Traffic.Connection = Backbone.Model.extend({

  initialize: function(attributes, options) {
    this.world = options.world;
    this._setupWebSocket();
  },

  close: function() {
    this.websocket.close();
  },

  _setupWebSocket: function() {
    var protocol = window.location.protocol == 'https:' ? 'wss:' : 'ws:';
    this.websocket = new WebSocket(protocol + '//' + window.location.host + '/worlds/' + this.world.id);
    this.websocket.onopen = _.bind(this._handleWebSocketOpened, this);
    this.websocket.onclose = _.bind(this._handleWebSocketClosed, this);
    this.websocket.onmessage = _.bind(this._handleWebSocketMessage, this);
    this.websocket.onerror = _.bind(this._handleWebSocketError, this);
  },

  _handleWebSocketOpened: function() {
    console.log('open', arguments);
  },

  _handleWebSocketClosed: function() {
    console.log('close', arguments);
  },

  _handleWebSocketMessage: function(ev) {
    var message = JSON.parse(ev.data);
    if (message.worldId == this.world.id) {
      switch (message.type) {
        case 'snapshot':
          this.world.edges.reset(message.data.edges);
          this.world.vehicles.reset(message.data.vehicles);
          break;
        case 'edgeAdded':
          this.world.edges.add(message.data);
          break;
        case 'edgeRemoved':
          var edge = this.world.findEdge(message.data.from, message.data.to);
          this.world.edges.remove(edge);
        case 'vehicleAdded':
          this.world.vehicles.add(message.data);
          break;
        case 'vehicleUpdated':
          var vehicle = this.world.vehicles.get(message.data.id);
          vehicle.set(message.data);
          break;
        case 'vehicleRemoved':
          var vehicle = this.world.vehicles.get(message.data);
          this.world.vehicles.remove(vehicle);
          break;
        default:
          console.log('Unhandled message:', message);
          break;
      }
    }
  },

  _handleWebSocketError: function() {
    console.log('error', arguments);
  }
});
