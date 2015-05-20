var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , PassThrough = require('stream').PassThrough
  , spawn = require('child_process').spawn
  , mime2ffmpeg = require('./mime2ffmpeg')
  , debug = require('debug')('ffmpeg-stream')

inherits(Ffmpeg, EventEmitter)

module.exports = Ffmpeg

function Ffmpeg() {

	if (!(this instanceof Ffmpeg)) return new Ffmpeg()

	EventEmitter.call(this)

	this._inputs = []
	this._outputs = []
	this._fd = 3
	this._log = ''

}

Ffmpeg.prototype.input = function(opts) {

	var stream = new PassThrough()

	opts = opts || {}

	if (opts.mime) {
		var fOpts = mime2ffmpeg(opts.mime).input
		if (fOpts.format) opts['f'] = fOpts.format
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
		if (fOpts.acodec) opts['c:a'] = fOpts.acodec
		if (fOpts.vcodec) opts['c:v'] = fOpts.vcodec
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

	var bin = process.env.FFMPEG_PATH || 'ffmpeg'

	debug('spawn: %s %s', bin, cmd.join(' '))

	var proc = spawn(bin, cmd, {stdio: stdio})
	proc.stderr.setEncoding('utf8')
	proc.stderr.on('data', function(data) {
		data.split('\n').forEach(function(line) {
			debug('log: %s', line)
		})
		self._stderr += data
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
			// TODO better error message
			self.emit('error', new Error("Transcoding failed"))
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
