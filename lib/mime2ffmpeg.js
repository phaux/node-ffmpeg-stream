var mimes = {
	'image/jpeg': {
		input: {
			format: 'mjpeg',
		},
		output: {
			format: 'image2',
		},
	},
	'image/png': {
		input: {
			format: 'image2pipe',
		},
		output: {
			format: 'image2',
			vcodec: 'png',
		},
	},
}

function mime2ffmpeg(mime) {

	var result = {
		input: {},
		output: {},
	}

	if (mime in mimes) {
		var opts = mimes[mime]
		if (opts.input) {
			if (opts.input.format) result.input.format = opts.input.format
		}
		if (opts.output) {
			if (opts.output.format) result.output.format = opts.output.format
			if (opts.output.acodec) result.output.acodec = opts.output.acodec
			if (opts.output.vcodec) result.output.vcodec = opts.output.vcodec
		}
	}

	return result

}

module.exports = mime2ffmpeg
