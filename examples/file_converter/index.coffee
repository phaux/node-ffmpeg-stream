{ffmpeg} = require '../../'
fs = require 'fs'

converter = ffmpeg()

# get a writable input stream and pipe an image file to it
input = converter.input f: 'image2pipe', vcodec: 'mjpeg'
fs.createReadStream("#{__dirname}/cat.jpg").pipe input

# create an output stream, crop/scale image, save to file via node stream
converter.output
  f: 'image2', vcodec: 'mjpeg'
  vf: 'crop=300:300,scale=100:100'
.pipe fs.createWriteStream "#{__dirname}/cat_thumb.out.jpg"

# same, but save to file directly from ffmpeg
converter.output "#{__dirname}/cat_full.out.jpg", vf: 'crop=300:300'

# start processing
converter.run()
