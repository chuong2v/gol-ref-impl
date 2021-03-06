
var _ = require('lodash');
var events = require('events');
var util = require('util');
var golPatterns = require('./gol-patterns.js');
var golPerf = require('./gol-perf.js');
var golUtil = require('./gol-util.js');

var nb_diffs = [
  {x:-1,y:-1}, {x: 0,y:-1}, {x: 1,y:-1}, 
  {x:-1,y: 0},              {x: 1,y: 0},
  {x:-1,y: 1}, {x: 0,y: 1}, {x: 1,y: 1}
];

function GameOfLife(params) {
  params = params || {};
  if (Object.keys(params).length == 0) {
    params.cols = 5;
    params.rows = 5;
  }
  this.init(params);
}

util.inherits(GameOfLife, events.EventEmitter);

GameOfLife.prototype.init = function(params) {
  params = params || {};

  this._toroidal = false;
  this._activemark = 0;
  this._totalsteps = 0;
  this._alivecells = 0;

  if (params.matrix) {
    var changes = [];

    var dim = golUtil.getMatrixDimension(params.matrix);
    if (!dim.cols || !dim.rows) {
      throw new Error('Invalid matrix: ' + JSON.stringify(params));
    }
    this._rows = dim.rows;
    this._cols = dim.cols;

    this._space = new Array(this._rows);
    for(var i=0; i<this._rows; i++) {
      this._space[i] = new Array(this._cols);
      for(var j=0; j<this._cols; j++) {
        this._space[i][j] = [params.matrix[i][j], 0];
        this._alivecells += params.matrix[i][j];
        if(params.matrix[i][j] > 0) {
          changes.push({x:j, y:i, v:params.matrix[i][j]});
        }
      }
    }
    this.emit('change', changes);
  } else

  if (params.cols && params.rows) {
    this._cols = params.cols;
    this._rows = params.rows;

    this._space = new Array(this._rows);
    for(var i=0; i<this._rows; i++) {
      this._space[i] = new Array(this._cols);
      for(var j=0; j<this._cols; j++) {
        this._space[i][j] = [0, 0];
      }
    }

    if (params.origin && params.pattern) {
      this.emit('change', _common_apply_pattern(this, 
          params.origin, params.pattern));
    } else {
      this.emit('change', _common_seed(this, params.cells));
    }

  } else
    
  throw new Error('Invalid parameters: ' + JSON.stringify(params));
}

GameOfLife.prototype.seed = function(cells) {
  this.emit('change', _common_seed(this, cells));
}

GameOfLife.prototype.reverse = function(cells) {
  cells = cells || [];
  var changes = [];

  for(var k=0; k<cells.length; k++) {
    var x = cells[k].x;
    var y = cells[k].y;
    if (0 <= x && x < this._cols && 0 <= y && y < this._rows) {
      this._space[y][x][this._activemark] = 1 - this._space[y][x][this._activemark];
      this._alivecells += ((this._space[y][x][this._activemark] == 0) ? -1 : 1);
      changes.push({x:x, y:y, v:this._space[y][x][this._activemark]});
    }
  }

  this.emit('change', changes);
}

GameOfLife.prototype.load = function(pattern_name) {
  pattern_name = pattern_name || 'Gosper-glider-gun';
  var pattern_info = golPatterns[pattern_name];
  if (!pattern_info) return;

  var changes = [];

  _common_clear(this, changes);

  var matrix = pattern_info.matrix[0];
  var dim = golUtil.getMatrixDimension(matrix);
  if (!dim.cols || !dim.rows) {
    throw new Error('Invalid matrix: ' + JSON.stringify(matrix));
  }

  var origin = {};
  switch(pattern_info.position) {
    case 'center':
      origin.x = Math.floor((this._cols - dim.cols) / 2);
      origin.x = (origin.x > 0) ? origin.x : 0;
      origin.y = Math.floor((this._rows - dim.rows) / 2);
      origin.y = (origin.y > 0) ? origin.y : 0;
      break;
    default:
      origin.x = origin.y = 0;
  }

  _common_apply_pattern(this, origin, matrix, changes);

  this.emit('change', changes);
}

GameOfLife.prototype.random = function() {
  var min_amount = Math.floor(this._rows * this._cols / 20);
  var max_amount = Math.floor(this._rows * this._cols / 4);
  var amount = Math.floor(Math.random() * (max_amount - min_amount) + min_amount);
  
  var cellidx = [];
  var cells = [];
  while(amount > 0) {
    var x = Math.floor(Math.random() * (this._cols + 1));
    var y = Math.floor(Math.random() * (this._rows + 1));
    var p = y * this._rows + x;
    if (cellidx.indexOf(p) == -1) {
      cellidx.push(p);
      cells.push({x:x, y:y, v:1});
      amount = amount - 1;
    }
  }

  var changes = [];
  _common_clear(this, changes);
  _common_seed(this, cells, changes);
  this.emit('change', changes);
}

GameOfLife.prototype.getToroidal = function() {
  return this._toroidal;
}

GameOfLife.prototype.setToroidal = function(value) {
  this._toroidal = (value == true);
}

GameOfLife.prototype.getTotalSteps = function() {
  return this._totalsteps;
}

GameOfLife.prototype.getAliveCells = function() {
  return this._alivecells;
}

GameOfLife.prototype.getCols = function() {
  return this._cols;
}

GameOfLife.prototype.getRows = function() {
  return this._rows;
}

GameOfLife.prototype.getCell = function(col, row) {
  return this._space[row][col][this._activemark];
}

