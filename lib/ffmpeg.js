var EventEmitter = require('events').EventEmitter
  , inherits = require('util').inherits
  , PassThrough = require('stream').PassThrough
  , spawn = require('child_process').spawn
  , mime2ffmpeg = require('./mime2ffmpeg')

inherits(Ffmpeg, EventEmitter)

module.exports = Ffmpeg

function Ffmpeg() {

	if (!(this instanceof Ffmpeg)) return new Ffmpeg()

	EventEmitter.call(this)

	this._inputs = []
	this._outputs = []
	this._fd = 3

}

Ffmpeg.prototype.input = function(opts) {

	var stream = new PassThrough()

	opts = opts || {}

	if (opts.mime) {
		var o = mime2ffmpeg(opts.mime).input
		if (o.format) opts['f'] = o.format
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
		var o = mime2ffmpeg(opts.mime).output
		if (o.format) opts['f'] = o.format
		if (o.acodec) opts['c:a'] = o.acodec
		if (o.vcodec) opts['c:v'] = o.vcodec
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
	  , stdio = ['ignore', 'ignore', 'ignore']

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
	  , proc = spawn(bin, cmd, {stdio: stdio})

	proc.on('error', function (err) {
		self.emit('error', err)
	})
	proc.on('exit', function (code, sig) {
		if (code === 0) {
			self.emit('finish')
		} else {
			// TODO better error message
			self.emit('error', new Error("Transcoding failed"))
		}
	})

	for (var i = 0; i < this._inputs.length; i++) {
		var input = this._inputs[i]
		proc.stdio[input.fd].on('error', function (err) {
			//input.stream.emit('error', err)
		})
		input.stream.pipe(proc.stdio[input.fd])
	}

	for (var i = 0; i < this._outputs.length; i++) {
		var output = this._outputs[i]
		proc.stdio[output.fd].on('error', function (err) {
			//output.stream.emit('error', err)
		})
		proc.stdio[output.fd].pipe(output.stream)
	}

}
