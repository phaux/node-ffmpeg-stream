{ffmpeg} = require '../'
{createReadStream} = require 'fs'
{checkStream} = require 'is-mime'
{expect} = require 'chai'

describe 'ffmpeg', ->

  types = ['image/png', 'image/jpeg', 'image/gif']

  it 'should do simple streamed conversion', (done) ->

    converter = ffmpeg()

    createReadStream "#{__dirname}/media/cat.jpg"
    .pipe converter.input f: 'image2pipe', vcodec: 'mjpeg'

    converter.output f: 'image2', vcodec: 'png'
    .pipe checkStream types
    .on 'end', ->
      expect @mimetype
      .to.equal 'image/png'
      setTimeout done, 10

    converter.run()

  it 'should do file to stream conversion', (done) ->

    converter = ffmpeg()

    converter.input "#{__dirname}/media/cat.jpg"

    converter.output f: 'image2', vcodec: 'png'
    .pipe checkStream types
    .on 'end', ->
      expect @mimetype
      .to.equal 'image/png'
      setTimeout done, 10

    converter.run()

  it 'should do stream to file conversion', (done) ->

    converter = ffmpeg()

    createReadStream "#{__dirname}/media/cat.jpg"
    .pipe converter.input f: 'image2pipe', vcodec: 'mjpeg'

    converter.output "#{__dirname}/media/cat.out.png"

    converter.on 'error', (err) -> done(err)
    converter.on 'finish', -> done()

    converter.run()

  it 'should handle multiple stream outputs', (done) ->

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

    converter.on 'finish', -> setTimeout done, 10

    converter.run()

  it 'should error on invalid input stream', (done) ->

    converter = ffmpeg()

    createReadStream "#{__dirname}/media/text.txt"
    .pipe converter.input f: 'image2pipe', vcodec: 'mjpeg'

    converter.output f: 'image2', vcodec: 'mjpeg'
    .pipe checkStream types
    .on 'end', -> expect(@mimetype).to.not.exist

    converter.on 'error', -> setTimeout done, 10

    converter.run()
