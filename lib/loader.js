const path = require('path')
const fs = require('fs-extra')
const chalk = require('chalk')
var loaderUtils = require("loader-utils");

let aliasMap = {
	"B": "business",
	"SFX": "components",
	"pagex": "pages",
	"_overridex": "override"
}
let aliasMapRevert = {}
for (let key in aliasMap) {
	aliasMapRevert[aliasMap[key]] = key
}

let aliasMapFramework = {
	"page": "pages",
	"SF": "components",
	"_override": "override"
}
let aliasMapFrameworkRevert = {}
for (let key in aliasMapFramework) {
	aliasMapFrameworkRevert[aliasMapFramework[key]] = key
}
module.exports = async function(content) {
	let callback = this.async();
	this.cacheable();
	let context = this;
	let options = loaderUtils.getOptions(this) || {};
	options.baseDir = options.baseDir || __dirname
	options.frameworkDir = options.frameworkDir || path.join(options.baseDir, 'framework')
	options.styleFrameworkDir = options.styleFrameworkDir || path.join(options.frameworkDir, 'style')
	options.styleDir = options.styleDir || path.join(options.baseDir, 'style')

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
				item = item.trim()
				if (/^css: *true$/.test(item)) {
					return path.join(
						isFmkByFile(file) ? options.styleFrameworkDir : options.styleDir,
						getModuleName(file) + '.css'
					)
				}
				let _isFmk = isFmkByModuleName(item)
				return path.join(
					_isFmk ? options.frameworkDir : options.baseDir,
					item
					.replace(/^(B|SFX|pagex|_overridex|SF|page|_override)/, $1 => _isFmk ? aliasMapFramework[$1] : aliasMap[$1])
					.replace(/\./g, "/") + '.js')
			})

		return data
	}

	function isFmkByFile(file) {
		return ~file.indexOf(options.frameworkDir)
	}

	function isFmkByModuleName(name) {
		return /^(SF|page|_override)\./.test(name)
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
			moduleName = moduleName.replace(RegExp("\\\\", "g"), '.')
			moduleName = moduleName.replace(
				/^(business|components|pages|override)/,
				$1 => isFmk ? aliasMapFrameworkRevert[$1] : aliasMapRevert[$1]
			)
		}
		return moduleName.replace(/\.js|\.deps$/, '')
	}
	/**
	 * deps文件解析
	 *
	 * @param {any} file
	 * @returns
	 */
	async function requireDeps(file) {
		let deps = await collectDeps(file, options)
		let ps = []
		deps.forEach(dep => {
			ps.push(fs.exists(dep).then(exists => {
				if (exists) {
					return `import ${JSON.stringify(dep)};`
				} else {
					let depFile = dep.replace(/.js$/, '.deps')
					return fs.exists(depFile).then(async exists => {
						if (exists) {
							return requireDeps(depFile)
						} else {
							context.emitWarning(new Error(chalk.yellow(`\r\n${JSON.stringify(dep)} module no found!\r\n\tplease check ${JSON.stringify(file)} deps file \r\n`)))
							context.emitWarning(new Error(chalk.yellow(`\r\n${JSON.stringify(depFile)} module no found!\r\n\tplease check ${JSON.stringify(file)} deps file \r\n`)))
							return ''
						}
					})
				}
			}))
		})
		return (await Promise.all(ps)).join('\r\n')
	}
	async function getRequire(file) {
		let ps = [requireDeps(file)]
		//相对目录下面的css文件
		let relativeCss = file.replace(/\.js$/, '.css')
		ps.push(fs.exists(relativeCss).then(exists => {
			if (exists) {
				return `import ${JSON.stringify(relativeCss)};`
			}
			return ''
		}))
		ps.push(Promise.resolve(content))
		//相对目录下面的html文件
		let relativeHtml = file.replace(/\.js$/, '.html')
		ps.push(fs.exists(relativeHtml).then(exists => {
			if (exists) {
				let moduleName = getModuleName(file)
				return `;(function(){
						let __html__ = require(${JSON.stringify(relativeHtml)})
						try{
							${moduleName}.$html= ${moduleName}.template = __html__
						}catch(e){
							if(process.env.NODE_ENV!=="production"){
								console.warn("${moduleName} is not Object,can't set property $html or template")
							}
						}
						try{
							${moduleName}.prototype.$html = __html__
						}catch(e){
							if(process.env.NODE_ENV!=="production"){
								console.warn("${moduleName} is not Function,can't set prototype.$html or prototype.template")
							}
						}
					})();`
			}
			return ''
		}))
		return (await Promise.all(ps)).join('\r\n')
	}
	let result = await getRequire(this.resourcePath)
	callback(null, result)
};
