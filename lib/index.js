import debug from "debug"
import assert from "node:assert"
import { spawn } from "node:child_process"
import { createReadStream, createWriteStream } from "node:fs"
import { unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough } from "node:stream"

const dbg = debug("ffmpeg-stream")
const EXIT_CODES = [0, 255]

/**
 * A class which wraps a FFmpeg process.
 *
 * @example
 *
 * ```js
 * import { Converter } from "ffmpeg-stream"
 *
 * const converter = new Converter()
 *
 * converter.createInputFromFile("input.mp4")
 * converter.createOutputToFile("output.webm")
 *
 * await converter.run()
 * ```
 */
export class Converter {
  /**
   * @private
   */
  fdCount = 0

  /**
   * @private
   * @readonly
   * @type {ConverterPipe[]}
   */
  pipes = []

  /**
   * @private
   * @type {import("node:child_process").ChildProcess | undefined}
   */
  process

  /**
   * @private
   */
  killed = false

  /**
   * Initializes the converter.
   *
   * Remember to call {@link Converter.run} to actually start the FFmpeg process.
   *
   * @param {string} [ffmpegPath] Path to the FFmpeg executable. (default: `"ffmpeg"`)
   */
  constructor(ffmpegPath = "ffmpeg") {
    /** @private */
    this.ffmpegPath = ffmpegPath
  }

  /**
   * Defines an FFmpeg input file.
   *
   * This builds a command like the one you would normally use in the terminal.
   *
   * @param {string} file Path to the input file.
   * @param {ConverterPipeOptions} [options] FFmpeg options for this input.
   *
   * @example
   *
   * ```js
   * import { Converter } from "ffmpeg-stream"
   *
   * const converter = new Converter()
   *
   * converter.createInputFromFile("input.mp4", { r: 30 })
   * // ffmpeg -r 30 -i input.mp4 ...
   *
   * await converter.run()
   * ```
   */
  createInputFromFile(file, options = {}) {
    this.pipes.push({
      type: "input",
      options,
      file,
    })
  }

  /**
   * Defines an FFmpeg output file.
   *
   * This builds a command like the one you would normally use in the terminal.
   *
   * @param {string} file Path to the output file.
   * @param {ConverterPipeOptions} [options] FFmpeg options for this output.
   *
   * @example
   *
   * ```js
   * import { Converter } from "ffmpeg-stream"
   *
   * const converter = new Converter()
   *
   * converter.createOutputToFile("output.mp4", { vcodec: "libx264" })
   * // ffmpeg ... -vcodec libx264 output.mp4
   *
   * await converter.run()
   * ```
   */
  createOutputToFile(file, options = {}) {
    this.pipes.push({
      type: "output",
      options,
      file,
    })
  }

  /**
   * Defines an FFmpeg input stream.
   *
   * Internally, it adds a special `pipe:<number>` input argument to the FFmpeg command.
   *
   * Remember to specify the [`f` option](https://ffmpeg.org/ffmpeg.html#Main-options),
   * which specifies the format of the input data.
   *
   * @param {ConverterPipeOptions} options FFmpeg options for this input.
   * @returns {import("node:stream").Writable} A stream which will be written to the FFmpeg process' stdio.
   *
   * @example
   *
   * ```js
   * import { createReadStream } from "node:fs"
   * import { Converter } from "ffmpeg-stream"
   *
   * const converter = new Converter()
   *
   * createReadStream("input.mp4").pipe(
   *   converter.createInputStream({ f: "mp4" }),
   * )
   *
   * await converter.run()
   * ```
   */
  createInputStream(options) {
    const stream = new PassThrough()
    const fd = this.getUniqueFd()
    this.pipes.push({
      type: "input",
      options,
      file: `pipe:${fd}`,
      onSpawn: process => {
        const stdio = process.stdio[fd]
        if (stdio == null) throw Error(`input ${fd} is null`)
        debugStream(stream, `input ${fd}`)
        if (!("write" in stdio)) throw Error(`input ${fd} is not writable`)
        stream.pipe(stdio)
      },
    })

    return stream
  }

