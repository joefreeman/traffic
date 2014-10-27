Traffic.Application = Backbone.Router.extend({

  routes: {
    'worlds/:id': 'world'
  },

  initialize: function(options) {
    this.target = options.target;
    this.connection = null;
    if (window.location.hash.length <= 1) {
      window.location = '#worlds/asdf';
    }
  },

  world: function(id) {
    if (this.connection) {
      this.connection.close();
    }
    this.world = new Traffic.Model.World({id: id});
    this.worldView = new Traffic.View.World({model: this.world, target: this.target});
    this.controlsView = new Traffic.View.Controls({worldView: this.worldView});
    this.target.empty().append(
      this.worldView.render().el,
      this.controlsView.render().el);
    this.worldView.draw();
    this.connection = new Traffic.Connection(null, {world: this.world});
  }
});
