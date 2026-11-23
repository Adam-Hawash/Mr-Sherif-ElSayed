// ============================================================
// (وN16) OpenNext — Cloudflare config + رقعات wasm مسبقة الترجمة
// ============================================================
// كلاود فلير Workers بيمنع ترجمة WebAssembly الديناميكية نهائيًا
// («Wasm code generation disallowed by embedder») — فالمكتبات اللي
// بتملود الـ wasm وقت التشغيل (emscripten fetch / wasm-bindgen URL)
// بتفشل على كلاود. الحل: بنجهز نسخ «.cf.js» من الـ glues بستاتيك
// import لملفات الـ wasm — وwrangler وقت الباندلينج بيحولها لموديولات
// WebAssembly مسبقة الترجمة (CompiledWasm) — نفس الآلية اللي حزم
// كلاود الرسمية بتشتغل بيها.
// الدوال دي بتتنفذ تلقائيًا على CI كلاود لأن open-next.config.ts
// بيتقرا أول ما `opennextjs-cloudflare build` يبدأ.
// ملاحظة: بنستخدم process.getBuiltinModule بدل import node:fs —
// لأن ايسبيلد بتاع OpenNext بيطوّع ملف الكونفج ومش بيحل بادئة node:.
// ============================================================
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

var __p: any = (globalThis as any).process
var __fs: any = __p && __p.getBuiltinModule ? __p.getBuiltinModule("fs") : null
var __path: any = __p && __p.getBuiltinModule ? __p.getBuiltinModule("path") : null

function patchJsquashEmscripten(relPkg: string): boolean {
  try {
    if (!__fs || !__path) return false
    const src = __path.resolve(__p.cwd(), "node_modules", relPkg)
    if (!__fs.existsSync(src)) return false
    const dst = src.replace(/\.js$/, ".cf.js")
    if (__fs.existsSync(dst)) return true
    let code = __fs.readFileSync(src, "utf-8");
    const marker = "function(moduleArg = {}) {";
    if (!code.includes(marker)) return false;
    const cfg = "moduleArg = Object.assign({ instantiateWasm: (imports, success) => { const inst = new WebAssembly.Instance(__ffWasmMod, imports); success(inst); return inst.exports; } }, moduleArg);\n";
    code = 'import __ffWasmMod from "./' + __path.basename(src).replace(/\.js$/, ".wasm") + '";\n' + code.replace(marker, "function(moduleArg = {}) {\n" + cfg);
    __fs.writeFileSync(dst, code);
    return true;
  } catch (e) {
    console.error("[open-next.config] patchJsquashEmscripten failed:", relPkg, e);
    return false;
  }
}

function patchPngWasmBindgen(relPkg: string): boolean {
  try {
    if (!__fs || !__path) return false
    const src = __path.resolve(__p.cwd(), "node_modules", relPkg);
    if (!__fs.existsSync(src)) return false;
    const dst = src.replace(/\.js$/, ".cf.js");
    if (__fs.existsSync(dst)) return true;
    let code = __fs.readFileSync(src, "utf-8");
    const from = "input = new URL('squoosh_png_bg.wasm', import.meta.url);";
    if (!code.includes(from)) return false;
    code =
      'import __ffWasmMod from "./squoosh_png_bg.wasm";\n' +
      code.replace(from, "input = __ffWasmMod;");
    __fs.writeFileSync(dst, code);
    return true;
  } catch (e) {
    console.error("[open-next.config] patchPngWasmBindgen failed:", e);
    return false;
  }
}

function patchMupdf(): boolean {
  try {
    if (!__fs || !__path) return false
    const glueSrc = __path.resolve(__p.cwd(), "node_modules/mupdf/dist/mupdf-wasm.js");
    const glueDst = __path.resolve(__p.cwd(), "node_modules/mupdf/dist/mupdf-wasm.cf.js");
    if (!__fs.existsSync(glueSrc)) return false;
    if (!__fs.existsSync(glueDst)) {
      let code = __fs.readFileSync(glueSrc, "utf-8");
      const head = "var _=async function(_={}){var a,e,t=_,";
      if (!code.includes(head)) return false;
      code = 'import __ffWasmMod from "./mupdf-wasm.wasm";\n' + code.replace(
        head,
        'var _=async function(_={}){_=Object.assign({instantiateWasm:function(i,s){const inst=new WebAssembly.Instance(__ffWasmMod,i);s(inst);return inst.exports}},_);var a,e,t=_,s='
      );
      /* وضع Node في الـ glue بيقع في fileURLToPath داخل workerd —
         بنوقفه نهائيًا في النسخة بتاعة كلاود (الـ wasm جاي من الـ hook) */
      const mFrom = 'm="object"==typeof process&&"object"==typeof process.versions&&"string"==typeof process.versions.node&&"renderer"!=process.type;';
      if (code.includes(mFrom)) code = code.replace(mFrom, "m=false;");
      __fs.writeFileSync(glueDst, code);
    }
    /* الـ wrapper بيتصل بالنسخة .cf */
    const wrapSrc = __path.resolve(__p.cwd(), "node_modules/mupdf/dist/mupdf.js");
    const wrapDst = __path.resolve(__p.cwd(), "node_modules/mupdf/dist/mupdf.cf.js");
    if (!__fs.existsSync(wrapDst)) {
      let code = __fs.readFileSync(wrapSrc, "utf-8");
      code = code.replace('import libmupdf_wasm from "./mupdf-wasm.js";', 'import libmupdf_wasm from "./mupdf-wasm.cf.js";');
      __fs.writeFileSync(wrapDst, code);
    }
    /* السماح باستيراد المسار الفرعي mupdf/dist/mupdf.cf.js عبر الـ exports map */
    const pkgPath = __path.resolve(__p.cwd(), "node_modules/mupdf/package.json");
    const pkg = JSON.parse(__fs.readFileSync(pkgPath, "utf-8"));
    if (pkg.exports && !pkg.exports["./dist/mupdf.cf.js"]) {
      pkg.exports["./dist/mupdf.cf.js"] = "./dist/mupdf.cf.js";
      __fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, "\t"));
    }
    return true;
  } catch (e) {
    console.error("[open-next.config] patchMupdf failed:", e);
    return false;
  }
}

patchJsquashEmscripten("@jsquash/jpeg/codec/enc/mozjpeg_enc.js");
patchJsquashEmscripten("@jsquash/jpeg/codec/dec/mozjpeg_dec.js");
patchPngWasmBindgen("@jsquash/png/codec/pkg/squoosh_png.js");
patchMupdf();

export default defineCloudflareConfig({});
