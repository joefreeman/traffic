Traffic.View.World = Backbone.View.extend({

  className: 'world',

  tagName: 'div',

  events: {
    'mousedown': '_handleMouseDown',
    'mousemove': '_handleMouseMove',
    'mouseup': '_handleMouseUp',
  },

  initialize: function(options) {
    this.zoom = 20;
    this.dragStartCell = null;
    this._setupStage();
    this._setupGridLayer();
    this._setupEdgesLayer();
    this._setupVehiclesLayer();
    this._setupDrawingLayer();
    this.model.edges.on('add', this._handleEdgeAdded, this);
    this.model.edges.on('reset', this._handleEdgesReset, this);
    this.model.edges.on('remove', this._handleEdgeRemoved, this);
    this.model.vehicles.on('add', this._handleVehicleAdded, this);
    this.model.vehicles.on('reset', this._handleVehiclesReset, this);
    this.model.vehicles.on('remove', this._handleVehicleRemoved, this);
    this.model.vehicles.on('change', this._handleVehicleChanged, this);
  },

  changeZoom: function(delta) {
    this.zoom = Math.min(Math.max(10, this.zoom + delta), 50);
    this._setupGridLayer();
    this._setupEdgesLayer();
    this._setupVehiclesLayer();
    this.stage.draw();
  },

  _setupStage: function() {
    this.stage = new Kinetic.Stage({
      container: this.$el.get(0),
      width: $(window).width(),
      height: $(window).height()
    });
  },

  _setupGridLayer: function() {
    if (this.gridLayer) {
      this.gridLayer.destroy();
    }
    this.gridLayer = new Kinetic.Layer();
    var width = $(window).width();
    var height = $(window).height();
    var strokeWidth = 1;
    var strokeColour = '#F5F5F5';
    for (var x = 0; x < width; x += this.zoom) {
      this.gridLayer.add(new Kinetic.Line({
        stroke: strokeColour,
        strokeWidth: strokeWidth,
        points: [x, 0, x, height]
      }));
    }
    for (var y = 0; y < height; y += this.zoom) {
      this.gridLayer.add(new Kinetic.Line({
        stroke: strokeColour,
        strokeWidth: strokeWidth,
        points: [0, y, width, y]
      }));
    }
    this.stage.add(this.gridLayer);
  },

  _setupEdgesLayer: function() {
    if (this.edgesLayer) {
      this.edgesLayer.destroy();
    }
    this.edgesLayer = new Kinetic.Layer();
    this.stage.add(this.edgesLayer);
    this.model.edges.each(function(edge) {
      this._addEdge(edge);
    }, this);
  },

  _setupVehiclesLayer: function() {
    if (this.vehiclesLayer) {
      this.vehiclesLayer.destroy();
    }
    this.vehiclesLayer = new Kinetic.Layer();
    this.stage.add(this.vehiclesLayer);
    this.model.vehicles.each(function(edge) {
      this._addVehicle(edge);
    }, this);
  },

  _setupDrawingLayer: function() {
    this.drawingLayer = new Kinetic.Layer();
    this.stage.add(this.drawingLayer);
  },

  draw: function() {
    this.edgesLayer.draw();
    this.gridLayer.draw();
  },

  _handleMouseDown: function(ev) {
    this.dragStart = {x: ev.offsetX, y: ev.offsetY};
    this.dragging = false;
  },

  _handleMouseMove: function(ev) {
    if (this.dragStart) {
      this.dragging = true;
      var path = this._findPath(
        {x: Math.floor(this.dragStart.x / this.zoom), y: Math.floor(this.dragStart.y / this.zoom)},
        {x: Math.floor(ev.offsetX / this.zoom), y: Math.floor(ev.offsetY / this.zoom)});
      this.drawingLayer.removeChildren();
      if (path.length > 1) {
        var offset = this.zoom / 2;
        for (var i = 1; i < path.length; i++) {
          this.drawingLayer.add(new Kinetic.Line({
            stroke: '#999',
            dashArray: [6, 3],
            points: [
              path[i - 1].x * this.zoom + offset,
              path[i - 1].y * this.zoom + offset,
              path[i].x * this.zoom + offset,
              path[i].y * this.zoom + offset
            ],
            listening: false
          }));
        }
      }
      this.drawingLayer.draw();
    }
  },

  _findPath: function(start, end) {
    var x = start.x;
    var y = start.y;
    var dx = Traffic.Utils.sign(end.x - start.x);
    var dy = Traffic.Utils.sign(end.y - start.y);
    var path = [{x: start.x, y: start.y}];
    while (x != end.x || y != end.y) {
      if (x != end.x) x += dx;
      if (y != end.y) y += dy;
      path.push({x: x, y: y});
    }
    return path;
  },

  _handleMouseUp: function(ev) {
    if (this.dragging) {
      var path = this._findPath(
        {x: Math.floor(this.dragStart.x / this.zoom), y: Math.floor(this.dragStart.y / this.zoom)},
        {x: Math.floor(ev.offsetX / this.zoom), y: Math.floor(ev.offsetY / this.zoom)});
      if (path.length >= 2) {
        if (this.model.findEdge(path[0], path[1])) {
          for (var i = 1; i < path.length; i++) {
            var edgeStr = path[i - 1].x + ',' + path[i - 1].y + ':' + path[i].x + ',' + path[i].y;
            $.ajax({
              type: 'DELETE',
              url: '/worlds/' + this.model.id + '/edges/' + encodeURIComponent(edgeStr)
            });
          }
        } else {
          for (var i = 1; i < path.length; i++) {
            if (this.model.findEdge(path[i], path[i - 1])) {
              var edgeStr = path[i].x + ',' + path[i].y + ':' + path[i - 1].x + ',' + path[i - 1].y;
              $.ajax({
                type: 'DELETE',
                url: '/worlds/' + this.model.id + '/edges/' + encodeURIComponent(edgeStr)
              });
            }
            if (!this.model.findEdge(path[i - 1], path[i])) {
              $.ajax({
                type: 'POST',
                url: '/worlds/' + this.model.id + '/edges',
                contentType: 'application/json',
                data: JSON.stringify({
                  from: path[i - 1],
                  to: path[i]
                })
              });
            }
          }
        }
      }
    } else {
      var x = Math.floor(this.dragStart.x / this.zoom);
      var y = Math.floor(this.dragStart.y / this.zoom);
      var existingVehicle = this.model.findVehicle(x, y)
      if (existingVehicle) {
        $.ajax({
          type: 'DELETE',
          url: '/worlds/' + this.model.id + '/vehicles/' + existingVehicle.id
        });
      } else {
        $.ajax({
          type: 'POST',
          url: '/worlds/' + this.model.id + '/vehicles',
          contentType: 'application/json',
          data: JSON.stringify({
            x: x,
            y: y,
            color: Traffic.Utils.randomColor()
          })
        });
      }
    }
    this.drawingLayer.removeChildren();
    this.drawingLayer.draw();
    this.dragStart = null;
    this.dragging = false;
  },

  _createArrow: function(from, to, id) {
    var offset = this.zoom / 2;
    var fromX = from.x * this.zoom + offset;
    var fromY = from.y * this.zoom + offset;
    var toX = to.x * this.zoom + offset;
    var toY = to.y * this.zoom + offset;
    var headlen = this.zoom / 4;
    var angle = Math.atan2(toY - fromY, toX - fromX);
    return new Kinetic.Line({
        id: id,
        points: [
          fromX,
          fromY,
          toX,
          toY,
          toX - headlen * Math.cos(angle - Math.PI / 6),
          toY - headlen * Math.sin(angle - Math.PI / 6),
          toX,
          toY,
          toX - headlen * Math.cos(angle + Math.PI / 6),
          toY - headlen * Math.sin(angle + Math.PI / 6)
        ],
        stroke: '#777',
        strokeWidth: 1
    });
  },

  _addEdge: function(edge) {
    this.edgesLayer.add(this._createArrow(edge.get('from'), edge.get('to'), edge.cid));
  },

  _addVehicle: function(vehicle) {
    var offset = this.zoom / 2;
    var vehicleShape = new Kinetic.Group({
      id: vehicle.id,
      x: vehicle.get('x') * this.zoom + offset,
      y: vehicle.get('y') * this.zoom + offset
    });
    vehicleShape.add(new Kinetic.Rect({
      fill: vehicle.get('color'),
      x: -this.zoom / 3,
      y: -this.zoom / 6,
      height: this.zoom / 3,
      width: this.zoom / 1.5
    }));
    this.vehiclesLayer.add(vehicleShape);
  },

  _updateVehicle: function(vehicle) {
    var offset = this.zoom / 2;
    var vehicleShape = this.vehiclesLayer.find('#' + vehicle.id)[0];
    var dx = vehicle.get('x') - vehicle.previous('x');
    var dy = vehicle.get('y') - vehicle.previous('y');
    var angle = Math.atan2(dy, dx);
    vehicleShape.setRotation(angle);
    var tween = new Kinetic.Tween({
      node: vehicleShape,
      x: vehicle.get('x') * this.zoom + offset,
      y: vehicle.get('y') * this.zoom + offset,
      duration: 0.5
    });
    tween.play();
  },

  _handleEdgeAdded: function(edge) {
    this._addEdge(edge);
    this.edgesLayer.draw();
  },

  _handleEdgesReset: function() {
    this._setupEdgesLayer();
    this.edgesLayer.draw();
  },

  _handleEdgeRemoved: function(edge) {
    var edgeShape = this.edgesLayer.find('#' + edge.cid)[0];
    edgeShape.destroy();
    this.edgesLayer.draw();
  },

  _handleVehicleAdded: function(edge) {
    this._addVehicle(edge);
    this.vehiclesLayer.draw();
  },

  _handleVehiclesReset: function() {
    this._setupVehiclesLayer();
    this.vehiclesLayer.draw();
  },

  _handleVehicleRemoved: function(vehicle) {
    var vehicleShape = this.vehiclesLayer.find('#' + vehicle.id)[0];
    vehicleShape.destroy();
    this.vehiclesLayer.draw();
  },

  _handleVehicleChanged: function(vehicle) {
    this._updateVehicle(vehicle);
    this.vehiclesLayer.draw();
  }
});
