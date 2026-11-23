// (وN16) رقعات مسبقة الترجمة للـ wasm — تتنفذ قبل next build في build:cf
// (وعلى CI كلاود برضه لأن open-next.config.ts بيعيد نفس الرقع idempotent)
var __p = globalThis.process
var __fs = __p.getBuiltinModule('fs')
var __path = __p.getBuiltinModule('path')

function patchJsquashEmscripten(relPkg) {
  try {
    const src = __path.resolve(__p.cwd(), 'node_modules', relPkg)
    if (!__fs.existsSync(src)) return false
    const dst = src.replace(/\.js$/, '.cf.js')
    if (__fs.existsSync(dst)) return true
    let code = __fs.readFileSync(src, 'utf-8')
    const marker = 'function(moduleArg = {}) {'
    if (!code.includes(marker)) return false
    const cfg = "moduleArg = Object.assign({ instantiateWasm: (imports, success) => { const inst = new WebAssembly.Instance(__ffWasmMod, imports); success(inst); return inst.exports; } }, moduleArg);\n"
    code = 'import __ffWasmMod from "./' + __path.basename(src).replace(/\.js$/, '.wasm') + '";\n' + code.replace(marker, "function(moduleArg = {}) {\n" + cfg)
    __fs.writeFileSync(dst, code)
    return true
  } catch (e) { console.error('[patch-cf-glues] jsquash failed:', relPkg, e); return false }
}

function patchPngWasmBindgen(relPkg) {
  try {
    const src = __path.resolve(__p.cwd(), 'node_modules', relPkg)
    if (!__fs.existsSync(src)) return false
    const dst = src.replace(/\.js$/, '.cf.js')
    if (__fs.existsSync(dst)) return true
    let code = __fs.readFileSync(src, 'utf-8')
    const from = "input = new URL('squoosh_png_bg.wasm', import.meta.url);"
    if (!code.includes(from)) return false
    code = 'import __ffWasmMod from "./squoosh_png_bg.wasm";\n' + code.replace(from, 'input = __ffWasmMod;')
    __fs.writeFileSync(dst, code)
    return true
  } catch (e) { console.error('[patch-cf-glues] png failed:', e); return false }
}

function patchMupdf() {
  try {
    const glueSrc = __path.resolve(__p.cwd(), 'node_modules/mupdf/dist/mupdf-wasm.js')
    const glueDst = __path.resolve(__p.cwd(), 'node_modules/mupdf/dist/mupdf-wasm.cf.js')
    if (!__fs.existsSync(glueSrc)) return false
    if (!__fs.existsSync(glueDst)) {
      let code = __fs.readFileSync(glueSrc, 'utf-8')
      const head = 'var _=async function(_={}){var a,e,t=_,'
      if (!code.includes(head)) return false
      code = 'import __ffWasmMod from "./mupdf-wasm.wasm";\n' + code.replace(
        head,
        'var _=async function(_={}){_=Object.assign({instantiateWasm:function(i,s){const inst=new WebAssembly.Instance(__ffWasmMod,i);s(inst);return inst.exports}},_);var a,e,t=_,s='
      )
      const mFrom = 'm="object"==typeof process&&"object"==typeof process.versions&&"string"==typeof process.versions.node&&"renderer"!=process.type;'
      if (code.includes(mFrom)) code = code.replace(mFrom, 'm=false;')
      __fs.writeFileSync(glueDst, code)
    }
    const wrapSrc = __path.resolve(__p.cwd(), 'node_modules/mupdf/dist/mupdf.js')
    const wrapDst = __path.resolve(__p.cwd(), 'node_modules/mupdf/dist/mupdf.cf.js')
    if (!__fs.existsSync(wrapDst)) {
      let code = __fs.readFileSync(wrapSrc, 'utf-8')
      code = code.replace('import libmupdf_wasm from "./mupdf-wasm.js";', 'import libmupdf_wasm from "./mupdf-wasm.cf.js";')
      __fs.writeFileSync(wrapDst, code)
    }
    const pkgPath = __path.resolve(__p.cwd(), 'node_modules/mupdf/package.json')
    const pkg = JSON.parse(__fs.readFileSync(pkgPath, 'utf-8'))
    if (pkg.exports && !pkg.exports['./dist/mupdf.cf.js']) {
      pkg.exports['./dist/mupdf.cf.js'] = './dist/mupdf.cf.js'
      __fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, '\t'))
    }
    return true
  } catch (e) { console.error('[patch-cf-glues] mupdf failed:', e); return false }
}

var r1 = patchJsquashEmscripten('@jsquash/jpeg/codec/enc/mozjpeg_enc.js')
var r2 = patchJsquashEmscripten('@jsquash/jpeg/codec/dec/mozjpeg_dec.js')
var r3 = patchPngWasmBindgen('@jsquash/png/codec/pkg/squoosh_png.js')
var r4 = patchMupdf()
console.log('[patch-cf-glues] jpeg-enc:', r1, 'jpeg-dec:', r2, 'png:', r3, 'mupdf:', r4)
if (!r1 || !r2 || !r3 || !r4) process.exit(1)
