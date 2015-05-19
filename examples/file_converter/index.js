var ffmpeg = require('../../').ffmpeg
  , fs = require('fs')
  , converter, input

converter = ffmpeg()

// get a writable input stream and pipe an image file to it
input = converter.input({mime: 'image/jpeg'});
fs.createReadStream(__dirname + '/cat.jpg').pipe(input)

// create an output stream, crop image, save to file
converter.output({
	mime: 'image/jpeg',
	vf: 'crop=300:300',
})
.pipe(fs.createWriteStream(__dirname + '/cat_full.jpg'))

// same, but also resize image
converter.output({
	mime: 'image/jpeg',
	vf: 'crop=300:300,scale=100:100',
})
.pipe(fs.createWriteStream(__dirname + '/cat_thumb.jpg'))

converter.on('finish', function() {
	console.log('Transcoding finished')
})

// start processing
converter.run()
