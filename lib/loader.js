const path = require('path')
const fs = require('fs-extra')
const chalk = require('chalk')
var loaderUtils = require("loader-utils");

let aliasMap = {
	"B": "business",
	"SFX": "components",
	"pagex": "pages",
	"_override": "overrides"
}
let aliasMapRevert = {}
for (let key in aliasMap) {
	aliasMapRevert[aliasMap[key]] = key
}

let aliasMapFramework = {
	"page": "pages",
	"SF": "components",
	"override": "overrides"
}
let aliasMapFrameworkRevert = {}
for (let key in aliasMapFramework) {
	aliasMapFrameworkRevert[aliasMapFramework[key]] = key
}
module.exports = async function(content) {
	let callback = this.async();
	this.cacheable();
	let options = loaderUtils.getOptions(this) || {};
	options.baseDir = options.baseDir || __dirname
	options.frameworkDir = options.frameworkDir || path.join(options.baseDir, 'framework')
	options.styleFrameworkDir = options.styleFrameworkDir || path.join(options.frameworkDir, 'styles')
	options.styleDir = options.styleDir || path.join(options.baseDir, 'styles')

	function getDepsPath(file) {
		let reg = new RegExp(path.extname(file) + "$")
		return file.replace(reg, '.deps')
	}

	let collectDeps = async function(file) {
		let deps = []
		let p = getDepsPath(file)
		if (await fs.exists(p)) {
			let t = await resolveDeps(p, options);
			deps = deps.concat(t)
		}
		return deps
	}
	let resolveDeps = async function(file) {
		let data = await fs.readFile(file);
		data = data
			.toString()
			.split(/\r?\n/)
			.filter(item => {
				item = item.trim()
				if (/^#/.test(item)) {
					return false
				}
				return item
			})
			.map(item => {
				if (item === "css:true") {
					return path.join(
						isFmkByFile(file) ? options.styleFrameworkDir : options.styleDir,
						getModuleName(file) + '.css'
					)
				}
				let _isFmk = isFmkByModuleName(item)
				return path.join(
					_isFmk ? options.frameworkDir : options.baseDir,
					item
					.replace(/^(B|SFX|pagex|_override|SF|page|override)/, $1 => _isFmk ? aliasMapFramework[$1] : aliasMap[$1])
					.replace(/\./g, path.sep) + '.js')
			})
		return data
	}

	function isFmkByFile(file) {
		return ~file.indexOf(options.frameworkDir)
	}

	function isFmkByModuleName(name) {
		return /^(SF|page|override)\./.test(name)
	}

	function getModuleName(file) {
		let baseDir = options.baseDir;
		let isFmk = isFmkByFile(file)
		if (isFmk) {
			baseDir = options.frameworkDir
		}
		let index = file.indexOf(baseDir)

		let moduleName = path.basename(file)
		if (~index) {
			moduleName = file.substr(index + baseDir.length + 1)
			moduleName = moduleName.replace(RegExp(path.sep, "g"), '.')
			moduleName = moduleName.replace(
				/^(business|components|pages)/,
				$1 => isFmk ? aliasMapFrameworkRevert[$1] : aliasMapRevert[$1]
			)
		}
		return moduleName.replace(/\.js|\.deps$/, '')
	}


	async function getRequire(file) {
		let deps = await collectDeps(file, options)
		let ps = []
		deps.forEach(dep => {
			ps.push(fs.exists(dep).then(exists => {
				if (exists) {
					return `require("${dep}")`
				} else {
					console.log(chalk.yellow(`"${dep}" module no found! \r\n\tplease check "${file}" deps file `))
				}
				return ''
			}))
		})
		//相对目录下面的css文件
		let relativeCss = file.replace(/\.js$/, '.css')
		ps.push(fs.exists(relativeCss).then(exists => {
			if (exists) {
				return `require("${relativeCss}")`
			}
			return ''
		}))
		//相对目录下面的html文件
		let relativeHtml = file.replace(/\.js$/, '.html')
		ps.push(fs.exists(relativeHtml).then(exists => {
			if (exists) {
				let moduleName = getModuleName(file)
				return `let __html__ = require("${relativeHtml}")
        try{
         ${moduleName}.$html= ${moduleName}.template = __html__
         ${moduleName}.prototype.$html = __html__
      }catch(e){
        console.error("${moduleName} is not Object,can't set property $html or template")
      }`
			}
			return ''
		}))
		return (await Promise.all(ps)).join('\r\n')
	}
	let result = await getRequire(this.resourcePath)
	callback(null, ([result, content]).join('\r\n'))
};