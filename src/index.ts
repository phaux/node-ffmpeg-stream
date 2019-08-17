import { ChildProcess, spawn, StdioOptions } from "child_process"
import { createReadStream, createWriteStream, unlink } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { PassThrough, Readable, Writable } from "stream"
import { promisify } from "util"
import { debug } from "debug"

const dbg = debug("ffmpeg-stream")
const { FFMPEG_PATH = "ffmpeg" } = process.env
const EXIT_CODES = [0, 255]

function debugStream(stream: Readable | Writable, name: string) {
  stream.on("error", err => {
    dbg(`${name} error: ${err}`)
  })
  stream.on("data", data => {
    dbg(`${name} data: ${data.length} bytes`)
  })
  stream.on("finish", () => {
    dbg(`${name} finish`)
  })
}

function getTmpPath(prefix = "", suffix = "") {
  const dir = tmpdir()
  const id = Math.random()
    .toString(32)
    .substr(2, 10)
  return join(dir, `${prefix}${id}${suffix}`)
}

type Options = Record<string, string | number | boolean | null | undefined>

function getArgs(options: Options): string[] {
  const args: string[] = []
  for (const option in options) {
    const value = options[option]
    if (value != null && value !== false) {
      args.push(`-${option}`)
      if (typeof value != "boolean") {
        args.push(String(value))
      }
    }
  }
  return args
}

interface Pipe {
  readonly type: "input" | "output"
  readonly options: Options
  readonly file: string
  onBegin?(): Promise<void>
  onSpawn?(process: ChildProcess): void
  onFinish?(): Promise<void>
}

/** @deprecated Construct [[Converter]] class directly */
export function ffmpeg() {
  return new Converter()
}

export class Converter {
  private fdCount = 0
  private pipes: Pipe[] = []
  private process?: ChildProcess

  private getUniqueFd() {
    return this.fdCount++ + 3
  }

  /** @deprecated Use [[createInputStream]] or [[createInputFromFile]] */
  input(arg0: any, arg1: any) {
    const [file, opts] =
      typeof arg0 == "string" ? [arg0, arg1] : [undefined, arg0]

    if (file != null) {
      return this.createInputFromFile(file, opts)
    }
    if (opts.buffer) {
      delete opts.buffer
      return this.createBufferedInputStream(opts)
    }
    return this.createInputStream(opts)
  }

  /** @deprecated Use [[createOutputStream]] or [[createOutputToFile]] */
  output(arg0: any, arg1: any) {
    const [file, opts] =
      typeof arg0 == "string" ? [arg0, arg1] : [undefined, arg0]

    if (file != null) {
      return this.createOutputToFile(file, opts)
    }
    if (opts.buffer) {
      delete opts.buffer
      return this.createBufferedOutputStream(opts)
    }
    return this.createOutputStream(opts)
  }

  createInputFromFile(file: string, options: Options): void {
    this.pipes.push({
      type: "input",
      options,
      file
    })
  }

  createOutputToFile(file: string, options: Options): void {
    this.pipes.push({
      type: "output",
      options,
      file
    })
  }

  createInputStream(options: Options): Writable {
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
      }
    })

    return stream
  }

  createOutputStream(options: Options): Readable {
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
      }
    })
    return stream
  }

  createBufferedInputStream(options: Options): Writable {
    const stream = new PassThrough()
    const file = getTmpPath("ffmpeg-")
    this.pipes.push({
      type: "input",
      options,
      file,
      onBegin: async () => {
        await new Promise((resolve, reject) => {
          const writer = createWriteStream(file)
          stream.pipe(writer)
          stream.on("end", () => {
            dbg("input buffered stream end")
            resolve()
          })
          stream.on("error", err => {
            dbg(`input buffered stream error: ${err}`)
            return reject(err)
          })
        })
      },
      onFinish: async () => {
        await promisify(unlink)(file)
      }
    })
    return stream
  }

  createBufferedOutputStream(options: Options): Writable {
    const stream = new PassThrough()
    const file = getTmpPath("ffmpeg-")
    this.pipes.push({
      type: "output",
      options,
      file,
      onFinish: async () => {
        await new Promise((resolve, reject) => {
          const reader = createReadStream(file)
          reader.pipe(stream)
          reader.on("end", () => {
            dbg("output buffered stream end")
            resolve()
          })
          return reader.on("error", err => {
            dbg(`output buffered stream error: ${err}`)
            reject(err)
          })
        })
        await promisify(unlink)(file)
      }
    })
    return stream
  }

  private getStdioArg(): StdioOptions {
    return [
      "ignore",
      "ignore",
      "pipe",
      ...Array<"pipe">(this.fdCount).fill("pipe")
    ]
  }

  private getSpawnArgs() {
    const stdio = this.getStdioArg()
    const command: string[] = []

    for (const pipe of this.pipes) {
      if (pipe.type != "input") continue
      command.push(...getArgs(pipe.options))
      command.push("-i", pipe.file)
    }
    for (const pipe of this.pipes) {
      if (pipe.type != "output") continue
      command.push(...getArgs(pipe.options))
      command.push(pipe.file)
    }

    return { command, stdio }
  }

  async run(): Promise<void> {
    const pipes: Pipe[] = []
    try {
      for (const pipe of this.pipes) {
        dbg(`prepare ${pipe.type}`)
        if (pipe.onBegin != null) await pipe.onBegin()
        pipes.push(pipe)
      }

      const { command, stdio } = this.getSpawnArgs()
      dbg(`spawn: ${FFMPEG_PATH} ${command.join(" ")}`)
      this.process = spawn(FFMPEG_PATH, command, { stdio })
      const finished = this.handleProcess()

      for (const pipe of this.pipes) {
        if (pipe.onSpawn != null) pipe.onSpawn(this.process)
      }

      await finished
    } finally {
      for (const pipe of pipes) {
        if (pipe.onFinish != null) await pipe.onFinish()
      }
    }
  }

  private async handleProcess() {
    await new Promise<void>((resolve, reject) => {
      let lastLogLine = ""
      let logSectionNum = 0
      const logLines: string[] = []

      if (this.process == null) return reject(Error(`Converter not started`))

      if (this.process.stderr != null) {
        this.process.stderr.setEncoding("utf8")

        this.process.stderr.on("data", data => {
          // include last line from previous event
          const buffer = (lastLogLine += data)
          const lines = buffer.split(/\r\n|\r|\n/)
          // save last line because it might be unfinished
          lastLogLine = lines.pop()!

          for (const line of lines) {
            // skip empty lines
            if (line.match(/^\s*$/)) continue
            // if not indented: increment section counter
            if (!line.match(/^ /)) logSectionNum++
            // only log sections following the first one
            if (logSectionNum >= 2) {
              dbg(`log: ${line}`)
              logLines.push(line)
            }
          }
        })
      }

      this.process.on("error", err => {
        dbg(`error: ${err}`)
        return reject(err)
      })

      this.process.on("exit", (code, signal) => {
        dbg(`exit: code=${code} sig=${signal}`)
        if (code == null) return resolve()
        if (EXIT_CODES.includes(code)) return resolve()
        const log = [...logLines, lastLogLine]
          .map(line => `  ${line}`)
          .join("\n")
        reject(Error(`Converting failed\n${log}`))
      })
    })
  }

  kill() {
    if (this.process == null) throw Error(`Converter not started`)
    this.process.kill()
  }
}
