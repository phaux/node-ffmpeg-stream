P = require 'bluebird'
fs = require 'fs'
P.promisifyAll fs
{PassThrough} = require 'stream'
{spawn} = require 'child_process'
debug = require('debug') 'ffmpeg-stream'
tmpNameAsync = P.promisify require('tmp').tmpName
FF_PATH = process.env.FFMPEG_PATH or 'ffmpeg'

module.exports = class Ffmpeg

  constructor: (opts) ->

    return new Ffmpeg opts unless @ instanceof Ffmpeg

    @opts = if opts instanceof Object then opts else {}

    @proc = null
    @started = false
    @killed = false

    # inputs / outputs
    @io = []


  addio: (type, file, opts) ->

    {file, opts} = file: null, opts: file if file instanceof Object
    opts = {} unless opts instanceof Object
    mode = switch
      when file then 'file'
      when !file and opts.buffer then 'buffer'
      else 'stdio'
    stream = new PassThrough unless mode is 'file'
    delete opts.buffer

    @io.push {type, mode, file, opts, stream}

    stream


  input:  (file, opts) -> @addio 'in',  file, opts

  output: (file, opts) -> @addio 'out', file, opts

  kill: ->
    @killed = true
    @proc.kill 'SIGINT' if @proc

  run: ->

    return P.reject new Error "Already started" if @started
    @started = true
    @cmd = []
    @stdio = ['ignore', 'ignore', 'pipe']

    P.resolve()
    .then =>
      p = @io
      .filter (io) -> io.mode is 'buffer'
      .map (io) ->
        tmpNameAsync prefix: 'ffmpeg-'
        .then (name) -> io.tmpfile = name
      P.all p

    .then => # build stdio arg
      fd = 3
      @io
      .filter (io) -> io.mode is 'stdio'
      .forEach (io) =>
        io.fd = fd++
        @stdio.push 'pipe'

    .then => # build command string
      mkcmd = (type) => (io) =>
        for o, v of io.opts
          unless v is false
            @cmd.push "-#{o}"
            @cmd.push v unless v is true
        @cmd.push '-i' if type is 'in'
        @cmd.push switch io.mode
          when 'file' then io.file
          when 'buffer' then io.tmpfile
          when 'stdio' then "pipe:#{io.fd}"
      @io
      .filter (io) -> io.type is 'in'
      .forEach mkcmd 'in'
      @io
      .filter (io) -> io.type is 'out'
      .forEach mkcmd 'out'

    .then => # consume all input buffered streams
      p = @io
      .filter (io) -> io.type is 'in' and io.mode is 'buffer'
      .map (io) -> new P (ok, fail) ->
        io.stream.pipe fs.createWriteStream io.tmpfile
        io.stream.on 'end', ->
          debug "input buffered stream end"
          ok()
        io.stream.on 'error', (err) ->
          debug "input buffered stream error: #{err}"
          fail err
      P.all p

    .then =>
      new P (ok, fail) =>
        # buffer last line of output in case it was incomplete
        @last = ''
        # buffer output lines for error reporting purposes
        @log = []
        # this remembers the 'section' of ffmpeg output so we can skip
        # the parts where it just prints versions of codecs
        @section = 0

        debug "spawn: #{FF_PATH} #{@cmd.join ' '}"

        @proc = spawn FF_PATH, @cmd, stdio: @stdio

        if @killed then setTimeout => @proc.kill 'SIGINT'

        # processing ffmpeg output

        @proc.stderr.setEncoding 'utf8'

        @proc.stderr.on 'data', (data) =>
          buf = @last += data
          lines = buf.split /\r\n|\n|\r/
          @last = lines.pop() # save last line to buffer
          lines.forEach (line) =>
            # skip empty lines
            return if line.match /^\s*$/
            # if not indented: increment section counter
            @section++ unless line.match /^ /
            # only log sections following the first one
            if @section >= 2
              debug "log: #{line}"
              @log.push line

        @proc.on 'error', (err) ->
          debug "error: #{err}"
          fail err

        @proc.on 'exit', (code, sig) =>
          debug "exit: code=#{code} sig=#{sig}"
          if !code or code is 255
            ok()
          else
            @log.push @last # push the last line of logs
            fail new Error "Transcoding failed:\n  " + @log.join '\n  '

        @io
        .filter (io) -> io.mode is 'stdio'
        .forEach (io) =>

          @proc.stdio[io.fd].on 'error', (err) ->
            debug "#{io.type}put stream #{io.fd} error: #{err}"
            #io.stream.emit 'error', err

          #if io.type is 'out'
          @proc.stdio[io.fd].on 'data', (data) ->
            debug "#{io.type}put stream #{io.fd} data: #{data.length} bytes"

          @proc.stdio[io.fd].on 'finish', ->
            debug "#{io.type}put stream #{io.fd} finish"

          switch io.type
            when 'in'  then io.stream.pipe @proc.stdio[io.fd]
            when 'out' then @proc.stdio[io.fd].pipe io.stream

    .then => # read all output buffered streams
      p = @io
      .filter (io) -> io.type is 'out' and io.mode is 'buffer'
      .map (io) -> new P (ok, fail) ->
        f = fs.createReadStream io.tmpfile
        f.pipe io.stream
        f.on 'end', ->
          debug "output buffered stream end"
          ok()
        f.on 'error', (err) ->
          debug "output buffered stream error: #{err}"
          fail err
      P.all p

    .then => # remove buffer files

      p = @io
      .filter (io) -> io.mode is 'buffer'
      .map (io) -> fs.unlinkAsync io.tmpfile

    .then -> return
