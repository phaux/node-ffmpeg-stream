var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , PassThrough = require('stream').PassThrough
  , spawn = require('child_process').spawn
  , mime2ffmpeg = require('./mime2ffmpeg')
  , debug = require('debug')('ffmpeg-stream')
  , execSync = require('sync-exec')
  , FF_PATH = process.env.FFMPEG_PATH || 'ffmpeg'
  , FF_VER = version()
  , FF_NEW_OPTS = (FF_VER.major >= 2)

function version() {
	try {
		var match
		if (match = execSync(FF_PATH + ' -version').stdout
			.match(/version\s+(\w+)\.(\w+)\.(\w+)/)
		) {
			debug('ffmpeg %s', match[0]) // logs `ffmpeg version x.x.x`
			return {
				major: match[1],
				minor: match[2],
				patch: match[3],
			}
		} else throw Error('Version unknown')
	}
	catch(err) {
		debug('ffmpeg version unknown')
		return {
			major: 0,
			minor: 0,
			patch: 0,
		}
	}
}

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

Ffmpeg.prototype.input = function(opts) {

	var stream = new PassThrough()

	opts = opts || {}

	if (opts.mime) {
		var fOpts = mime2ffmpeg(opts.mime).input
		if (fOpts.format) opts['f'] = fOpts.format
		if (fOpts.acodec) opts[FF_NEW_OPTS?'c:a':'acodec'] = fOpts.acodec
		if (fOpts.vcodec) opts[FF_NEW_OPTS?'c:v':'vcodec'] = fOpts.vcodec
		delete opts.mime
	}

	this._inputs.push({
		stream: stream,
		opts: opts,
		fd: this._fd++,
	})

	return stream

}

Ffmpeg.prototype.output = function(opts) {

	var stream = new PassThrough()

	opts = opts || {}

	if (opts.mime) {
		var fOpts = mime2ffmpeg(opts.mime).output
		if (fOpts.format) opts['f'] = fOpts.format
		if (fOpts.acodec) opts[FF_NEW_OPTS?'c:a':'acodec'] = fOpts.acodec
		if (fOpts.vcodec) opts[FF_NEW_OPTS?'c:v':'vcodec'] = fOpts.vcodec
		delete opts.mime
	}

	this._outputs.push({
		stream: stream,
		opts: opts,
		fd: this._fd++,
	})

	return stream

}

Ffmpeg.prototype.run = function() {

	var self = this
	  , cmd = []
	  , stdio = ['ignore', 'ignore', 'pipe']

	for (var i = 0; i < this._inputs.length; i++) {
		var input = this._inputs[i]
		for(var opt in input.opts) {
			cmd.push('-'+opt)
			cmd.push(input.opts[opt])
		}
		cmd.push('-i')
		cmd.push('pipe:' + input.fd)
		stdio.push('pipe')
	}

	for (var i = 0; i < this._outputs.length; i++) {
		var output = this._outputs[i]
		for(var opt in output.opts) {
			cmd.push('-'+opt)
			cmd.push(output.opts[opt])
		}
		cmd.push('pipe:' + output.fd)
		stdio.push('pipe')
	}

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
			self.emit('error', new Error(
				"Transcoding failed:\n  " + self._log.join('\n  ')
			))
		}
	})

	this._inputs.forEach(function(input) {
		var fd = input.fd
		proc.stdio[input.fd].on('error', function (err) {
			debug('input %d error: %s', fd, err)
			//input.stream.emit('error', err)
		})
		proc.stdio[input.fd].on('finish', function() {
			debug('input %d finish', fd)
		})
		input.stream.pipe(proc.stdio[input.fd])
	})

	this._outputs.forEach(function(output) {
		var fd = output.fd
		proc.stdio[output.fd].on('error', function (err) {
			debug('output %d error: %s', fd, err)
			//output.stream.emit('error', err)
		})
		proc.stdio[output.fd].on('data', function(data) {
			debug('output %d data: %d bytes', fd, data.length)
		})
		proc.stdio[output.fd].on('end', function() {
			debug('output %d end', fd)
		})
		proc.stdio[output.fd].pipe(output.stream)
	})

}
