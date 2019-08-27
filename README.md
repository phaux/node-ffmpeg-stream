# FFmpeg-Stream

![Travis](https://img.shields.io/travis/phaux/node-ffmpeg-stream)
![Codecov](https://img.shields.io/codecov/c/gh/phaux/node-ffmpeg-stream)
![npm](https://img.shields.io/npm/v/ffmpeg-stream)

Stream based media converting library for Node.js.

Requires ffmpeg software installed and in PATH.

## Examples

```js
const ffmpeg = require("ffmpeg-stream").ffmpeg
const fs = require("fs")

const converter = ffmpeg()

// get a writable input stream and pipe an image file to it
const input = converter.input({ f: "image2pipe", vcodec: "mjpeg" })
fs.createReadStream(`${__dirname}/cat.jpg`).pipe(input)

// create an output stream, crop/scale image, save to file via node stream
converter
  .output({ f: "image2", vcodec: "mjpeg", vf: "crop=300:300" })
  .pipe(fs.createWriteStream(__dirname + "/cat_thumb.jpg"))

// same, but save to file directly from ffmpeg
converter.output(`${__dirname}/cat_full.jpg`, { vf: "crop=300:300" })

// start processing
converter.run()
```

Example runnable scripts are in `examples/` directory.
Run them with `coffee` command (e.g. `coffee examples/file_converter`).

# API

## Class `ffmpeg()`

Creates and returns a new instance of the ffmpeg converter class.
Converting won't start until `ffmpeg.run()` method is called.

### method `ffmpeg.input(path, options)`

Defines an input.
`path` argument can be skipped or null - in such case a writable stream is returned.
The `options` argument is an object of ffmpeg option/value pairs.

Remember to specify format (`f` option) when using a stream as an input.

A special option `buffer: true` can be specified to transparently use
a temporary file instead of streaming directly to ffmpeg process.

### method `ffmpeg.output(path, options)`

Defines an output.
`path` argument can be skipped or null - in such case a readable stream is returned.
The `options` argument is an object of ffmpeg option/value pairs.

Remember to specify format (`f` option) when using a stream as an output.

A special option `buffer: true` can be specified to transparently use
a temporary file instead of streaming directly from ffmpeg process.

### method `ffmpeg.run()`

Starts the processing. Returns a Promise which resolves on normal exit or kill,
but rejects on ffmpeg error.

### method `ffmpeg.kill()`

Kills the ffmpeg process.

# Todos

- [ ] Add additional convenience APIs
  - [ ] Image resizing and thumbnail generation
  - [ ] Applying watermark to images
  - [ ] Video screenshots
- [ ] More examples
  - [ ] Streaming to HTTP response
  - [ ] POST request -> Converter -> MongoDB GridFS
- [x] Better error messages
- [ ] Emit `frame` event for each frame transcoded
- [ ] Auto-detect input format (difficult when there's no filename)
