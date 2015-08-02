{ffmpeg} = require '../'
{createReadStream} = require 'fs'
{checkStream} = require 'is-mime'
mkdirp = require 'mkdirp'
rimraf = require 'rimraf'
{expect} = chai = require 'chai'
chai.use require 'chai-as-promised'

describe 'ffmpeg', ->

  types = ['image/png', 'image/jpeg', 'image/gif', 'video/webm']

  beforeEach (done) ->
    mkdirp "#{__dirname}/media/output", done

  afterEach (done) ->
    rimraf "#{__dirname}/media/output", done

  it 'should do simple streamed conversion', ->

    converter = ffmpeg()

    createReadStream "#{__dirname}/media/cat.jpg"
    .pipe converter.input f: 'image2pipe', vcodec: 'mjpeg'

    converter.output f: 'image2', vcodec: 'png'
    .pipe checkStream types
    .on 'end', ->
      expect @mimetype
      .to.equal 'image/png'

    converter.run()

  it 'should do simple buffered conversion', ->

    converter = ffmpeg()

    createReadStream "#{__dirname}/media/cat.jpg"
    .pipe converter.input f: 'image2pipe', vcodec: 'mjpeg', buffer: true

    converter.output f: 'image2', vcodec: 'png', buffer: true
    .pipe checkStream types
    .on 'end', ->
      expect @mimetype
      .to.equal 'image/png'

    converter.run()

  it 'should convert video', ->

    converter = ffmpeg()

    createReadStream "#{__dirname}/media/pug.gif"
    .pipe converter.input f: 'gif', buffer: true

    converter.output f: 'webm', buffer: true
    .pipe checkStream types
    .on 'end', ->
      expect @mimetype
      .to.equal 'video/webm'

    converter.run()

  it 'should do file to stream conversion', ->

    converter = ffmpeg()

    converter.input "#{__dirname}/media/cat.jpg"

    converter.output f: 'image2', vcodec: 'png'
    .pipe checkStream types
    .on 'end', ->
      expect @mimetype
      .to.equal 'image/png'

    converter.run()

  it 'should do stream to file conversion', ->

    converter = ffmpeg()

    createReadStream "#{__dirname}/media/cat.jpg"
    .pipe converter.input f: 'image2pipe', vcodec: 'mjpeg'

    converter.output "#{__dirname}/media/output/cat.png"

    converter.run()

  it 'should handle multiple stream outputs', ->

    converter = ffmpeg()

    converter.input "#{__dirname}/media/cat.jpg"

    converter.output
      f: 'image2'
      vcodec: 'png'
      vf: 'crop=50:50'
    .pipe checkStream types
    .on 'end', -> expect(@mimetype).to.equal 'image/png'

    converter.output
      f: 'image2'
      vcodec: 'mjpeg'
      vf: 'scale=100:100'
    .pipe checkStream types
    .on 'end', -> expect(@mimetype).to.equal 'image/jpeg'

    converter.run()

  it 'should error on invalid input stream', ->

    converter = ffmpeg()

    createReadStream "#{__dirname}/media/text.txt"
    .pipe converter.input f: 'image2pipe', vcodec: 'mjpeg'

    converter.output f: 'image2', vcodec: 'mjpeg'
    .pipe checkStream types
    .on 'end', -> expect(@mimetype).to.not.exist

    expect converter.run()
    .to.be.rejected
