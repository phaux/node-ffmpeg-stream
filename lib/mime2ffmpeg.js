var mimes = {
  'image/jpeg': {
    input: {
      format: 'image2pipe',
      vcodec: 'mjpeg',
    },
    output: {
      format: 'image2',
      vcodec: 'mjpeg',
    },
  },
  'image/png': {
    input: {
      format: 'image2pipe',
      vcodec: 'png',
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
      if (opts.input.acodec) result.input.acodec = opts.input.acodec
      if (opts.input.vcodec) result.input.vcodec = opts.input.vcodec
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