  /**
   * Defines an FFmpeg output stream.
   *
   * Internally, it adds a special `pipe:<number>` output argument to the FFmpeg command.
   *
   * Remember to specify the [`f` option](https://ffmpeg.org/ffmpeg.html#Main-options),
   * which specifies the format of the output data.
   *
   * @param {ConverterPipeOptions} options FFmpeg options for this output.
   * @returns {import("node:stream").Readable} A stream which will be read from the FFmpeg process' stdio.
   *
   * @example
   *
   * ```js
   * import { createWriteStream } from "node:fs"
   * import { Converter } from "ffmpeg-stream"
   *
   * const converter = new Converter()
   *
   * converter.createOutputStream({ f: "mp4" })
   *   .pipe(createWriteStream("output.mp4"))
   *
   * await converter.run()
   * ```
   */
  createOutputStream(options) {
    const stream = new PassThrough()
    const fd = this.getUniqueFd()
    this.pipes.push({
      type: "output",
      options,
      file: `pipe:${fd}`,
      onSpawn: process => {
        const stdio = process.stdio[fd]
        if (stdio == null) throw Error(`output ${fd} is null`)
        debugStream(stdio, `output ${fd}`)
        stdio.pipe(stream)
      },
    })
    return stream
  }

  /**
   * Defines an FFmpeg input stream from a temporary file.
   *
   * Creates a temporary file that you can write to and instructs FFmpeg to read from it.
   * Note that the actual conversion process will not start until the file is fully written.
   *
   * Use this method if the format you want to read doesn't support non-seekable input.
   *
   * @param {ConverterPipeOptions} options FFmpeg options for this input.
   * @returns {import("node:stream").Writable} A stream which will be written to the temporary file.
   */
  createBufferedInputStream(options) {
    const stream = new PassThrough()
    const file = getTmpPath("ffmpeg-")
    this.pipes.push({
      type: "input",
      options,
      file,
      onBegin: async () => {
        await new /** @type {typeof Promise<void>} */ (Promise)((resolve, reject) => {
          const writer = createWriteStream(file)
          stream.pipe(writer)
          stream.on("end", () => {
            dbg("input buffered stream end")
            resolve()
          })
          stream.on("error", err => {
            dbg(`input buffered stream error: ${err.message}`)
            reject(err)
          })
        })
      },
      onFinish: async () => {
        await unlink(file)
      },
    })
    return stream
  }

  /**
   * Defines an FFmpeg output stream to a temporary file.
   *
   * Creates a temporary file that you can read from and instructs FFmpeg to write to it.
   * Note that you will be able to read from the file only after the conversion process is finished.
   *
   * Use this method if the format you want to write doesn't support non-seekable output.
   *
   * @param {ConverterPipeOptions} options FFmpeg options for this output.
   * @returns {import("node:stream").Readable} A stream which will be read from the temporary file.
   */
  createBufferedOutputStream(options) {
    const stream = new PassThrough()
    const file = getTmpPath("ffmpeg-")
    this.pipes.push({
      type: "output",
      options,
      file,
      onFinish: async () => {
        await new /** @type {typeof Promise<void>} */ (Promise)((resolve, reject) => {
          const reader = createReadStream(file)
          reader.pipe(stream)
          reader.on("end", () => {
            dbg("output buffered stream end")
            resolve()
          })
          reader.on("error", err => {
            dbg(`output buffered stream error: ${err.message}`)
            reject(err)
          })
        })
        await unlink(file)
      },
    })
    return stream
  }

  /**
   * Starts the conversion process.
   *
   * You can use {@link Converter.kill} to cancel the conversion.
   *
   * @returns {Promise<void>} Promise which resolves on normal exit or kill, but rejects on ffmpeg error.
   */
  async run() {
    /** @type {ConverterPipe[]} */
    const pipes = []
    try {
      for (const pipe of this.pipes) {
        dbg(`prepare ${pipe.type}`)
        await pipe.onBegin?.()
        pipes.push(pipe)
      }

      const args = this.getSpawnArgs()
      const stdio = this.getStdioArg()
      dbg(`spawn: ${this.ffmpegPath} ${args.join(" ")}`)
      dbg(`spawn stdio: ${stdio.join(" ")}`)
      this.process = spawn(this.ffmpegPath, args, { stdio })
      const finished = this.handleProcess()

      for (const pipe of this.pipes) {
        pipe.onSpawn?.(this.process)
      }

      if (this.killed) {
        // the converter was already killed so stop it immediately
        this.process.kill()
      }

      await finished
    } finally {
      for (const pipe of pipes) {
        await pipe.onFinish?.()
      }
    }
  }

  /**
   * Stops the conversion process.
   */
  kill() {
    // kill the process if it already started
    this.process?.kill()
    // set the flag so it will be killed after it's initialized
    this.killed = true
  }

  /**
   * @private
   * @returns {number}
   */
  getUniqueFd() {
    return this.fdCount++ + 3
  }

  /**
   * Returns stdio pipes which can be passed to {@link spawn}.
   * @private
   * @returns {Array<"ignore" | "pipe">}
   */
  getStdioArg() {
    return [
      "ignore",
      "ignore",
      "pipe",
      .../** @type {typeof Array<"pipe">} */ (Array)(this.fdCount).fill("pipe"),
    ]
  }

