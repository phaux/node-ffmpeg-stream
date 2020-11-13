# FFmpeg-Stream

[![Travis](https://img.shields.io/travis/phaux/node-ffmpeg-stream)](https://travis-ci.org/phaux/node-ffmpeg-stream)
[![Codecov](https://img.shields.io/codecov/c/gh/phaux/node-ffmpeg-stream)](https://codecov.io/gh/phaux/node-ffmpeg-stream)
[![npm](https://img.shields.io/npm/v/ffmpeg-stream)](https://www.npmjs.com/package/ffmpeg-stream)

Node bindings to ffmpeg command, exposing stream based API.

[CHANGELOG](CHANGELOG.md)

**Note:** ffmpeg must be installed and available in PATH.

## Examples

```js
const { Converter } = require("ffmpeg-stream")
const { createReadStream, createWriteStream } = require("fs")

async function convert() {
  const converter = new Converter()

  // get a writable input stream and pipe an image file to it
  const input = converter.createInputStream({
    f: "image2pipe",
    vcodec: "mjpeg",
  })
  createReadStream(`${__dirname}/cat.jpg`).pipe(input)

  // create an output stream, crop/scale image, save to file via node stream
  converter
    .createOutputStream({
      f: "image2",
      vcodec: "mjpeg",
      vf: "crop=300:300,scale=100:100",
    })
    .pipe(createWriteStream(`${__dirname}/cat_thumb.jpg`))

  // same, but save to file directly from ffmpeg
  converter.createOutputToFile(`${__dirname}/cat_full.jpg`, {
    vf: "crop=300:300",
  })

  // start processing
  await converter.run()
}
```

# API

- **class** `Converter`

  Creates a new instance of the ffmpeg converter class.
  Converting won't start until `run()` method is called.

  - **method** `createInputStream(options: Options): stream.Writable`

    Defines an ffmpeg input stream.
    Remember to specify the [`f` option](https://ffmpeg.org/ffmpeg.html#Main-options), which specifies the format of the input data.
    The returned stream is a writable stream.

  - **method** `createInputFromFile(file: string, options: Options): void`

    Defines an ffmpeg input using specified path.
    This is the same as specifying an input on the command line.

  - **method** `createBufferedInputStream(options: Options): stream.Writable`

    This is a mix of `createInputStream` and `createInputFromFile`.
    It creates a temporary file and instructs ffmpeg to use it,
    then it returns a writable stream attached to that file.
    Using this method will cause a huge delay.

  - **method** `createOutputStream(options: Options): stream.Readable`

    Defines an ffmpeg output stream.
    Remember to specify the [`f` option](https://ffmpeg.org/ffmpeg.html#Main-options), which specifies the format of the output data.
    The returned stream is a readable stream.

  - **method** `createOutputToFile(file: string, options: Options): void`

    Defines an ffmpeg output using specified path.
    This is the same as specifying an output on the command line.

  - **method** `createBufferedOutputStream(options: Options): stream.Readable`

    This is a mix of `createOutputStream` and `createOutputToFile`.
    It creates a temporary file and instructs ffmpeg to use it,
    then it returns a readable stream attached to that file.
    Using this method will cause a huge delay.

  - **method** `input(file?: string, options: Options): stream.Writable | undefined`

    _DEPRECATED!_ Use one of 3 input methods above.

    This is the same as `createInputFromFile` when the file is specified,
    and `createInputStream` when it isn't,
    or `createBufferedInputStream` when also a magic option `buffer` is set to `true`.

  - **method** `output(file?: string, options: Options): stream.Readable | undefined`

    _DEPRECATED!_ Use one of the 3 output methods above.

    This is the same as `createOutputFromFile` when the file is specified,
    and `createOutputStream` when it isn't,
    or `createBufferedOutputStream` when also a magic option `buffer` is set to `true`.

  - **method** `run(): Promise<void>`

    Starts the ffmpeg process.
    Returns a Promise which resolves on normal exit or kill, but rejects on ffmpeg error.

  - **method** `kill(): void`

    Kills the ffmpeg process.

- **type** `Options`

  Object of options which you normally pass to the ffmpeg command in the terminal.
  Documentation for individual options can be found at [ffmpeg site](https://ffmpeg.org/ffmpeg.html) in audio and video category.
  For boolean options specify `true` or `false`.
  If you'd like to specify the same argument multiple times you can do so by providing an array of values. E.g. `{ map: ["0:v", "1:a"] }`

# FAQ

## How to get video duration and other stats

You can use `ffprobe` command for now. It might be implemented in the library in the future, though.

## Is there a `progress` or `onFrameEmitted` event

Currently, no.

## Error: Muxer does not support non seekable output

When getting error similar to this:

```
  [mp4 @ 0000000000e4db00] muxer does not support non seekable output
  Could not write header for output file #0 (incorrect codec parameters ?): Invalid argument
  Error initializing output stream 0:1 --
  encoded 0 frames
  Conversion failed!

    at ChildProcess.<anonymous> (<DirPath>\node_modules\ffmpeg-stream\lib\index.js:215:27)
    at emitTwo (events.js:106:13)
    at ChildProcess.emit (events.js:191:7)
    at Process.ChildProcess._handle.onexit (internal/child_process.js:215:12)
```

ffmpeg says that the combination of options you specified doesn't support streaming. You can experiment with calling ffmpeg directly and specifying `-` as output file. Maybe some other options or different format will work. Streaming sequence of JPEGs over websockets worked flawlessly for me (`f: 'mjpeg'`).

You can also use `createBufferedOutputStream`. That tells the library to save output to a temporary file and then create a node stream from that file. It wont start producing data until the conversion is complete, though.

## How to get individual frame data

You have to set output format to mjpeg and then split the stream manually by looking at the bytes. You can implement a transform stream which does this:

```js
const { Transform } = require("stream")

class ExtractFrames extends Transform {
  constructor(delimiter) {
    super({ readableObjectMode: true })
    this.delimiter = Buffer.from(delimiter, "hex")
    this.buffer = Buffer.alloc(0)
  }

  _transform(data, enc, cb) {
    // Add new data to buffer
    this.buffer = Buffer.concat([this.buffer, data])
    while (true) {
      const start = this.buffer.indexOf(this.delimiter)
      if (start < 0) break // there's no frame data at all
      const end = this.buffer.indexOf(this.delimiter, start + this.delimiter.length)
      if (end < 0) break // we haven't got the whole frame yet
      this.push(this.buffer.slice(start, end)) // emit a frame
      this.buffer = this.buffer.slice(end) // remove frame data from buffer
      if (start > 0) console.error(`Discarded ${start} bytes of invalid data`)
    }
    cb()
  }
}
```

And then use it like that:

```js
const { Converter } = require("ffmpeg-stream")

const converter = new Converter()

converter
  .createOutputStream({ f: "image2pipe", vcodec: "mjpeg" })
  .pipe(new ExtractFrames("FFD8FF")) // use jpg magic number as delimiter
  .on("data", frame => {
    /* do things with frame (instance of Buffer) */
  })
  .on("end", () => {
    /* do things on complete */
  })
  .on("error", () => {
    /* do things on error */
  })
```

## How to create an animation from a set of image files

> I have images in Amazon S3 bucket (private) so I'm using their SDK to download those.
> I get the files in Buffer objects.
> Is there any way I can use your package to create a video out of it?
>
> So far I've been downloading the files and then using the following command:
> `ffmpeg -framerate 30 -pattern_type glob -i '*.jpg' -c:v libx264 -pix_fmt yuv420p out.mp4`
>
> But now want to do it from my node js application automatically.

```js
const { Converter } = require("ffmpeg-stream")

const frames = ["frame1.jpg", "frame2.jpg", ...etc]

const converter = new Converter() // create converter

// create input writable stream
const input = converter.createInputStream({ f: "image2pipe", r: 30 })
// output to file
converter.createOutputToFile("out.mp4", {
  vcodec: "libx264",
  pix_fmt: "yuv420p",
})

// for every frame create a function that returns a promise
frames
  .map(filename => () =>
    new Promise((resolve, reject) =>
      s3
        .getObject({ Bucket: "...", Key: filename })
        .createReadStream()
        .on("end", resolve)
        .on("error", reject)
        // pipe to converter, but don't end the input yet
        .pipe(input, { end: false })
    )
  )
  // reduce into a single promise, run sequentially
  .reduce((prev, next) => prev.then(next), Promise.resolve())
  // end converter input
  .then(() => input.end())

converter.run()
```

## How to stream a video when there's data, otherwise an intermission image

You can turn your main stream into series of `jpeg` images with output format `mjpeg` and combine it with static image by repeatedly piping a single `jpeg` image when there's no data from main stream.
Then pipe it to second ffmpeg process which combines `jpeg` images into video.

```js
const fs = require("fs")
const { Converter } = require("ffmpeg-stream")

// the combining ffmpeg process
const combine = new Converter()
const combineInput = combine.createInputStream({ f: "mjpeg" })

// remember if we are streaming currently
let streaming = false

// argument should be a WebM video stream
function streamVideo(stream) {
  streaming = true

  // the splitting ffmpeg process
  const split = new Converter()

  // pipe video to splitting process
  stream.pipe(split.createInputStream({ f: "webm" }))

  // get jpegs and pipe them to combining process
  split.createOutputStream({ f: "mjpeg" }).pipe(combineInput, { end: false })

  stream.on("end", () => {
    // video stream ended
    streaming = false
  })

  split.run()
}

setInterval(() => {
  // if we are streaming - do nothing
  if (streaming) return

  // pipe a single jpeg file 30 times per second
  // into the combining process
  fs.createReadStream("intermission_pic.jpg").pipe(combineInput, { end: false })
}, 1000 / 30)

// the final output
combine.createOutputStream({ f: "whatever format you want" }).pipe(/* wherever you want */)

combine.run()
```
