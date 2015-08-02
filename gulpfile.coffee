gulp = require 'gulp'
gutil = require 'gulp-util'
mocha = require 'gulp-mocha'
coffee = require 'gulp-coffee'

gulp.task 'coffee', ->
  gulp.src 'src/*.coffee'
  .pipe coffee(bare: true).on 'error', gutil.log
  .pipe gulp.dest 'lib/'

gulp.task 'build', ['coffee']

gulp.task 'test', ['build'], ->
  gulp.src 'test/*.coffee', read: false
  .pipe mocha timeout: 5000, bail: yes
  .on 'error', gutil.log

gulp.task 'watch', ->
  gulp.watch ['src/*.coffee', 'test/*.coffee'], ['test']

gulp.task 'default', ['test']
