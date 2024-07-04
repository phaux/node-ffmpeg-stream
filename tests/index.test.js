import { fileTypeStream } from "file-type"
import assert from "node:assert/strict"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { afterEach, beforeEach, test } from "node:test"
import { Converter } from "../lib/index.js"

const mediaDir = `${import.meta.dirname}/media`

beforeEach(async () => {
  await mkdir(`${mediaDir}/output`, { recursive: true })
})

afterEach(async () => {
  await rm(`${mediaDir}/output`, { force: true, recursive: true })
})

void test("should do simple streamed conversion", async () => {
  const converter = new Converter()

  createReadStream(`${mediaDir}/cat.jpg`).pipe(
    converter.createInputStream({ f: "image2pipe", vcodec: "mjpeg" }),
  )

  const check = fileTypeStream(converter.createOutputStream({ f: "image2", vcodec: "png" })).then(
    stream => {
      assert.equal(stream.fileType?.mime, "image/png")
      stream.pipe(createWriteStream(`${mediaDir}/output/cat.png`))
    },
  )

  await converter.run()
  await check
})

void test("should do simple buffered conversion", async () => {
  const converter = new Converter()

  createReadStream(`${mediaDir}/cat.jpg`).pipe(
    converter.createBufferedInputStream({ f: "image2pipe", vcodec: "mjpeg" }),
  )

  const check = fileTypeStream(
    converter.createBufferedOutputStream({ f: "image2", vcodec: "png" }),
  ).then(stream => {
    assert.equal(stream.fileType?.mime, "image/png")
    stream.pipe(createWriteStream(`${mediaDir}/output/cat.png`))
  })

  await converter.run()
  await check
})

void test("should do file to stream conversion", async () => {
  const converter = new Converter()

  converter.createInputFromFile(`${mediaDir}/cat.jpg`)

  const check = fileTypeStream(converter.createOutputStream({ f: "image2", vcodec: "png" })).then(
    stream => {
      assert.equal(stream.fileType?.mime, "image/png")
      stream.pipe(createWriteStream(`${mediaDir}/output/cat.png`))
    },
  )

  await converter.run()
  await check
})

void test("should do stream to file conversion", async () => {
  const converter = new Converter()

  createReadStream(`${mediaDir}/cat.jpg`).pipe(
    converter.createInputStream({ f: "image2pipe", vcodec: "mjpeg" }),
  )

  converter.createOutputToFile(`${mediaDir}/output/cat.png`)

  await converter.run()
})

void test("should handle multiple stream outputs", async () => {
  const converter = new Converter()

  converter.createInputFromFile(`${mediaDir}/cat.jpg`, {})

  const check1 = fileTypeStream(
    converter.createOutputStream({
      f: "image2",
      vcodec: "png",
      vf: "crop=50:50",
    }),
  ).then(stream => {
    assert.equal(stream.fileType?.mime, "image/png")
    stream.pipe(createWriteStream(`${mediaDir}/output/cat1.png`))
  })

  const check2 = fileTypeStream(
    converter.createOutputStream({
      f: "image2",
      vcodec: "mjpeg",
      vf: "scale=100:100",
    }),
  ).then(stream => {
    assert.equal(stream.fileType?.mime, "image/jpeg")
    stream.pipe(createWriteStream(`${mediaDir}/output/cat2.jpg`))
  })

  await converter.run()
  await Promise.all([check1, check2])
})

void test("should error on invalid input stream", async () => {
  const converter = new Converter()

  createReadStream(`${mediaDir}/text.txt`).pipe(
    converter.createInputStream({ f: "image2pipe", vcodec: "mjpeg" }),
  )

  const check = fileTypeStream(converter.createOutputStream({ f: "image2", vcodec: "mjpeg" })).then(
    stream => {
      assert(!stream.fileType?.mime)
      stream.pipe(createWriteStream(`${mediaDir}/output/cat.jpg`))
    },
  )

  await assert.rejects(converter.run())
  await check
})

void test("should output empty stream on kill", async () => {
  const converter = new Converter()

  converter.createInputFromFile(`${mediaDir}/cat.jpg`, {})

  const check = fileTypeStream(converter.createOutputStream({ f: "image2", vcodec: "png" })).then(
    stream => {
      assert(!stream.fileType?.mime)
      stream.pipe(createWriteStream(`${mediaDir}/output/cat.png`))
    },
  )

  void converter.run()
  converter.kill()
  await check
})
