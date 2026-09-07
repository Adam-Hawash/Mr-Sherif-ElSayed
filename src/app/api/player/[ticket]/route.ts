// ============================================================
// /api/player/[ticket] — مشغّل الفيديو المحمي (صفحة كاملة)
// ============================================================
// التذكرة: واحدة الاستخدام + صلاحية دقيقتين — من غيرها مفيش تشغيل.
// الصفحة دي هي الوحيدة اللي بتشوف معرف اليوتيوب/الملف — وعلى السيرفر:
//  1) معرف اليوتيوب مبيدخلش الصفحة كنص صريح — بيتشفّر (XOR + Base64)
//     وبيتفك في الذاكرة لحظة التشغيل بس، فمفيش ID في مصدر الصفحة
//     ولا في الـ DOM ولا في أي console.log.
//  2) الملفات المرفوعة بتتخدم بتوكن موقّع قصير العمر مرتبط بالطالب.
//  3) ووترمارك (مواصفات المستر): أسود بالكامل — 6 شِپات على الحواف بتدور
//     دورة ناعمة مستمرة + ووترمارك كبير في نص الخلفية شفاف بحواف سودة وبالعرض
//     + كارت اسم الطالب (بالاسم الكامل من غير قص حروف) بيطير على الحواف بس
//     + بيرجع يرسم لوحه نفسه لو اتمسح + شغال جوه ملء الشاشة.
//  4) حماية فحص: كليك يمين مقفول + F12/Ctrl+Shift+I/J/C/Ctrl+U مقفولين
//     بتنبيه لطيف + لو أدوات المطور اتفتحت الفيديو بيوقف مؤقتًا.
//  5) التقدم بيتقال للأب بـ postMessage كل 5 ثواني (مفيش أي لينك).
//  6) الجودة مثبتة على 480p بحارس مستمر (يفتح سريع + واضح + يوفر داتا).
//  7) التشغيل المضمون: مراقب متدرج (playVideo → loadVideoById → صامت)
//     + تحميل API يوتيوب بإعادة محاولة + تسجيل طلب التشغيل قبل جهوزية الـ API
//     + تكملة مشاهدة آمنة (من غير حلقة النهاية).
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { getYouTubeId, mediaIdFromPath, signVideoToken, ensurePlayTicketTable } from '@/lib/video-guard'

export const dynamic = 'force-dynamic'

function htmlEscape(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// XOR + Base64 — تشفير خفيف يمنع ظهور الـ ID كنص مقروء في المصدر
function obfuscate(plain: string): { k: string; b: string } {
  const key = crypto.randomBytes(12).toString('base64url')
  const kb = Buffer.from(key)
  const pb = Buffer.from(plain)
  const out = Buffer.alloc(pb.length)
  for (let i = 0; i < pb.length; i++) out[i] = pb[i] ^ kb[i % kb.length]
  return { k: key, b: out.toString('base64') }
}

function pageError(msg: string, status: number) {
  return new NextResponse(
    '<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{margin:0;background:#0b0b0f;color:#e5e7eb;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px;box-sizing:border-box}p{font-size:15px;line-height:1.9;max-width:420px}</style></head>' +
    '<body><p>' + htmlEscape(msg) + '</p></body></html>',
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, private' } }
  )
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ ticket: string }> }) {
  try {
    const { ticket } = await params
    const { searchParams } = new URL(request.url)
    const resume = parseFloat(searchParams.get('resume') || '0') || 0

    if (!ticket) return pageError('تذكرة التشغيل ناقصة — اقفل المشغل وافتح الفيديو من الأول.', 400)

    // self-heal: لو جدول التذاكر ناقص بنعمله الأول عشان الاستعلام ميطقعش
    await ensurePlayTicketTable()
    let row: any = null
    try {
      row = await db.playTicket.findUnique({ where: { id: ticket } })
    } catch (e) {
      // محاولة أخيرة بعد التأكد من الجدول (بقوة — لو اتمسح والموقع شغال)
      await ensurePlayTicketTable(true)
      try { row = await db.playTicket.findUnique({ where: { id: ticket } }) } catch (e2) { row = null }
    }
    if (!row) return pageError('تذكرة التشغيل مش موجودة — اقفل المشغل وافتح الفيديو من الأول.', 403)
    if (row.consumed) return pageError('تذكرة التشغيل اتاستخدمت خلاص — اقفل المشغل وافتح الفيديو من الأول.', 403)
    if (new Date(row.expiresAt).getTime() < Date.now()) return pageError('تذكرة التشغيل خلصت صلاحيتها — اقفل المشغل وافتح الفيديو من الأول.', 403)

    // استهلاك التذكرة فورًا (single-use) — إعادة فتح اللينك مش هتنفع
    await db.playTicket.update({ where: { id: ticket }, data: { consumed: true } }).catch(function () {})

    // ===== فيديوهات المعرض (gal_...) =====
    if (row.videoId && row.videoId.indexOf('gal_') === 0) {
      const galId = row.videoId.slice(4)
      let g: any = null
      try { g = await db.galleryImage.findUnique({ where: { id: galId } }) } catch (e) {}
      if (!g || !(g as any).videoUrl) return pageError('الفيديو غير موجود.', 404)
      const gYt = getYouTubeId(g.videoUrl || '')
      if (!gYt && !/\.(mp4|webm|mov|ogg)(\?|$)/i.test(g.videoUrl || '')) return pageError('الفيديو ده مفيهوش مصدر تشغيل صالح.', 415)
      var gCfg: Record<string, unknown> = {
        videoId: 'gal_' + galId,
        kind: gYt ? 'youtube' : 'file',
        resume: 0,
        wm: { enabled: false, opacity: 0, interval: 14, name: '', phone: '' },
      }
      if (gYt) { const gob = obfuscate(gYt); gCfg.blob = gob.b; gCfg.key = gob.k }
      else gCfg.fileUrl = g.videoUrl
      const gJson = JSON.stringify(gCfg).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
      return new NextResponse(PLAYER_PAGE.replace('__CFG__', gJson).replace('__TITLE__', htmlEscape(g.title || 'فيديو')), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, private, max-age=0',
          'X-Frame-Options': 'SAMEORIGIN',
          'Referrer-Policy': 'no-referrer',
        },
      })
    }

    const video = await db.video.findUnique({ where: { id: row.videoId } })
    if (!video) return pageError('الفيديو غير موجود.', 404)

    // إعدادات الووترمارك من لوحة الأدمن (SiteConfig)
    var wmEnabled = '1', wmOpacity = 55, wmInterval = 14
    try {
      const cfgs = await db.siteConfig.findMany({ where: { key: { in: ['wm_enabled', 'wm_opacity', 'wm_interval'] } } })
      for (var i = 0; i < cfgs.length; i++) {
        if (cfgs[i].key === 'wm_enabled') wmEnabled = cfgs[i].value === '0' ? '0' : '1'
        if (cfgs[i].key === 'wm_opacity') wmOpacity = Math.max(15, Math.min(95, parseInt(cfgs[i].value || '55') || 55))
        if (cfgs[i].key === 'wm_interval') wmInterval = Math.max(4, Math.min(60, parseInt(cfgs[i].value || '14') || 14))
      }
    } catch (e) {}

    // بيانات الطالب للوترمارك (الرقم المسجل بيه هو الأبرز)
    var wmName = '', wmPhone = ''
    if (row.studentId) {
      try {
        const st = await db.student.findUnique({ where: { id: row.studentId } })
        if (st) { wmName = st.name || ''; wmPhone = st.phone || '' }
      } catch (e) {}
    }

    const ytId = getYouTubeId(video.url || '')
    const mediaId = mediaIdFromPath(video.filePath || '')
    const videoIdEsc = htmlEscape(video.id)
    const titleEsc = htmlEscape(video.title || '')

    // مفيش طريقة تشغيل معروفة → صفحة خطأ
    if (!ytId && !mediaId) return pageError('الفيديو ده مفيهوش مصدر تشغيل صالح.', 415)

    // إعدادات المشغل كـ JSON آمن جوه script
    const cfg: Record<string, unknown> = {
      videoId: video.id,
      kind: ytId ? 'youtube' : 'file',
      resume: resume,
      wm: {
        enabled: wmEnabled === '1',
        opacity: wmOpacity / 100,
        interval: wmInterval,
        name: wmName,
        phone: wmPhone,
      },
    }
    if (ytId) {
      const ob = obfuscate(ytId)
      // الـ ID مش موجود كنص صريح — مقسوم مشفّر XOR
      cfg.blob = ob.b
      cfg.key = ob.k
    } else if (mediaId) {
      // توكن موقّع ساعتين مرتبط بالطالب — مكانش هيظهر غير جوه صفحة المشغل
      cfg.fileUrl = '/api/files/' + mediaId + '?token=' + signVideoToken(mediaId, row.studentId || 'anon') + '&req=' + encodeURIComponent(row.studentId || 'anon')
    }
    const cfgJson = JSON.stringify(cfg).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')

    const html = PLAYER_PAGE.replace('__CFG__', cfgJson).replace('__TITLE__', titleEsc)

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, private, max-age=0',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (error: any) {
    console.error('player route error:', error)
    return pageError('حصل خطأ في تشغيل الفيديو — جرب تاني.', 500)
  }
}

