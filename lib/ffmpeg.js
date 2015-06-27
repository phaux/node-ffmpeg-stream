var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , PassThrough = require('stream').PassThrough
  , spawn = require('child_process').spawn
  , debug = require('debug')('ffmpeg-stream')
  , execSync = require('sync-exec')
  , FF_PATH = process.env.FFMPEG_PATH || 'ffmpeg'
  , FF_VER = (function version() {
    try {
      var match
      if (match = execSync(FF_PATH + ' -version').stdout
        .match(/version\s+(\w+)\.(\w+)\.(\w+)/)
      ) {
        return {
          major: match[1],
          minor: match[2],
          patch: match[3],
        }
      } else throw Error('Version unknown')
    }
    catch(err) {
      return {
        major: 0,
        minor: 0,
        patch: 0,
      }
    }
  })()

debug('ffmpeg version %s.%s.%s', FF_VER.major, FF_VER.minor, FF_VER.patch)

inherits(Ffmpeg, EventEmitter)

module.exports = Ffmpeg

function Ffmpeg() {

  if (!(this instanceof Ffmpeg)) return new Ffmpeg()

  EventEmitter.call(this)

  this._inputs = []
  this._outputs = []
  this._fd = 3

  // buffer last line of output in case it was incomplete
  this._buffer = ''

  // buffer output lines for error reporting purposes
  this._log = []

  // this remembers the 'section' of ffmpeg output so we can skip
  // the parts where it just prints versions of codecs
  this._logSection = 0

}

Ffmpeg.prototype.input = function(path, opts) {

  var stream = null
    , fd = null

  if (typeof path !== 'string') {
    if (!opts) opts = path
    fd = this._fd++
    path = 'pipe:' + fd
    stream = new PassThrough()
  }

  opts = opts || {}

  this._inputs.push({
    stream: stream,
    opts: opts,
    path: path,
    fd: fd,
  })

  return stream

}

Ffmpeg.prototype.output = function(path, opts) {

  var stream = null
    , fd = null

  if (typeof path !== 'string') {
    if (!opts) opts = path
    fd = this._fd++
    path = 'pipe:' + fd
    stream = new PassThrough()
  }

  opts = opts || {}

  this._outputs.push({
    stream: stream,
    opts: opts,
    path: path,
    fd: fd,
  })

  return stream

}

Ffmpeg.prototype.run = function() {

  var self = this
    , cmd = []
    , stdio = ['ignore', 'ignore', 'pipe']

  this._inputs.forEach(function(input) {
    var value
    for(var opt in input.opts) {
      if (value = input.opts[opt]) {
        cmd.push('-'+opt)
        if (value !== true) cmd.push(value)
      }
    }
    cmd.push('-i')
    cmd.push(input.path)
    if (input.stream) stdio.push('pipe')
  })

  this._outputs.forEach(function(output) {
    var value
    for(var opt in output.opts) {
      if (value = output.opts[opt]) {
        cmd.push('-'+opt)
        if (value !== true) cmd.push(value)
      }
    }
    cmd.push(output.path)
    if (output.stream) stdio.push('pipe')
  })

  debug('spawn: %s %s', FF_PATH, cmd.join(' '))

  var proc = spawn(FF_PATH, cmd, {stdio: stdio})

  // processing ffmpeg output
  proc.stderr.setEncoding('utf8')
  proc.stderr.on('data', function(data) {
    var buffer = self._buffer += data
      , lines = buffer.split(/\r\n|\n|\r/)
    self._buffer = lines.pop() // save last line to buffer
    lines.forEach(function(line) {
      // skip empty lines
      if (line.match(/^\s*$/)) return
      // if not indented: increment section counter
      if (!line.match(/^ /)) self._logSection++
      // only log sections following the first one
      if (self._logSection >= 2) {
        debug('log: %s', line)
        self._log.push(line)
      }
    })
  })

  proc.on('error', function (err) {
    debug('error: %s', err)
    self.emit('error', err)
  })

  proc.on('exit', function (code, sig) {
    debug('exit: code=%d sig=%s', code, sig)
    if (code === 0) {
      self.emit('finish')
    } else {
      self._log.push(self._buffer) // push the last line of logs
      self.emit('error', new Error(
        "Transcoding failed:\n  " + self._log.join('\n  ')
      ))
    }
  })

  this._inputs.forEach(function(input) {
    var fd = input.fd
    if (!fd) return
    proc.stdio[fd].on('error', function (err) {
      debug('input stream %d error: %s', fd, err)
      //input.stream.emit('error', err)
    })
    proc.stdio[fd].on('finish', function() {
      debug('input stream %d finish', fd)
    })
    if (input.stream) input.stream.pipe(proc.stdio[fd])
  })

  this._outputs.forEach(function(output) {
    var fd = output.fd
    if (!fd) return
    proc.stdio[fd].on('error', function (err) {
      debug('output stream %d error: %s', fd, err)
      //output.stream.emit('error', err)
    })
    proc.stdio[fd].on('data', function(data) {
      debug('output stream %d data: %d bytes', fd, data.length)
    })
    proc.stdio[fd].on('end', function() {
      debug('output stream %d end', fd)
    })
    if(output.stream) proc.stdio[fd].pipe(output.stream)
  })

}
