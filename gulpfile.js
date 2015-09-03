var Path = require('path');

var _ = require('underscore');
// var Babelify = require("babelify");
var Babel = require('gulp-babel');
var Gulp = require('gulp');
// var Uglify = require('gulp-uglify');

var packageObj = require('./package.json');


Gulp.task('lint', function(){
    return Gulp.src('./lib/*.js')
        .pipe( Jslint({
            node: true,
            white: true,
            'continue': true,
            bitwise: true,
            plusplus: true,
            nomen: true
        })
        .on('error', function (error) {
            console.error(String(error));
        })
    );
});



Gulp.task('transpile', function () {
    return Gulp.src('src/**/*.js')
        .pipe(Babel())
        .pipe(Gulp.dest('lib'));
});

Gulp.task('default', function(){
    // place code for your default task here
});