/* ============================================================
   صفحة المشغل — قالب واحد فيه كل الحماية والوترمارك
   ============================================================ */
const PLAYER_PAGE = `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="referrer" content="no-referrer">
<title>__TITLE__</title>
<style>
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
  #stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000}
  #wrap{position:relative;width:100%;max-width:100vw;background:#000;overflow:hidden}
  #wrap.fs{width:100vw;height:100vh;max-width:none}
  #yt,#fileVid{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}
  /* ===== الووترمارك (مواصفات المستر) =====
     سابتين في مكانهم: 4 على منتصفات الحواف + 2 في الزوايا (شكل سنبوكس)
     + ووترمارك كبير في نص الخلفية شفاف بحواف سودة وبالعرض — هو بس اللي بينطف ناعم
     مفيش كارت طائر — كل شِپ في مسافة كافية والبيانات جواه كلها باينة */
  .wm{position:absolute;inset:0;z-index:40;pointer-events:none;user-select:none;overflow:hidden}
  /* الووترمارك الكبير في النص — شفاف بحواف سودة، بالعرض، وهو بس اللي بيتحرك */
  #wmBig{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:41;direction:rtl;
    text-align:center;max-width:86%;white-space:normal;
    font-weight:900;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
    font-size:clamp(20px,5.6vw,72px);line-height:1.3;
    unicode-bidi:plaintext;letter-spacing:0}
  #wmBig .dx{animation:wmDriftX 17s ease-in-out infinite alternate}
  #wmBig .dy{animation:wmDriftY 11.5s ease-in-out infinite alternate-reverse}
  #wmBig .b1{display:block;color:rgba(0,0,0,.13);
    -webkit-text-stroke:1.8px rgba(0,0,0,.5);paint-order:stroke fill;
    text-shadow:0 0 18px rgba(255,255,255,.22)}
  #wmBig .b2{display:block;font-size:.36em;font-weight:800;direction:ltr;unicode-bidi:plaintext;letter-spacing:0;
    color:rgba(0,0,0,.13);-webkit-text-stroke:1.2px rgba(0,0,0,.45);paint-order:stroke fill}
  @keyframes wmDriftX{0%{transform:translateX(-1.1em)}100%{transform:translateX(1.1em)}}
  @keyframes wmDriftY{0%{transform:translateY(-.6em)}100%{transform:translateY(.6em)}}
  /* الشِپات الصغيرة — سابتين في مكانهم، مفيش أي حركة خالص */
  .wmChip{position:absolute;z-index:44;direction:rtl;text-align:center}
  .wmChip .in{display:inline-block;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.20);
    color:rgba(255,255,255,.95);font-size:clamp(8.5px,1.05vw,11px);font-weight:700;font-family:system-ui,-apple-system,sans-serif;
    padding:3px 11px;border-radius:999px;white-space:nowrap;letter-spacing:0;overflow:hidden;
    text-shadow:0 1px 2px rgba(0,0,0,.8);unicode-bidi:plaintext}
  .wmChip .short{display:none}
  @media (max-width:640px){
    .wmChip .in{font-size:8.5px;padding:2px 8px;border-radius:999px}
    /* على الموبايل: الجانبية والزوايا تعرض الرقم بس عشان مفيش تداخل */
    .wmChip.compact .full{display:none}
    .wmChip.compact .short{display:inline}
  }
  /* درع فوق بيقفل شريط عنوان يوتيوب اللي بيظهر لحظة الوقوف */
  #topShield{position:absolute;top:0;left:0;right:0;height:60px;z-index:22;pointer-events:none;opacity:0;transition:opacity .35s;
    background:linear-gradient(to bottom,rgba(0,0,0,.92),rgba(0,0,0,.55) 55%,rgba(0,0,0,0))}
  #fsBtn{position:absolute;bottom:10px;left:10px;z-index:50;width:40px;height:40px;border-radius:10px;border:0;cursor:pointer;
    background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;opacity:.75}
  #fsBtn:hover{opacity:1;background:rgba(0,0,0,.75)}
  /* ===== كنترولز بتاعتنا (بدون أي شكل يوتيوب) ===== */
  #tapLayer{position:absolute;inset:0;z-index:20;background:transparent}
  #ytCtrl{position:absolute;bottom:0;left:0;right:0;z-index:30;display:flex;align-items:center;gap:9px;direction:rtl;
    padding:10px 12px 12px;background:linear-gradient(to top,rgba(0,0,0,.85),rgba(0,0,0,.5) 65%,transparent);transition:opacity .3s}
  #ytCtrl.hide{opacity:0;pointer-events:none}
  #ppBtn,#fsInBar{width:38px;height:38px;border-radius:10px;border:0;background:rgba(255,255,255,.16);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto}
  #ppBtn:hover,#fsInBar:hover{background:rgba(255,255,255,.26)}
  #seek{flex:1;-webkit-appearance:none;appearance:none;height:5px;border-radius:4px;background:rgba(255,255,255,.3);outline:0;cursor:pointer;min-width:50px;margin:0}
  #seek::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.6)}
  #seek::-moz-range-thumb{width:15px;height:15px;border:0;border-radius:50%;background:#fff}
  #tTime{color:#fff;font-size:12px;font-weight:600;direction:ltr;white-space:nowrap;font-family:system-ui,sans-serif;opacity:.95}
  #centerOv{position:absolute;inset:0;z-index:25;display:none;align-items:center;justify-content:center;pointer-events:none}
  #centerOv .big{width:72px;height:72px;border-radius:50%;background:rgba(0,0,0,.62);border:1px solid rgba(255,255,255,.28);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 4px 24px rgba(0,0,0,.55)}
  #startOv{position:absolute;inset:0;z-index:35;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(2,2,8,.92);cursor:pointer}
  #startOv .big{width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;color:#fff}
  #startOv p{color:#fff;font-size:14px;font-weight:700;margin:0;font-family:system-ui,sans-serif}
  #endOv{position:absolute;inset:0;z-index:36;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(2,2,8,.94)}
  #endOv p{color:#fff;font-size:16px;font-weight:800;margin:0;font-family:system-ui,sans-serif}
  #endOv button{padding:10px 20px;border-radius:10px;border:0;background:rgba(255,255,255,.16);color:#fff;font-weight:700;font-size:14px;cursor:pointer}
  /* باتش مكان لوجو يوتيوب (تحت يمين) — أسود شفاف مع كارت الطالب فوقه */
  #logoPatch{position:absolute;bottom:8px;right:8px;z-index:26;width:110px;height:40px;border-radius:10px;background:rgba(0,0,0,.55);pointer-events:none}
  /* ===== حماية الفحص ===== */
  #devshield{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(5,5,10,.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
  #devshield .box{text-align:center;color:#e5e7eb;direction:rtl;padding:24px}
  #devshield .box .ic{font-size:44px;margin-bottom:10px}
  #devshield .box p{font-size:16px;font-weight:700;line-height:2;margin:0}
  #devshield .box small{display:block;margin-top:6px;color:#9ca3af;font-size:12px}
  #toast{position:fixed;top:18px;right:50%;transform:translateX(50%);z-index:10000;background:rgba(20,20,28,.95);color:#fff;
    border:1px solid rgba(255,255,255,.18);padding:10px 18px;border-radius:12px;font-size:13px;font-weight:600;direction:rtl;
    opacity:0;pointer-events:none;transition:opacity .25s;box-shadow:0 6px 24px rgba(0,0,0,.5)}
  #toast.show{opacity:1}
</style>
</head>
<body>
<div id="stage"><div id="wrap"></div></div>
<div id="devshield"><div class="box"><div class="ic">🛡️</div><p>وضع الفحص مش مسموح هنا</p><small>اقفل أدوات المطوّر عشان تكمل مشاهدة الفيديو</small></div></div>
<div id="toast"></div>
<script>
'use strict';
var CFG = __CFG__;
/* ===== أدوات ===== */
var wrap = document.getElementById('wrap');
var toastTimer = null;
function toast(msg){ var t=document.getElementById('toast'); t.textContent=msg; t.className='show'; if(toastTimer)clearTimeout(toastTimer); toastTimer=setTimeout(function(){t.className='';},2200); }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ===== فك تشفير معرف اليوتيوب في الذاكرة بس ===== */
function deobfuscate(b64, key){
  try{
    // الإصلاح المهم: السيرفر بيعمل XOR بالبايتات الخام لنص المفتاح نفسه
    // (المفتاح base64url — atob بترفضه وبترجع غلط فالفيديو مش بيفتح أبدًا).
    // بنستخدم نص المفتاح زي ما هو كباد XOR — مطابق تمامًا للسيرفر.
    var kb = String(key), pb = atob(b64), out = '';
    for(var i=0;i<pb.length;i++){ out += String.fromCharCode(pb.charCodeAt(i) ^ kb.charCodeAt(i % kb.length)); }
    return out;
  }catch(e){ return ''; }
}

/* ===== الووترمارك (مواصفات المستر النهائية) =====
   • الست شِپات سابتين في مكانهم مفيش حاجة بتتحرك:
     4 على الخطوط (منتصف فوق + منتصف تحت + منتصف شمال + منتصف يمين)
     + 2 في الزوايا (شكل السنبوكس): فوق شمال + تحت يمين
     كل واحدة في مسافة كافية — البيانات جوه كلها باينة
   • ووترمارك كبير واحد في نص الخلفية: شفاف بحواف سودة وبالعرض —
     وهو **البس** اللي بيتحرك (نطفة ناعمة مستمرة)
   • الاسم كامل 100% من غير قص أي حرف — ممنوع letter-spacing
     وpaint-order:stroke عشان الحواف السودة متاكلش الحروف */
var WM_SPOTS = [
  {t:'2.4%', l:'50%',   tx:'-50%',  ty:'0%'},   /* 1) منتصف الخط العلوي */
  {t:'2.4%', l:'1.8%',  tx:'0%',    ty:'0%'},   /* 2) الزاوية فوق شمال */
  {t:'50%',  l:'1.8%',  tx:'0%',    ty:'-50%'}, /* 3) منتصف الخط الشمال */
  {t:'50%',  l:'98.2%', tx:'-100%', ty:'-50%'}, /* 4) منتصف الخط اليمين */
  {b:'2.4%', l:'50%',   tx:'-50%',  ty:'0%'},   /* 5) منتصف الخط السفلي */
  {b:'2.4%', l:'98.2%', tx:'-100%', ty:'0%'}    /* 6) الزاوية تحت يمين */
];
var chipEls = [];
var wmName = String(CFG.wm.name || '').trim();
var wmPhone = String(CFG.wm.phone || '').trim();
function wmChipText(){ return [wmPhone, wmName].filter(Boolean).join(' • '); }
function applySpot(el, p){
  if(p.b != null){ el.style.top = 'auto'; el.style.bottom = p.b; }
  else { el.style.bottom = 'auto'; el.style.top = p.t; }
  el.style.left = p.l;
  el.style.transform = 'translate(' + (p.tx || '0%') + ',' + (p.ty || '0%') + ')';
}
function buildWm(){
  if(!CFG.wm.enabled) return;
  var old = document.getElementById('wm');
  if(old) old.parentNode.removeChild(old);
  chipEls = [];
  var layer = document.createElement('div');
  layer.id = 'wm'; layer.className = 'wm';
  /* 1) الووترمارك الكبير في نص الخلفية — شفاف بحواف سودة وبالعرض — هو بس اللي بيتحرك */
  var bigLine1 = wmName || wmPhone;
  var bigLine2 = (wmName && wmPhone) ? wmPhone : '';
  if(bigLine1){
    var big = document.createElement('div');
    big.id = 'wmBig';
    big.innerHTML = '<div class="dx"><div class="dy"><span class="b1">' + esc(bigLine1) + '</span>' + (bigLine2 ? '<span class="b2">' + esc(bigLine2) + '</span>' : '') + '</div></div>';
    big.style.opacity = String(Math.min(1, (Number(CFG.wm.opacity) || 0.55) * 1.15));
    layer.appendChild(big);
  }
  /* 2) الست شِپات على الحواف — سابتين في مكانهم بالظبط، مفيش أي حركة */
  var chipText = wmChipText();
  if(chipText){
    for(var ci = 0; ci < WM_SPOTS.length; ci++){
      var chip = document.createElement('div');
      /* على الموبايل الشِپات الجانبية والزوايا تعرض الرقم بس عشان مفيش تداخل */
      chip.className = 'wmChip' + ((ci !== 0 && ci !== 4) ? ' compact' : '');
      applySpot(chip, WM_SPOTS[ci]);
      chip.style.opacity = String(Math.min(1, (Number(CFG.wm.opacity) || 0.55) + 0.05));
      var inner = document.createElement('span');
      inner.className = 'in';
      inner.innerHTML = '<span class="full">' + esc(chipText) + '</span><span class="short">' + esc(wmPhone) + '</span>';
      chip.appendChild(inner);
      layer.appendChild(chip);
      chipEls.push(chip);
    }
  }
  wrap.appendChild(layer);
}
/* درع الشريط العلوي — بيتعمل مرة واحدة بس (حتى لو الووترمارك مطفي) */
function ensureTopShield(){
  if(document.getElementById('topShield')) return;
  var ts = document.createElement('div'); ts.id='topShield'; wrap.appendChild(ts);
}
/* self-heal: الووترمارك بيرجع يترسم لو حد شاله من الـ DOM */
function ensureWm(){
  if(!CFG.wm.enabled) return;
  if(!document.getElementById('wm')) buildWm();
  else if(document.getElementById('wm') && chipEls.length === 0 && wmChipText()) buildWm();
}
setInterval(ensureWm, 4000);
try{ new MutationObserver(ensureWm).observe(wrap, {childList:true, subtree:true}); }catch(e){}

/* ===== ملء الشاشة (الووترمارك جوه العنصر فبيفضل ظاهر) ===== */
var isFakeFs = false;
var parentFs = false;
/* لو الإناء جوه صفحة المدرسة (iframe) → الأب هو اللي بيكبّر الصندوق على
   الشاشة كلها (حقيقي أو وهمي على آيفون) — إحنا بنبعت له رسالة بس. ده بيخلي
   الفيديو يبان بالعرض 16:9 مالي الشاشة على أي موبايل، من غير حتت سودة */
var EMBEDDED = false;
try { EMBEDDED = !!(window.parent && window.parent !== window); } catch(e) { EMBEDDED = true; }
window.addEventListener('message', function(ev){
  var d = ev.data;
  if(d && d.type === 'mg_fs_state'){ parentFs = !!d.on; layoutWrap(); }
});
function isFs(){ var d=document; return !!(d.fullscreenElement || d.webkitFullscreenElement); }
/* قفل الدوران على العرض — لو اشتغل الجهاز هيلف لوحده، لو فشل الدوران القسري بالـ CSS بياخد مكانه */
function tryLockLs(){ try{ var so=screen.orientation; if(so&&so.lock){ var pr=so.lock('landscape'); if(pr&&pr.catch)pr.catch(function(){}); } }catch(e){} }
function tryUnlockLs(){ try{ var so=screen.orientation; if(so&&so.unlock)so.unlock(); }catch(e){} }
function clearRot(){
  wrap.style.position=''; wrap.style.top=''; wrap.style.left=''; wrap.style.transform='';
  wrap.style.width=''; wrap.style.height='';
}
/* ===== قص أطراف الـ iframe — يوتيوب بيرسم أي حاجة بره المنطقة الباينة ===== */
function applyYtCrop(fs){
  var h = document.getElementById('ytHost');
  if(!h) return;
  if(fs){ h.style.width='112%'; h.style.height='132%'; h.style.top='-14%'; h.style.left='-6%'; }
  else { h.style.width='110%'; h.style.height='120%'; h.style.top='-10%'; h.style.left='-5%'; }
}
function layoutWrap(){
  var fs = isFs() || isFakeFs || parentFs;
  applyYtCrop(fs);
  if(!fs){
    wrap.className='';
    clearRot();
    tryUnlockLs();
    var w = window.innerWidth, h = window.innerHeight;
    var vw = Math.min(w, 1280);
    var vh = vw * 9 / 16;
    if(vh > h){ vh = h; vw = vh * 16 / 9; }
    wrap.style.width = vw + 'px'; wrap.style.height = vh + 'px';
    return;
  }
  if(parentFs){
    /* الأب هو اللي لفّ الصندوق 90° على الموبايل الطولي — إحنا بنملّي مساحة
       الإناء بس من غير ما ندوّر تاني (الدوران المزدوج بيقلب الفيديو) */
    wrap.className='fs';
    clearRot();
    return;
  }
  tryLockLs();
  wrap.className='fs';
  var W = window.innerWidth, H = window.innerHeight;
  if(H > W){
    /* الموبايل لسه طولي (الدوران التلقائي مقفول مثلاً) → دوران قسري 90°
       عشان الفيديو + الكنترولز + الووترمارك يبانوا بالعرض على الشاشة كلها */
    wrap.style.position='fixed';
    wrap.style.width = H + 'px';
    wrap.style.height = W + 'px';
    wrap.style.top = '50%';
    wrap.style.left = '50%';
    wrap.style.transform = 'translate(-50%,-50%) rotate(90deg)';
  } else {
    clearRot();
  }
}
function toggleFs(){
  /* جوه صفحة المدرسة → الأب هو اللي بيكبّر (يشتغل على كل المتصفحات حتى آيفون) */
  if(EMBEDDED){ try{ window.parent.postMessage({type:'mg_fs_toggle'}, '*'); }catch(e){} return; }
  var d=document;
  if(isFs()){ (d.exitFullscreen||d.webkitExitFullscreen||function(){}).call(d); if(isFakeFs){ isFakeFs=false; wrap.className=''; } setTimeout(layoutWrap,80); return; }
  if(isFakeFs){ isFakeFs=false; wrap.className=''; layoutWrap(); return; }
  var req = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
  if(req){ var pr = req.call(wrap); if(pr && pr.catch) pr.catch(function(){ fakeFs(); }); }
  else fakeFs();
  /* إعادة ترتيب بعد لحظة — قفل الدوران ممكن ياخد وقت */
  setTimeout(layoutWrap, 120);
  setTimeout(layoutWrap, 600);
}
function fakeFs(){ isFakeFs = true; wrap.className='fs'; layoutWrap(); }
window.addEventListener('resize', layoutWrap);
window.addEventListener('orientationchange', function(){ setTimeout(layoutWrap, 60); });
document.addEventListener('fullscreenchange', function(){ setTimeout(layoutWrap, 60); setTimeout(layoutWrap, 500); });
document.addEventListener('keydown', function(e){ if(e.key==='Escape' && isFakeFs){ isFakeFs=false; wrap.className=''; layoutWrap(); } });

/* ===== التقدم → postMessage للأب (من غير أي لينك) ===== */
var lastCur = 0;
function reportProgress(cur, dur){
  try{ if(window.parent && window.parent !== window) window.parent.postMessage({type:'mg_vp', videoId:CFG.videoId, cur:cur, dur:dur}, '*'); }catch(e){}
}
function reportEnded(){ try{ if(window.parent && window.parent !== window) window.parent.postMessage({type:'mg_ended', videoId:CFG.videoId}, '*'); }catch(e){} }

/* ===== حماية الفحص (تنبيه لطيف) ===== */
document.addEventListener('contextmenu', function(e){ e.preventDefault(); toast('🔒 العرض محمي — كليك يمين مقفول'); });
document.addEventListener('dragstart', function(e){ e.preventDefault(); });
document.addEventListener('selectstart', function(e){ if(e.target && e.target.id !== 'toast') e.preventDefault(); });
document.addEventListener('keydown', function(e){
  var k = (e.key || '').toLowerCase();
  var blocked = false;
  if(k === 'f12') blocked = true;
  if((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) blocked = true;
  if((e.ctrlKey || e.metaKey) && (k === 'u' || k === 's')) blocked = true;
  if((e.metaKey || e.ctrlKey) && e.altKey && (k === 'i' || k === 'j' || k === 'c')) blocked = true;
  if(blocked){ e.preventDefault(); e.stopPropagation(); toast('🛡️ عرض الفيديو محمي — دي خاصية مقفولة'); }
});
var devOpen = false, wasPlayingBeforeDev = false;
// هنقيس على نافذة التاب العلوية (نفس الدومين فمسموح) — لو قسنا على الـ iframe
// نفسه الفرق الطبيعي بين مقاس الـ iframe والنافذة هيعمل إنذار كاذب
function devDelta(){
  try{
    var top = window.top;
    if(top && top.outerWidth && top.innerWidth){
      return Math.max(top.outerWidth - top.innerWidth, top.outerHeight - top.innerHeight);
    }
  }catch(e){}
  return 0;
}
var devGraceUntil = Date.now() + 2500; // مهلة عند الفتح عشان أي قياس أول تشغيل
setInterval(function(){
  var deltaOk = Date.now() > devGraceUntil && devDelta() > 180;
  if(deltaOk && !devOpen){
    devOpen = true;
    document.getElementById('devshield').style.display = 'flex';
    try{ if(playerApi){ wasPlayingBeforeDev = !playerApi.paused(); playerApi.pause(); } }catch(e){}
    try{ if(fileApi && !fileApi.paused){ wasPlayingBeforeDev = !fileApi.paused; fileApi.pause(); } }catch(e){}
  } else if(!deltaOk && devOpen){
    devOpen = false;
    document.getElementById('devshield').style.display = 'none';
    try{ if(playerApi && wasPlayingBeforeDev) playerApi.play(); }catch(e){}
    try{ if(fileApi && wasPlayingBeforeDev) fileApi.play(); }catch(e){}
  }
}, 1200);

/* ===== مشغّل يوتيوب — بدون أي شكل يوتيوب: كنترولز خاصة بينا + شاشات تغطية
   بتمنع ظهور العنوان/اللوجو نهائيًا. الـ ID بيتفك في الذاكرة بس زي ما هو ===== */
var playerApi = null;
/* ===== مراقب التشغيل — علاج "الفيديو مش بيفتح" =====
   أول أمر playVideo() على الموبايل ممكن يتصفر من المتصفح. بنجرب تاني كل
   700ms بتدرج قوي: playVideo → playVideo → loadVideoById (ضربة قوية بتقفل
   المشكلة نهائيًا) → playVideo → تشغيل صامت (مسموح دايمًا) + زرار تفعيل صوت.
   ومنع النقر المزدوج: بعض المتصفحات بتبعت touchend+click مع بعض.
   + لو الطالب دس قبل ما الـ API يجهز → الطلب بيتسجل وبيتنفذ أول ما يجهز. */
var wdTimer = null, muteFallback = false, lastTap = 0;
var pendingStart = false, pendingResume = 0, ytIdCached = '';
/* قفل الجودة 480p — عدادات الحارس */
var qMissAt = 0, qReloads = 0, lastQReload = 0;
function tapOk(){ var n = Date.now(); if(n - lastTap < 350) return false; lastTap = n; return true; }
function showUnmuteBtn(){
  var b = document.getElementById('unmuteBtn');
  if(!b){
    b = document.createElement('button');
    b.id = 'unmuteBtn'; b.type = 'button';
    b.style.cssText = 'position:absolute;top:38%;left:50%;transform:translateX(-50%);z-index:70;direction:rtl;' +
      'background:rgba(0,0,0,.8);border:1px solid rgba(255,255,255,.25);color:#fff;font-weight:700;' +
      'font-size:13px;font-family:system-ui,sans-serif;padding:10px 18px;border-radius:999px;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.55)';
    b.textContent = '🔊 اضغط لتفعيل الصوت';
    b.addEventListener('click', function(e){ e.stopPropagation(); doUnmute(); });
    b.addEventListener('touchend', function(e){ e.preventDefault(); e.stopPropagation(); doUnmute(); });
    wrap.appendChild(b);
  }
  b.style.display = 'flex';
}
function doUnmute(){
  try{ if(playerApi){ playerApi.unMute(); playerApi.setVolume && playerApi.setVolume(100); } }catch(e){}
  muteFallback = false;
  var b = document.getElementById('unmuteBtn'); if(b) b.style.display = 'none';
}
function startWithWatchdog(){
  if(!playerApi || !playerApi.playVideo){
    /* الـ API لسه بيتحمل — سجل الطلب وهيتشغل أول ما يجهز (بدل ما أول دوسة تضيع) */
    pendingStart = true;
    toast('المشغل بيتجهز… دوس تاني بعد لحظة');
    return;
  }
  if(wdTimer){ clearInterval(wdTimer); wdTimer = null; }
  try{ playerApi.playVideo(); }catch(e){}
  var attempts = 0;
  wdTimer = setInterval(function(){
    var st = ytState();
    if(st === 1 || st === 3){ clearInterval(wdTimer); wdTimer = null; return; }
    attempts++;
    if(attempts === 3){
      /* الضربة القوية: loadVideoById بيحمّل التيار من الأول وبيشتغل فورًا —
         أقوى بكتير من playVideo في المتصفحات العنيدة */
      var cur = 0; try{ cur = playerApi.getCurrentTime() || 0; }catch(e){}
      try{ playerApi.loadVideoById(ytIdCached, Math.max(0, Math.floor(cur)), 'large'); }catch(e){}
    } else if(attempts >= 5){
      clearInterval(wdTimer); wdTimer = null;
      try{ playerApi.mute(); muteFallback = true; showUnmuteBtn(); playerApi.playVideo(); }catch(e){}
    } else { try{ playerApi.playVideo(); }catch(e){} }
  }, 700);
}
function svgPlay(){ return '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>'; }
function svgPause(){ return '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>'; }
function svgFs(){ return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>'; }
function fmtT(s){ s=Math.max(0,Math.floor(s||0)); var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60; var ss=(x<10?'0':'')+x; return h? (h+':'+(m<10?'0':'')+m+':'+ss) : (m+':'+ss); }
var seekDragging = false;
function ytState(){ try{ return playerApi && playerApi.getPlayerState ? playerApi.getPlayerState() : -1; }catch(e){ return -1; } }
function setPP(playing){ var el=document.getElementById('ppBtn'); if(el) el.innerHTML = playing? svgPause():svgPlay(); var c=document.getElementById('centerOv'); if(c) c.style.display = playing? 'none':'flex'; var ts=document.getElementById('topShield'); if(ts) ts.style.opacity = playing? '0':'1'; }
var ctrlTimer = null;
function showCtrl(autohide){ var b=document.getElementById('ytCtrl'); if(!b) return; b.className=''; if(ctrlTimer)clearTimeout(ctrlTimer); if(autohide) ctrlTimer=setTimeout(function(){ if(ytState()===1) { b=document.getElementById('ytCtrl'); if(b) b.className='hide'; } }, 3200); }
function mountYouTube(){
  var ytId = deobfuscate(CFG.blob, CFG.key);
  if(!ytId){ wrap.innerHTML = '<p style="color:#fca5a5;font-family:sans-serif;padding:24px;direction:rtl">حصل خطأ في تحميل الفيديو</p>'; return; }
  // الطبقة الداخلية: iframe بيتعمله inject بالجافاسكريبت — مش مكتوب في مصدر الصفحة
  // الـ iframe مكبّر ومقصوص من كل الجهات (CROP) — أي واجهة يوتيوب (عنوان/قناة/لوجو)
  // بتترسم بره المنطقة اللي باينة خالص. المميز فوق والباتش تحت تغطية إضافية.
  var host = document.createElement('div');
  host.id = 'ytHost'; host.style.cssText = 'position:absolute;width:110%;height:120%;top:-10%;left:-5%';
  wrap.appendChild(host);
  // شاشة البداية (بتغطي أي عنوان/برanding بتاع يوتيوب لحظة التحميل)
  var startOv = document.createElement('div');
  startOv.id='startOv';
  startOv.innerHTML = '<div class="big"><svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg></div><p>اضغط للمشاهدة</p>';
  startOv.addEventListener('click', function(){ if(!tapOk()) return; startWithWatchdog(); showCtrl(true); });
  startOv.addEventListener('touchend', function(e){ e.preventDefault(); if(!tapOk()) return; startWithWatchdog(); showCtrl(true); });
  wrap.appendChild(startOv);
  // طبقة النقر — بتلقط التابات بدل ما توصل ليوتيوب
  var tap = document.createElement('div'); tap.id='tapLayer';
  tap.addEventListener('click', function(){
    if(!tapOk()) return;
    try{ if(playerApi&&playerApi.getPlayerState){ if(playerApi.getPlayerState()===YT.PlayerState.PLAYING) playerApi.pauseVideo(); else startWithWatchdog(); } }catch(e){}
    showCtrl(true);
  });
  wrap.appendChild(tap);
  // شاشة التوقف (بتغطي أي حاجة يوتيوب بيعرضها وقت الوقوف)
  var centerOv = document.createElement('div'); centerOv.id='centerOv'; centerOv.innerHTML='<div class="big">'+svgPlay()+'</div>';
  wrap.appendChild(centerOv);
  // باتش صغير فوق مكان لوجو يوتيوب (لو ظهر) — شكل خفيف مش لوجو
  var patch = document.createElement('div'); patch.id='logoPatch'; wrap.appendChild(patch);
  // شاشة النهاية (بتغطي شاشة يوتيوب النهائية بالعنوان)
  var endOv = document.createElement('div'); endOv.id='endOv';
  endOv.innerHTML = '<p>🎉 خلصت الفيديو — برافو عليك!</p><button type="button" id="replayBtn">شوفه تاني ↺</button>';
  wrap.appendChild(endOv);
  // كنترولز بتاعتنا: تشغيل/إيقاف + شريط تقدم + الوقت + ملء الشاشة
  var bar = document.createElement('div'); bar.id='ytCtrl';
  bar.innerHTML = '<button id="ppBtn" type="button" aria-label="تشغيل/إيقاف">'+svgPlay()+'</button>' +
    '<input id="seek" type="range" min="0" max="1000" step="1" value="0" aria-label="شريط التقدم">' +
    '<span id="tTime">0:00 / 0:00</span>' +
    '<button id="fsInBar" type="button" aria-label="ملء الشاشة">'+svgFs()+'</button>';
  wrap.appendChild(bar);
  var pp = document.getElementById('ppBtn');
  pp.addEventListener('click', function(e){ e.stopPropagation(); if(!tapOk()) return; try{ if(ytState()===1) playerApi.pauseVideo(); else startWithWatchdog(); }catch(err){} showCtrl(true); });
  document.getElementById('fsInBar').addEventListener('click', function(e){ e.stopPropagation(); toggleFs(); });
  document.getElementById('replayBtn').addEventListener('click', function(e){ e.stopPropagation(); try{ playerApi.seekTo(0,true); playerApi.playVideo(); }catch(err){} });
  var seekEl = document.getElementById('seek');
  seekEl.addEventListener('input', function(){ seekDragging = true; try{ var d=playerApi.getDuration()||0; document.getElementById('tTime').textContent = fmtT(seekEl.value/1000*d) + ' / ' + fmtT(d); }catch(e){} });
  seekEl.addEventListener('change', function(){ try{ var d=playerApi.getDuration()||0; if(d) playerApi.seekTo(seekEl.value/1000*d, true); }catch(e){} seekDragging=false; showCtrl(true); });
  /* تحميل API يوتيوب بشكل مضمون: الكولباك بيتحدد قبل حقن السكريبت (قفل
     سباق التحميل)، ولو السكريبت فشل يتحمل (نت ضعيف) بنحقنه تاني تلقائيًا —
     ده كان سبب حقيقي إن الفيديو مبيفتحش خالص على بعض الأجهزة */
  ytIdCached = ytId;
  function apiReadyNow(){ try{ buildPlayer(); }catch(e){} }
  if(window.YT && window.YT.Player){ apiReadyNow(); return; }
  window.onYouTubeIframeAPIReady = apiReadyNow;
  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  var apiTries = 0;
  var apiTimer = setInterval(function(){
    if(window.YT && window.YT.Player){ clearInterval(apiTimer); return; }
    apiTries++;
    if(apiTries === 14){
      /* بعد ~7 ثواني ومفيش رد → محاولة حقن تانية للسكريبت */
      var t2 = document.createElement('script');
      t2.src = 'https://www.youtube.com/iframe_api?retry=1';
      document.head.appendChild(t2);
    }
    if(apiTries >= 40){
      clearInterval(apiTimer);
      var so = document.getElementById('startOv');
      if(so){
        var pm = so.getElementsByTagName('p')[0];
        if(pm) pm.textContent = 'الاتصال بطيء — اتأكد من النت ودوس تاني';
      }
    }
  }, 500);
}

function buildPlayer(){
  var ytId = ytIdCached;
  playerApi = new YT.Player('ytHost', {
    videoId: ytId,
    // controls:0 → مفيش أي واجهة يوتيوب (لا عنوان ولا لوجو لا حاجة) — كل الكنترولز بتاعتنا
    playerVars: { autoplay:1, controls:0, rel:0, modestbranding:1, playsinline:1, iv_load_policy:3, fs:0, disablekb:1, enablejsapi:1, origin: location.origin },
    events: {
      onReady: function(ev){
        /* تكملة المشاهدة بنأجلها لأول لحظة تشغيل فعلية — أعلى أمان على الموبايل
           (الـ seek قبل التشغيل كان بعلّق المشغل في حالة cued على بعض الأجهزة) */
        try{ if(Number(CFG.resume) > 5) pendingResume = Number(CFG.resume); }catch(e){}
        try{ ev.target.setPlaybackQuality('large'); }catch(e){} /* 480p — الجودة الثابتة */
        if(pendingStart){ pendingStart = false; startWithWatchdog(); }
        layoutWrap();
      },
      onStateChange: function(ev){
        try{
          if(ev.data === YT.PlayerState.PLAYING){
            /* أول تشغيل → كمّل من آخر نقطة وصلها الطالب.
               أمان: لو النقطة المحفوظة قربت من النهاية (حتى 999999 بتاعت "خلص") → نبدأ من الأول
               عشان الفيديو ميفضلش بيدور في حلقة النهاية */
            if(pendingResume > 5){
              var rd = 0; try{ rd = playerApi.getDuration() || 0; }catch(e){}
              var posR = pendingResume;
              if(rd && posR >= rd - 5) posR = 0;
              if(posR > 0){ try{ playerApi.seekTo(posR, true); }catch(e){} }
              pendingResume = 0;
            }
            try{ ev.target.setPlaybackQuality('large'); }catch(e){} /* 480p ثابتة */
            var so=document.getElementById('startOv'); if(so) so.style.display='none';
            var eo=document.getElementById('endOv'); if(eo) eo.style.display='none';
            setPP(true); showCtrl(true);
          } else if(ev.data === YT.PlayerState.PAUSED){
            setPP(false); showCtrl(false);
          } else if(ev.data === YT.PlayerState.ENDED){
            setPP(false);
            var eo2=document.getElementById('endOv'); if(eo2) eo2.style.display='flex';
            /* رجوع للبداية + وقوف → شاشة اقتراحات يوتيوب عمرها ما بتترسم */
            try{ playerApi.seekTo(0,true); playerApi.pauseVideo(); }catch(e){}
            reportEnded();
          }
        }catch(e){}
      }
    }
  });
  setInterval(function(){
    try{
      if(playerApi && playerApi.getCurrentTime){
        var cur = playerApi.getCurrentTime() || 0, dur = playerApi.getDuration() || 0;
        reportProgress(cur, dur);
        /* حارس النهاية: لو شاشة الاقتراحات هتظهر (ENDED ماتفوتش) → غطّي فورًا */
        if(ytState()===0){
          var eo3=document.getElementById('endOv');
          if(eo3 && eo3.style.display!=='flex'){ eo3.style.display='flex'; try{ playerApi.seekTo(0,true); playerApi.pauseVideo(); }catch(e){} reportEnded(); }
        }
        /* قفل الجودة على 480p: لو يوتيوب نزّلها لوحده → نعيد الأمر، ولو استمر
           → إعادة تحميل التيار عند 480p (مرتين كحد أقصى للفيديو عشان مفيش لوب) */
        if(ytState()===1){
          var q = '';
          try{ q = playerApi.getPlaybackQuality() || ''; }catch(e){}
          if(q && q !== 'large' && q !== 'auto' && q !== 'unknown'){
            if(!qMissAt) qMissAt = Date.now();
            if(Date.now() - qMissAt > 5000){
              if(qReloads < 2 && Date.now() - lastQReload > 18000){
                qReloads++; lastQReload = Date.now(); qMissAt = 0;
                try{ playerApi.loadVideoById(ytIdCached, Math.max(0, Math.floor(playerApi.getCurrentTime() || 0)), 'large'); }catch(e){}
              } else {
                try{ playerApi.setPlaybackQuality('large'); }catch(e){}
              }
            }
          } else { qMissAt = 0; }
        }
        if(!seekDragging){
          var se = document.getElementById('seek');
          if(se && dur) se.value = String(Math.round(cur/dur*1000));
          var tt = document.getElementById('tTime');
          if(tt) tt.textContent = fmtT(cur) + ' / ' + fmtT(dur);
        }
      }
    }catch(e){}
  }, 1000);
}

/* ===== مشغّل الملفات المرفوعة (توكن موقّع قصير العمر) ===== */
var fileApi = null;
function mountFile(){
  var v = document.createElement('video');
  v.id = 'fileVid'; v.controls = true; v.playsInline = true;
  v.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback nofullscreen');
  v.setAttribute('disablePictureInPicture', '');
  v.setAttribute('disableRemotePlayback', '');
  v.src = CFG.fileUrl;
  if(CFG.resume > 5) v.addEventListener('loadedmetadata', function(){ try{ v.currentTime = CFG.resume; }catch(e){} });
  v.addEventListener('timeupdate', function(){
    lastCur = v.currentTime;
    if(Math.floor(v.currentTime) % 5 === 0 && v.currentTime > 0) reportProgress(v.currentTime, v.duration || 0);
  });
  v.addEventListener('ended', function(){ reportEnded(); });
  wrap.appendChild(v);
  fileApi = v;
  var btn = document.createElement('button');
  btn.id = 'fsBtn'; btn.type = 'button'; btn.setAttribute('aria-label','ملء الشاشة');
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  btn.addEventListener('click', function(e){ e.stopPropagation(); toggleFs(); });
  wrap.appendChild(btn);
}

/* ===== تشغيل ===== */
buildWm();
ensureTopShield();
layoutWrap();
if(CFG.kind === 'youtube') mountYouTube(); else if(CFG.kind === 'file') mountFile();

/* زرار ملء الشاشة للملفات (ليوتيوب الزرار جوه الكنترولز بتاعته) */
if(CFG.kind === 'file'){
  /* mounted جوه mountFile */
}
if(CFG.kind === 'youtube'){
  wrap.addEventListener('dblclick', function(){ toggleFs(); });
}
</script>
</body>
</html>`
