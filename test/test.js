var fs = require('fs-extra')
var path = require('path')
var jsdom = require('jsdom')
var webpack = require('webpack')
var MemoryFS = require('memory-fs')
var expect = require('chai').expect

var rawLoaderPath = path.resolve(__dirname, '../index.js')
var mfs = new MemoryFS()
var globalConfig = {
	output: {
		path: '/',
		filename: 'test.build.js'
	},
	module: {
		rules: [{
			test: /\.html$/,
			loader: "html-loader"
		}, {
			test: /\.js$/,
			use: [{
					loader: 'babel-loader'
				},
				{
					loader: rawLoaderPath,
					options: {
						styleDir: path.resolve(__dirname, './fixtures/styles'),
						baseDir: path.resolve(__dirname, './fixtures')
					},

				}
			]
		}, {
			test: /\.css$/,
			use: [{
				loader: "css-loader"
			}]
		}]
	},
	plugins: [
		new webpack.optimize.ModuleConcatenationPlugin()
	]
}

function bundle(options, next) {
	var config = Object.assign({}, globalConfig, options)
	var webpackCompiler = webpack(config)
	webpackCompiler.outputFileSystem = mfs
	webpackCompiler.run((err, stats) => {
		expect(err).to.be.null
		if (stats.compilation.errors.length) {
			stats.compilation.errors.forEach((err) => {
				console.error(err.message)
			})
		}
		if (stats.compilation.errors) {
			stats.compilation.errors.forEach(err => {
				console.error(err.message)
			})
		}
		expect(stats.compilation.errors).to.be.empty
		var content = mfs.readFileSync('/test.build.js').toString()
		// fs.writeFile(path.join(__dirname, '../dist/bundle.js'), content, err => {
		// 	if (!err) {
		next(content, stats.compilation.warnings)
		// }
		// })
	})
}

function test(options, assert) {
	bundle(options, (code, warnings) => {
		jsdom.env({
			html: '<!DOCTYPE html><html><head></head><body></body></html>',
			src: [code],
			done: (err, window) => {
				if (err) {
					console.log(err[0].data.error.stack)
					expect(err).to.be.null
				}
				assert(window)
			}
		})
	})
}

describe('deps-loader', function() {
	it('basic load deps file', done => {
		test({
			entry: './test/fixtures/basic.js'
		}, (window) => {
			var innerHTML = window.document.body.innerHTML
			expect(innerHTML).to.contain('this is basic')
			expect(innerHTML).to.contain('this is A module')
			done()
		})
	})

})