  /**
   * Returns arguments which can be passed to {@link spawn}.
   * @private
   * @returns {string[]}
   */
  getSpawnArgs() {
    /** @type {string[]} */
    const args = []

    for (const pipe of this.pipes) {
      if (pipe.type !== "input") continue
      args.push(...stringifyArgs(pipe.options))
      args.push("-i", pipe.file)
    }
    for (const pipe of this.pipes) {
      if (pipe.type !== "output") continue
      args.push(...stringifyArgs(pipe.options))
      args.push(pipe.file)
    }

    return args
  }

  /**
   * @private
   */
  async handleProcess() {
    await new /** @type {typeof Promise<void>} */ (Promise)((resolve, reject) => {
      let logSectionNum = 0
      /** @type {string[]} */
      const logLines = []

      assert(this.process != null, "process should be initialized")

      if (this.process.stderr != null) {
        this.process.stderr.setEncoding("utf8")

        this.process.stderr.on(
          "data",
          /** @type {(data: string) => void} */ data => {
            const lines = data.split(/\r\n|\r|\n/u)
            for (const line of lines) {
              // skip empty lines
              if (/^\s*$/u.exec(line) != null) continue
              // if not indented: increment section counter
              if (/^\s/u.exec(line) == null) logSectionNum++
              // only log sections following the first one
              if (logSectionNum > 1) {
                dbg(`log: ${line}`)
                logLines.push(line)
              }
            }
          },
        )
      }

      this.process.on("error", err => {
        dbg(`error: ${err.message}`)
        reject(err)
      })

      this.process.on("exit", (code, signal) => {
        dbg(`exit: code=${code ?? "unknown"} sig=${signal ?? "unknown"}`)
        if (code == null) return resolve()
        if (EXIT_CODES.includes(code)) return resolve()
        const log = logLines.map(line => `  ${line}`).join("\n")
        reject(Error(`Converting failed\n${log}`))
      })
    })
  }
}

/**
 * Stringifies FFmpeg options object into command line arguments array.
 *
 * @param {ConverterPipeOptions} options
 * @returns {string[]}
 */
function stringifyArgs(options) {
  /** @type {string[]} */
  const args = []

  for (const [option, value] of Object.entries(options)) {
    if (Array.isArray(value)) {
      for (const element of value) {
        if (element != null) {
          args.push(`-${option}`)
          args.push(String(element))
        }
      }
    } else if (value != null && value !== false) {
      args.push(`-${option}`)
      if (typeof value != "boolean") {
        args.push(String(value))
      }
    }
  }

  return args
}

/**
 * Returns a random file path in the system's temporary directory.
 *
 * @param {string} [prefix]
 * @param {string} [suffix]
 */
function getTmpPath(prefix = "", suffix = "") {
  const dir = tmpdir()
  const id = Math.random().toString(32).substr(2, 10)
  return join(dir, `${prefix}${id}${suffix}`)
}

/**
 * @param {import("node:stream").Readable | import("node:stream").Writable} stream
 * @param {string} name
 */
function debugStream(stream, name) {
  stream.on("error", err => {
    dbg(`${name} error: ${err.message}`)
  })
  stream.on(
    "data",
    /** @type {(data: Buffer | string) => void} */ data => {
      dbg(`${name} data: ${data.length} bytes`)
    },
  )
  stream.on("finish", () => {
    dbg(`${name} finish`)
  })
}

/**
 * Options object for a single input or output of a {@link Converter}.
 *
 * These are the same options that you normally pass to the ffmpeg command in the terminal.
 * Documentation for individual options can be found in the [ffmpeg docs](https://ffmpeg.org/ffmpeg.html#Main-options).
 *
 * To specify a boolean option, set it to `true`.
 * To specify an option multiple times, use an array.
 * Options with nullish or `false` values are ignored.
 *
 * @example
 *
 * ```js
 * const options = { f: "image2", vcodec: "png" }
 * ```
 *
 * @typedef {Record<string, string | number | boolean | Array<string | null | undefined> | null | undefined>} ConverterPipeOptions
 */

/**
 * Data about a single input or output of a {@link Converter}.
 *
 * @ignore
 * @internal
 * @typedef {Object} ConverterPipe
 * @property {"input" | "output"} type
 * @property {ConverterPipeOptions} options
 * @property {string} file
 * @property {() => Promise<void>} [onBegin]
 * @property {(process: import("node:child_process").ChildProcess) => void} [onSpawn]
 * @property {() => Promise<void>} [onFinish]
 */