GameOfLife.prototype.getCells = function() {
  var cells = [];
  for(var i=0; i<this._rows; i++) {
    for(var j=0; j<this._cols; j++) {
      if (this._space[i][j][this._activemark] > 0) {
        cells.push({x:j, y:i, v:this._space[i][j][this._activemark]});
      }
    }
  }
  return cells;
}

GameOfLife.prototype.next = function() {
  if (this._alivecells === 0) {
    this.emit('finish');
    return 0;
  }

  var perf = new golPerf();
  var changes = [];
  
  var cstep = this._activemark;
  var nstep = 1 - cstep;

  for(var i=0; i<this._rows; i++) {
    for(var j=0; j<this._cols; j++) {
      var total = 0;
      for(var k=0; k<nb_diffs.length; k++) {
        var nb_x = j + nb_diffs[k].x;
        var nb_y = i + nb_diffs[k].y;
        if (this._toroidal) {
          if (nb_y < 0) { nb_y += this._rows; }
          else if (nb_y >= this._rows) { nb_y -= this._rows; }
          if (nb_x < 0) { nb_x += this._cols; }
          else if (nb_x >= this._cols) { nb_x -= this._cols; }
        } else {
          if (nb_y < 0 || nb_y >= this._rows) continue;
          if (nb_x < 0 || nb_x >= this._cols) continue;  
        }
        total = total + this._space[nb_y][nb_x][cstep];
      }

      this._space[i][j][nstep] = this._space[i][j][cstep];

      // Any live cell with fewer than two live neighbours dies, 
      // as if caused by under-population.
      if (this._space[i][j][cstep] == 1 && total < 2) {
        this._space[i][j][nstep] = 0;
        this._alivecells--;
        changes.push({x:j, y:i, v: 0});
        continue;
      }

      // Any live cell with two or three live neighbours lives on 
      // to the next generation.
      if (this._space[i][j][cstep] == 1 && (total == 2 || total == 3)) {
        this._space[i][j][nstep] = 1;
        continue;
      }

      // Any live cell with more than three live neighbours dies, 
      // as if by overcrowding.
      if (this._space[i][j][cstep] == 1 && total > 3) {
        this._space[i][j][nstep] = 0;
        this._alivecells--;
        changes.push({x:j, y:i, v: 0});
        continue;
      }

      // Any dead cell with exactly three live neighbours becomes 
      // a live cell, as if by reproduction.
      if (this._space[i][j][cstep] == 0 && total == 3) {
        this._space[i][j][nstep] = 1;
        this._alivecells++;
        changes.push({x:j, y:i, v: 1});
        continue;
      }
    }
  }

  this._activemark = nstep;
  this._totalsteps++;

  this.emit('change', changes, perf.stop());
}

GameOfLife.prototype.reset = function() {
  this.emit('change', _common_clear(this));
}

var _common_apply_pattern = function(self, origin, pattern, changes) {
  changes = changes || [];

  var dim = golUtil.getMatrixDimension(pattern);
  if (dim.cols && dim.rows) {
    for(var i=0; i<dim.rows; i++) {
      for(var j=0; j<dim.cols; j++) {
        var x = origin.x + j;
        var y = origin.y + i;
        if (0 <= x && x < self._cols && 0 <= y && y < self._rows) {
          if (pattern[i][j] != self._space[y][x][self._activemark]) {
            changes.push({x:x, y:y, v:pattern[i][j]});
          }
          self._alivecells += (pattern[i][j] - self._space[y][x][self._activemark]);
          self._space[y][x][self._activemark] = pattern[i][j];
        }
      }
    }
  }

  return changes;
}

var _common_seed = function(self, cells, changes) {
  cells = cells || [];
  changes = changes || [];

  for(var k=0; k<cells.length; k++) {
    var x = cells[k].x;
    var y = cells[k].y;
    if (0 <= x && x < self._cols && 0 <= y && y < self._rows) {
      if (cells[k].v != self._space[y][x][self._activemark]) {
        changes.push({x:x, y:y, v:cells[k].v});  
      }
      self._alivecells += (cells[k].v - self._space[y][x][self._activemark]);
      self._space[y][x][self._activemark] = cells[k].v;
    }
  }

  return changes;
}

// Clear all alive cells of Space.
//
// @private
// @type {Function}
var _common_clear = function(self, changes) {
  changes = changes || [];

  for(var i=0; i<self._rows; i++) {
    for(var j=0; j<self._cols; j++) {
      if (self._space[i][j][self._activemark] > 0) {
        self._space[i][j][self._activemark] = 0;
        changes.push({x:j, y:i, v: self._space[i][j][self._activemark]});
      }
    }
  }

  self._totalsteps = 0;
  self._alivecells = 0;

  return changes;
}

// The GameOfLife model that stored Space (the world of cells), state 
// of the game (includes the number of steps, number of alive cells, ...).
//
// @public
// @module ./lib/gol-engine.js
// @type   {Constructor}
// @param  {Object} The initialized parameters:
//   - rows: Number of rows of Space.
//   - cols: Number of columns of Space.
//   - cells: List of cells to initialize.
//   - matrix: Initializing cells in matrix format.
//
// @usage
//   var GOL = require('./lib/gol-engine.js')
//   var gol = new GOL({
//     cols: 40, rows: 25,
//     cells: [
//      {x:0, y:0, v:1},
//      {x:1, y:1, v:1},
//      {x:2, y:2, v:1},
//      {x:3, y:3, v:1},
//      {x:4, y:4, v:1},
//    ]
//   });
module.exports = GameOfLife;