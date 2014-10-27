Traffic.View.Controls = Backbone.View.extend({

  className: 'controls',

  tagName: 'div',

  events: {
    'click .zoom-in': '_handleZoomInButtonClicked',
    'click .zoom-out': '_handleZoomOutButtonClicked'
  },

  initialize: function(options) {
    this.worldView = options.worldView;
  },

  render: function() {
    this.$el.empty().append(
      $('<button>').text('+').addClass('zoom-in'),
      $('<button>').text('-').addClass('zoom-out'));
    return this;
  },

  _handleZoomInButtonClicked: function() {
    this.worldView.changeZoom(1);
  },

  _handleZoomOutButtonClicked: function() {
    this.worldView.changeZoom(-1);
  }
});