/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { createReadStream } from "fs"
import { checkStream } from "is-mime"
import { mkdir, rm } from "fs/promises"
import { ffmpeg } from "../src"

const types = ["image/png", "image/jpeg", "image/gif", "video/webm"]

beforeEach(async () => {
  await mkdir(`${__dirname}/media/output`, { recursive: true })
})

afterEach(async () => {
  await rm(`${__dirname}/media/output`, { force: true, recursive: true })
})

test("should do simple streamed conversion", async () => {
  const converter = ffmpeg()

  createReadStream(`${__dirname}/media/cat.jpg`).pipe(
    converter.input({ f: "image2pipe", vcodec: "mjpeg" }),
  )

  converter
    .output({ f: "image2", vcodec: "png" })
    .pipe(checkStream(types))
    .on("end", function (this: any) {
      expect(this.mimetype).toBe("image/png")
    })

  await converter.run()
})

test("should do simple buffered conversion", async () => {
  const converter = ffmpeg()

  createReadStream(`${__dirname}/media/cat.jpg`).pipe(
    converter.input({ f: "image2pipe", vcodec: "mjpeg", buffer: true }),
  )

  converter
    .output({ f: "image2", vcodec: "png", buffer: true })
    .pipe(checkStream(types))
    .on("end", function (this: any) {
      expect(this.mimetype).toBe("image/png")
    })

  await converter.run()
})

test("should do file to stream conversion", async () => {
  const converter = ffmpeg()

  converter.input(`${__dirname}/media/cat.jpg`)

  converter
    .output({ f: "image2", vcodec: "png" })
    .pipe(checkStream(types))
    .on("end", function (this: any) {
      expect(this.mimetype).toBe("image/png")
    })

  await converter.run()
})

test("should do stream to file conversion", async () => {
  const converter = ffmpeg()

  createReadStream(`${__dirname}/media/cat.jpg`).pipe(
    converter.input({ f: "image2pipe", vcodec: "mjpeg" }),
  )

  converter.output(`${__dirname}/media/output/cat.png`)

  await converter.run()
})

test("should handle multiple stream outputs", async () => {
  const converter = ffmpeg()

  converter.input(`${__dirname}/media/cat.jpg`)

  converter
    .output({
      f: "image2",
      vcodec: "png",
      vf: "crop=50:50",
    })
    .pipe(checkStream(types))
    .on("end", function (this: any) {
      expect(this.mimetype).toBe("image/png")
    })

  converter
    .output({
      f: "image2",
      vcodec: "mjpeg",
      vf: "scale=100:100",
    })
    .pipe(checkStream(types))
    .on("end", function (this: any) {
      expect(this.mimetype).toBe("image/jpeg")
    })

  await converter.run()
})

test("should error on invalid input stream", async () => {
  const converter = ffmpeg()

  createReadStream(`${__dirname}/media/text.txt`).pipe(
    converter.input({ f: "image2pipe", vcodec: "mjpeg" }),
  )

  converter
    .output({ f: "image2", vcodec: "mjpeg" })
    .pipe(checkStream(types))
    .on("end", function (this: any) {
      expect(this.mimetype).toBeFalsy()
    })

  await expect(converter.run()).rejects.toBeTruthy()
})

test("should output empty stream on kill", done => {
  expect.assertions(1)
  const converter = ffmpeg()

  converter.input(`${__dirname}/media/cat.jpg`)

  converter
    .output({ f: "image2", vcodec: "png" })
    .pipe(checkStream(types))
    .on("end", function (this: any) {
      expect(this.mimetype).toBeFalsy()
      done()
    })

  void converter.run()
  converter.kill()
})
