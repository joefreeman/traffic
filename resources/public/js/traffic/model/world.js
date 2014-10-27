Traffic.Model.World = Backbone.Model.extend({

  initialize: function() {
    this.edges = new Backbone.Collection();
    this.vehicles = new Backbone.Collection();
  },

  findEdge: function(from, to) {
    return this.edges.find(function(edge) {
      return edge.get('from').x == from.x &&
        edge.get('from').y == from.y &&
        edge.get('to').x == to.x &&
        edge.get('to').y == to.y;
    });
  },

  findVehicle: function(x, y) {
    return this.vehicles.find(function(vehicle) {
      return vehicle.get('x') == x && vehicle.get('y') == y;
    });
  }
});