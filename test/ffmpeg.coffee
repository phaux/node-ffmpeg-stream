{ffmpeg} = require '../'
{createReadStream} = require 'fs'
{checkStream} = require 'is-mime'
{expect} = require 'chai'

describe 'ffmpeg', ->

	types = ['image/png', 'image/jpeg', 'image/gif']

	it 'should do basic conversion', (done) ->

		converter = ffmpeg()

		createReadStream "#{__dirname}/media/cat.jpg"
		.pipe converter.input mime: 'image/jpeg'

		converter.output mime: 'image/png'
		.pipe checkStream types
		.on 'end', ->
			expect @mimetype
			.to.equal 'image/png'
			setTimeout done, 10

		converter.run()

	it 'should handle multiple outputs', (done) ->

		converter = ffmpeg()

		createReadStream "#{__dirname}/media/cat.jpg"
		.pipe converter.input mime: 'image/jpeg'

		converter.output
			mime: 'image/png'
			vf: 'crop=300:300'
		.pipe checkStream types
		.on 'end', -> expect(@mimetype).to.equal 'image/png'

		converter.output
			mime: 'image/jpeg'
			vf: 'crop=300:300,scale=100:100'
		.pipe checkStream types
		.on 'end', -> expect(@mimetype).to.equal 'image/jpeg'

		converter.on 'finish', -> setTimeout done, 10

		converter.run()

	it 'should error on invalid file', (done) ->

		converter = ffmpeg()

		createReadStream "#{__dirname}/media/empty"
		.pipe converter.input mime: 'image/jpeg'

		converter.output mime: 'image/jpeg'
		.pipe checkStream types
		.on 'end', -> expect(@mimetype).to.not.exist

		converter.on 'error', -> setTimeout done, 10

		converter.run()
