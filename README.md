[TOC]

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
input = converter.input({mime: 'image/jpeg'});
fs.createReadStream(__dirname + '/cat.jpg').pipe(input)

// create an output stream, crop image, save to file
converter.output({
	mime: 'image/jpeg',
	vf: 'crop=300:300',
})
.pipe(fs.createWriteStream(__dirname + '/cat_full.jpg'))

// same, but also resize image
converter.output({
	mime: 'image/jpeg',
	vf: 'crop=300:300,scale=100:100',
})
.pipe(fs.createWriteStream(__dirname + '/cat_thumb.jpg'))

// start processing
converter.run()
```

Example runnable scripts are in `examples/` directory.

# API

## Class `ffmpeg()`

Creates and returns a new instance of the ffmpeg converter class.
Converting won't start until `converter.run()` is called.

### method `ffmpeg.input(options)`

Defines an input.
Returns a writable stream.
The `options` argument takes an object of ffmpeg option/value pairs.

Following extra options are available:

-	`mime` - MIME type of the input stream.
	Passing this option sets the `f` option accordingly.
	E.g. passing `image/jpeg` will add `-f mjpeg` to ffmpeg input options.

### method `ffmpeg.output(options)`

Defines an output.
Returns a readable stream.
The `options` argument takes an object of ffmpeg option/value pairs.

Following extra options are available:

-	`mime` - MIME type of the output stream.
	Passing this option sets the `f` and `c:v`/`c:a` options accordingly.
	For example passing `image/png` will add `-f image2 -c:v png` to ffmpeg output options.

### method `ffmpeg.run()`

Starts the processing.

### event `ffmpeg.on('finish', () => {…})`

Emitted when the child ffmpeg process exits without error.

### event `ffmpeg.on('error', (err) => {…})`

Emitted when the child ffmpeg process exited with an error.
The output streams are usually empty in this case.

# Todos

-	[ ] Add additional convenience APIs
	-	[ ] Image resizing and thumbnail generation
	-	[ ] Applying watermark to images
	-	[ ] Video screenshots
-	[ ] More examples
	-	[ ] Streaming to HTTP response
	-	[ ] POST request -> Converter -> MongoDB GridFS
-	[ ] Better error messages
-	[ ] Auto-detect input format (difficult when there's no filename)
