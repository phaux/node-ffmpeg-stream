# FFmpeg-Stream

[![Build Status](https://travis-ci.org/phaux/node-ffmpeg-stream.svg)](https://travis-ci.org/phaux/node-ffmpeg-stream)

Stream based media converting library for Node.js.

Requires ffmpeg software installed and in PATH.

## Examples

```js
var ffmpeg = require('ffmpeg-stream').ffmpeg
  , fs = require('fs')
  , converter, input

converter = ffmpeg()

// get a writable input stream and pipe an image file to it
input = converter.input({f: 'image2pipe', vcodec: 'mjpeg'});
fs.createReadStream(__dirname + '/cat.jpg').pipe(input)

// create an output stream, crop/scale image, save to file via node stream
converter.output({
  f: 'image2', vcodec: 'mjpeg',
  vf: 'crop=300:300,scale=100:100',
})
.pipe(fs.createWriteStream(__dirname + '/cat_thumb.jpg'))

// same, but save to file directly from ffmpeg
converter.output(__dirname + '/cat_full.jpg', {vf: 'crop=300:300'})

// start processing
converter.run()
```

Example runnable scripts are in `examples/` directory.

# API

## Class `ffmpeg()`

Creates and returns a new instance of the ffmpeg converter class.
Converting won't start until `ffmpeg.run()` method is called.

### method `ffmpeg.input(path, options)`

Defines an input.
`path` argument can be skipped or null - in such case a writable stream is returned.
The `options` argument is an object of ffmpeg option/value pairs.

Remember to specify format (`f` option) when using a stream as an input.

### method `ffmpeg.output(path, options)`

Defines an output.
`path` argument can be skipped or null - in such case a readable stream is returned.
The `options` argument is an object of ffmpeg option/value pairs.

Remember to specify format (`f` option) when using a stream as an output.

The stream returned will be closed before the converter exits.

### method `ffmpeg.run()`

Starts the processing.

### event `ffmpeg.on('finish', () => {…})`

Emitted when the child ffmpeg process exits without error.
This happens after the `end` event is fired on output streams.

### event `ffmpeg.on('error', (err) => {…})`

Emitted when the child ffmpeg process exited with an error.
The output streams are usually empty in this case.

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
