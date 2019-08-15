import { spawn } from "child_process"
import { createReadStream, createWriteStream, unlink } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { PassThrough } from "stream"
import { promisify } from "util"

const debug = require("debug")("ffmpeg-stream")

async function getTmpPath(prefix = "", suffix = "") {
  const dir = tmpdir()
  const id = Math.random()
    .toString(32)
    .substr(2, 10)
  return join(dir, `${prefix}${id}${suffix}`)
}

const FF_PATH = process.env.FFMPEG_PATH || "ffmpeg"

export class ffmpeg {
  opts = null
  proc = null
  started = false
  killed = false
  cmd = []
  io = []

  stdio
  last = ""
  log = []
  section = 0

  constructor(opts = {}) {
    this.opts = opts
  }

  addio(type, file, opts) {
    let stream
    if (file instanceof Object) {
      ;({ file, opts } = { file: null, opts: file })
    }
    if (!(opts instanceof Object)) {
      opts = {}
    }
    const mode = (() => {
      switch (false) {
        case !file:
          return "file"
        case !!file || !opts.buffer:
          return "buffer"
        default:
          return "stdio"
      }
    })()
    if (mode !== "file") {
      stream = new PassThrough()
    }
    delete opts.buffer

    this.io.push({ type, mode, file, opts, stream })

    return stream
  }

  input(file, opts) {
    return this.addio("in", file, opts)
  }

  output(file, opts) {
    return this.addio("out", file, opts)
  }

  kill() {
    this.killed = true
    if (this.proc) {
      return this.proc.kill("SIGINT")
    }
  }

  run() {
    if (this.started) {
      return Promise.reject(new Error("Already started"))
    }
    this.started = true
    this.cmd = []
    this.stdio = ["ignore", "ignore", "pipe"]

    return Promise.resolve()
      .then(() => {
        const p = this.io
          .filter(io => io.mode === "buffer")
          .map(io => getTmpPath("ffmpeg-").then(name => (io.tmpfile = name)))
        return Promise.all(p)
      })
      .then(() => {
        // build stdio arg
        let fd = 3
        return this.io
          .filter(io => io.mode === "stdio")
          .forEach(io => {
            io.fd = fd++
            return this.stdio.push("pipe")
          })
      })
      .then(() => {
        // build command string
        const mkcmd = type => io => {
          for (let o in io.opts) {
            const v = io.opts[o]
            if (!(v == null) && v !== false && v !== "") {
              this.cmd.push(`-${o}`)
              if (v !== true) {
                this.cmd.push(v)
              }
            }
          }
          if (type === "in") {
            this.cmd.push("-i")
          }
          return this.cmd.push(
            (() => {
              switch (io.mode) {
                case "file":
                  return io.file
                case "buffer":
                  return io.tmpfile
                case "stdio":
                  return `pipe:${io.fd}`
              }
            })()
          )
        }
        this.io.filter(io => io.type === "in").forEach(mkcmd("in"))
        return this.io.filter(io => io.type === "out").forEach(mkcmd("out"))
      })
      .then(() => {
        // consume all input buffered streams
        const p = this.io
          .filter(io => io.type === "in" && io.mode === "buffer")
          .map(
            io =>
              new Promise(function(ok, fail) {
                io.stream.pipe(createWriteStream(io.tmpfile))
                io.stream.on("end", function() {
                  debug("input buffered stream end")
                  return ok()
                })
                return io.stream.on("error", function(err) {
                  debug(`input buffered stream error: ${err}`)
                  return fail(err)
                })
              })
          )
        return Promise.all(p)
      })
      .then(() => {
        return new Promise((ok, fail) => {
          // buffer last line of output in case it was incomplete
          this.last = ""
          // buffer output lines for error reporting purposes
          this.log = []
          // this remembers the 'section' of ffmpeg output so we can skip
          // the parts where it just prints versions of codecs
          this.section = 0

          debug(`spawn: ${FF_PATH} ${this.cmd.join(" ")}`)

          this.proc = spawn(FF_PATH, this.cmd, { stdio: this.stdio })

          if (this.killed) {
            setTimeout(() => this.proc.kill("SIGINT"))
          }

          // processing ffmpeg output

          this.proc.stderr.setEncoding("utf8")

          this.proc.stderr.on("data", data => {
            const buf = (this.last += data)
            const lines = buf.split(/\r\n|\n|\r/)
            this.last = lines.pop() // save last line to buffer
            return lines.forEach(line => {
              // skip empty lines
              if (line.match(/^\s*$/)) {
                return
              }
              // if not indented: increment section counter
              if (!line.match(/^ /)) {
                this.section++
              }
              // only log sections following the first one
              if (this.section >= 2) {
                debug(`log: ${line}`)
                return this.log.push(line)
              }
            })
          })

          this.proc.on("error", function(err) {
            debug(`error: ${err}`)
            return fail(err)
          })

          this.proc.on("exit", (code, sig) => {
            debug(`exit: code=${code} sig=${sig}`)
            if (!code || code === 255) {
              return ok()
            } else {
              this.log.push(this.last) // push the last line of logs
              return fail(
                new Error("Transcoding failed:\n  " + this.log.join("\n  "))
              )
            }
          })

          return this.io
            .filter(io => io.mode === "stdio")
            .forEach(io => {
              this.proc.stdio[io.fd].on("error", err =>
                debug(`${io.type}put stream ${io.fd} error: ${err}`)
              )
              //io.stream.emit 'error', err

              //if io.type is 'out'
              this.proc.stdio[io.fd].on("data", data =>
                debug(
                  `${io.type}put stream ${io.fd} data: ${data.length} bytes`
                )
              )

              this.proc.stdio[io.fd].on("finish", () =>
                debug(`${io.type}put stream ${io.fd} finish`)
              )

              switch (io.type) {
                case "in":
                  return io.stream.pipe(this.proc.stdio[io.fd])
                case "out":
                  return this.proc.stdio[io.fd].pipe(io.stream)
              }
            })
        })
      })
      .then(() => {
        // read all output buffered streams
        const p = this.io
          .filter(io => io.type === "out" && io.mode === "buffer")
          .map(
            io =>
              new Promise(function(ok, fail) {
                const f = createReadStream(io.tmpfile)
                f.pipe(io.stream)
                f.on("end", function() {
                  debug("output buffered stream end")
                  return ok()
                })
                return f.on("error", function(err) {
                  debug(`output buffered stream error: ${err}`)
                  return fail(err)
                })
              })
          )
        return Promise.all(p)
      })
      .then(() => {
        // remove buffer files

        let p
        return (p = this.io
          .filter(io => io.mode === "buffer")
          .map(io => promisify(unlink)(io.tmpfile)))
      })
      .then(function() {})
  }
}
