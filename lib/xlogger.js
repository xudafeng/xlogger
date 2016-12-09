/* ================================================================
 * xlogger by xdf(xudafeng[at]126.com)
 *
 * first created at : Sun Mar 06 2016 19:11:41 GMT+0800 (CST)
 *
 * ================================================================
 * Copyright  xdf
 *
 * Licensed under the MIT License
 * You may not use this file except in compliance with the License.
 *
 * ================================================================ */

'use strict';

var fs = require('fs');
var util = require('util');
var path = require('path');
var EOL = require('os').EOL;
var chalk = require('chalk');
var cluster = require('cluster');

var _ = require('./helper');

var COLORS = {
  5: 'red',
  4: 'yellow',
  3: 'cyan',
  2: 'green',
  1: 'green'
};

var defaultDir = path.join(__dirname, '..', '..', '..', 'logs');
var clusterInfo = (cluster.isWorker ? ' [worker:' + cluster.worker.id + ']' : ' [master]') + ' pid:' + process.pid;

function Logger(options) {
  this.debugMode = options.debugMode || _.includes(process.argv, '--verbose');
  this.closeFile = options.closeFile;
  this.logFileDir = options.logFileDir || defaultDir;
  this._init();
}

Logger.prototype._init = function() {
  _.mkdir(this.logFileDir);
};

Logger.prototype._schedule = function() {
  var stack = (new Error()).stack.split('\n');
  var reg = new RegExp('at\\s+(.*)\\s+\\((.*):(\\d*):(\\d*)\\)', 'g');
  var reg2 = new RegExp('at\\s+()(.*):(\\d*):(\\d*)', 'g');
  var arr = reg.exec(stack[4]) || reg2.exec(stack[4]);
  var data = {};
  data.path = arr[2];
  data.line = arr[3];
  data.pos = arr[4];
  data.file = path.basename(data.path);
  data.stack = stack.join(EOL);
  return data;
};

Logger.prototype._toFile = function(res, fileName) {
  if (this.closeFile) {
    return;
  }

  var date = new Date();

  var _date = _.moment(date).format('YYYY_MM_DD');

  var dailyLogPath = path.join(this.logFileDir, fileName + '-' + _date + '.log');

  if (_.moment(this.timestamp).format('YYYY_MM_DD') !== _.moment(date).format('YYYY_MM_DD')) {
    fs.writeFileSync(dailyLogPath, 'daily log at ' + _.moment(date).format('YYYY/MM/DD') + EOL);
  }

  res = '[' + _.moment(date).format('DD/MMMM/YYYY/hh:mm:ss') + ']' + res + EOL;
  fs.appendFileSync(dailyLogPath, res);
  this.timestamp = date;
};

Logger.prototype._format = function(args, stack, fileName) {
  var res = args[0];
  var match;

  if (_.isError(res)) {
    res = res.stack;
  } else if (_.isRegExp(res) || _.isBoolean(res) ||
             _.isNumber(res) || _.isNull(res) ||
             _.isUndefined(res)) {
    res = '' + res;
  } else if (_.isObject(res)) {
    res = JSON.stringify(res);
  } else {
    res = res.toString();
  }

  match = res.match(new RegExp('%s|%d|%j', 'g'));

  if (match) {
    match.forEach(function(type, index) {
      var content = args[index + 1];
      if (!content) {
        res += type;
      } else if (type === '%s') {
        res = res.replace(new RegExp('%s', 'i'), String(content));
      } else if (type === '%d') {
        res = res.replace(new RegExp('%d', 'i'), Number(content));
      } else if (type === '%j') {
        res = res.replace(new RegExp('%j', 'i'), util.inspect(content, {
          showHidden: true,
          depth: null
        }));
      }
    });
    var num = args.length - match.length - 1;

    if (num > 0) {
      while (num--) {
        res += ' ' + args[args.length - num - 1];
      }
    }
  }

  if (stack) {
    var data = this._schedule();
    res = data.file + ':' + data.line + ':' + data.pos + clusterInfo + ' ' + res;
  }

  if (fileName) {
    this._toFile(res, fileName);
  }

  return '>> ' + res;
};

Logger.prototype.info = function() {
  var res = this._format(arguments);
  console.log(chalk.cyan(res));
};

// write to digest.log
// error stack

Logger.prototype.debug = function() {
  var res = this._format(arguments, true, 'digest');
  if (!this.debugMode) {
    return;
  }
  console.log(chalk.white(res));
};

// write to digest.log
// error stack

Logger.prototype.warn = function() {
  var res = this._format(arguments, true, 'digest');
  if (!this.debugMode) {
    return;
  }
  console.log(chalk.yellow(res));
};

// write to error.log
// error stack

Logger.prototype.error = function() {
  var res = this._format(arguments, true, 'error');
  console.log(chalk.red(res));
  throw new Error(res);
};

module.exports = new Logger({});

module.exports.Logger = function(options) {
  return new Logger(options || {});
};

// restful.log

module.exports.middleware = function(options) {
  options = options || {};
  var toFile = Logger.prototype._toFile;

  return function *(next) {
    if (options.logToStd) {
      var req = '  ' + chalk.gray('<--');
      req += ' ' + chalk.bold('%s');
      req += ' ' + chalk.gray('%s');
      console.log(req, this.method, this.originalUrl);
    }

    toFile.call({
      closeFile: options.closeFile,
      logFileDir: options.logFileDir || defaultDir
    }, [this.method, this.originalUrl].join(' '), 'restful');

    yield next;

    var status = this.status;

    if (options.logToStd) {
      var s = status / 100 | 0;
      var color = COLORS[s];
      var res = '  ' + chalk.gray('-->');
      res += ' ' + chalk.bold('%s');
      res += ' ' + chalk.gray('%s');
      res += ' ' + chalk[color]('%s');
      console.log(res, this.method, this.originalUrl, status);
    }

    toFile.call({
      closeFile: options.closeFile,
      logFileDir: options.logFileDir || defaultDir
    }, [this.method, this.originalUrl, status].join(' '), 'restful');
  };
};
