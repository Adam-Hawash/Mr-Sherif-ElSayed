// ============================================================
// /api/player/[ticket] — مشغّل الفيديو المحمي (صفحة كاملة)
// ============================================================
// التذكرة: واحدة الاستخدام + صلاحية دقيقتين — من غيرها مفيش تشغيل.
// الصفحة دي هي الوحيدة اللي بتشوف معرف اليوتيوب/الملف — وعلى السيرفر:
//  1) معرف اليوتيوب مبيدخلش الصفحة كنص صريح — بيتشفّر (XOR + Base64)
//     وبيتفك في الذاكرة لحظة التشغيل بس، فمفيش ID في مصدر الصفحة
//     ولا في الـ DOM ولا في أي console.log.
//  2) الملفات المرفوعة بتتخدم بتوكن موقّع قصير العمر مرتبط بالطالب.
//  3) الووترمارك (رجوع المواصفات الأصلية + QR — 2026-و6): 6 كروت ثابتة
//     (1 فوق في النص + 1 يمين + 1 شمال + 3 تحت) كل كارت: الاسم + الرقم
//     + QR الطالب (بيتولد في السيرفر — مسح الكود بيحدد مين سجّل الفيديو)
//     + الووترمارك الكبيرة الشفافة في النص بتظهر 10 ثواني وبتختفي 20 ثانية
//     وقت التشغيل بس + بيرجع يرسم لوحه نفسه لو اتمسح + شغال جوه ملء الشاشة
//     + مستطيلين سودة تحت يمين وشمال بيغطوا علامة الاشتراك/اللوجو يوتيوب
//  4) حماية فحص: كليك يمين مقفول + F12/Ctrl+U/Ctrl+S + Ctrl+Shift+I/J/C/K
//     + **كل زرار F1 لـ F12 وفيهم F10 صراحةً (event.key === 'F10' — طلب
//     المستر الحرفي 2026-م: "explicitly intercept and prevent the F10 key")**
//     بتنبيه لطيف + لو أدوات المطور اتفتحت الفيديو بيوقف مؤقتًا.
//  5) التقدم بيتقال للأب بـ postMessage كل 5 ثواني (مفيش أي لينك).
//  6) حماية الفيديو من يوتيوب (أحدث قرار 2026-ط2 — «اعمل blur على كل حاجة،
//     وغطّي اسم القناة اللي فوق بالكامل — علامة سودة أو كلمة اسم المنصة»):
//     **شريط علوي داكن + بلور بعرض الشاشة كلها مكتوب عليه اسم المنصة (Mr Sherif ElSayed)**
//     دايمًا شغال بيغطي العنوان + اسم القناة + أزرار الشير تغطية 100%.
//  7) الواجهة (القرار النهائي 2026-ؤ — طلب المستر الحرفي: «مش لاقي زرار
//     الإعدادات.. خبي علامة اليوتيوب.. علامة الـ share والـ time دي لغيها»):
//     **كنترولز يوتيوب مقفولة خالص (controls=0)** — يعني لوجو يوتيوب وزرار
//     share وزرار الوقت وقايمة ⚙ كلهم **ماتشالوا مش متغطيين بس** (الغطاء
//     كان بيفشل لأن الواجهة RTL واللوجو بيبقى تحت الشمال مش تحت يمين).
//     مكانهم **شريط تحكم من عندنا** — تمليينه (2026-و2) بطلب المستر الحرفي:
//     «شريط اللي بجر منه وعلامة التكبير والتصغير وعلامة الجودة بس»:
//     شريط تقدم بالسحب + زرار ملء شاشة **كبير** + ⚙ جودة — **بس كده**
//     (التشغيل/الإيقاف بدوسة على الفيديو نفسه، ومفيش كتم ولا وقت ولا براند).
//     **غطاء capLid السفلي اتشال نهائيًا (2026-و2)** — «من غير ما الفيديو
//     يتقص عشان تقصص لي تحت برضه» — الفيديو دلوقتي كامل 100% لآخر بكسل.
//  7-ب) الجودة بعد قفل الكنترولز (تحديث 2026-و5 — طلب المستر الحرفي:
//     «خلي الجودة مقبولة لـ 480 تكون هي دي الجودة وأنا أقدر أغيرها
//     والتغيير يكون بيحصل بجد»): **أرضية جودة 480p** —
//     setPlaybackQualityRange('large','highres') عند كل تشغيل وتغير جودة
//     ودوريًا + حارس يعيد تحميل التيار بـ large لو واقف تحت 480 (3 محاولات
//     كحد أقصى) — لو النت يسمح بأعلى بياخد أعلى، والمحصلة مش هتثبت على 360.
//     **اختيار الطالب من ⚙ بقى بيتأكد بجد (ytVerifyQuality)**: متحقق دوري
//     لو يوتيوب ماثبتش المستوى المطلوب → إعادة طلب (2 مرة كحد أقصى)
//     وبعدها رسالة صادقة بالمستوى اللي يوتيوب ثبتته فعلًا. ويوتيوب لسه
//     بيقدر يتجاهل (مفيش ضمان رسمي من 2023) — **الجودة المضمونة 100% =
//     ملف فيديو مباشر (مش يوتيوب)** — أي لينك مباشر بيتشغل بمشغلنا
//     النظيف والجودة = جودة الملف نفسه.
//     **ميزة «إضافة فيديو من كود HTML» اتلغت نهائيًا (2026-و4)** بطلب
//     المستر نفسه: «لما باجي أضيف كود الـ HTML بلاقي جايبلي حاجات
//     الـ YouTube، لا.. فأنا عاوزك تلغي» — راجعت الكود كله (القايمة في
//     لوحة الأدمن + مسار embed في المشغل + عمود nativeEmbed).
//  8) الكابشن/الترجمة (القرار النهائي — طلب المستر الحرفي: «تشيل زرار
//     الكابشن وتشيل الكابشن أصلاً — اعمل للكابشن بلوك.. مش عايز أي كتابة
//     تظهر تحت الفيديو»): مفيش زرار CC في أي مشغل خالص + cc_load_policy=0
//     + hl=ar + cc_lang_pref=ar + إبادة موديول الترجمة دوريًا (بتقتل ترجمة
//     ASR التلقائية كمان) + **أوامر postMessage للوضع البديل المباشر كل
//     3 ثواني** (enablejsapi — الكابشن ممنوع في الوضعين).
//     **درع الكابشن البلور (capShield) اتشال** (2026-ط2 — «شكله مش لطيف»)
//     **وغطاء capLid الأسود اتشال نهائيًا برضه (2026-و2 — قرار المستر:
//     «من غير ما الفيديو يتقص عشان تقصص لي تحت برضه»)** — المنع رجع تقني
//     بالكامل من غير أي تغطية مرئية: cc_load_policy=0 + disablekb (زرار C)
//     + إبادة الموديول دوريًا + postMessage — الشريط السفلي بتاعنا (60px)
//     هو التغطية الوحيدة الباقية، والفيديو كامل من فوق لتحت.
//     زرار C اتشال من الكيبورد (كان بيفتح الترجمة — الترجمة ممنوعة نهائيًا).
//  9) التشغيل المضمون: مراقب متدرج (playVideo → loadVideoById → صامت)
//     + تحميل API يوتيوب بإعادة محاولة + تسجيل طلب التشغيل قبل جهوزية الـ API
//     + تكملة مشاهدة آمنة (من غير حلقة النهاية).
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import QRCode from 'qrcode'
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
    '<style>body{margin:0;background:#0b0b0f;color:#e5e7eb;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px;box-sizing:border-box}p{font-size:15px;line-height:1.9;max-width:440px}</style></head>' +
    '<body><p>' + htmlEscape(msg) + '</p></body></html>',
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, private' } }
  )
}

/* (المشغل العادي — قرار المستر 2026-و: «خليه مشغل عادي من غير أي يوتيوب»)
   اللينك المباشر لملف فيديو (MP4/WebM/MOV/OGG) أو بث HLS (M3U8)
   بيتشغّل في مشغلنا العادي بالكامل — مفيش يوتيوب أصلًا.
   ملاحظة للمستر: فيديو يوتيوب نفسه مستحيل يتشغل من غير يوتيوب
   (الملف نفسه على سيرفرات يوتيوب) — اللينكات المباشرة/الملفات
   المرفوعة هي اللي بتفتح المشغل العادي ده */
function isDirectMediaUrl(u: string): boolean {
  if (!u) return false
  const s = String(u).trim()
  if (!/^https?:\/\//i.test(s) && !s.startsWith('/')) return false
  return /\.(mp4|webm|m3u8|mov|ogg|ogv)(\?.*)?$/i.test(s)
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
    // ===== (2026-ط) علاج جذري لـ"الفيديو مش بيفتح خالص" =====
    // كانت التذكرة بتُستهلك من أول تحميل (single-use) — أي preFetch أو Retry
    // أو إعادة تحميل للـ iframe قبل ما المشغل يرندر بيحرق التذكرة، والطالب
    // يشوف "التذكرة اتاستخدمت" للأبد من غير أي حل. دلوقتي: التذكرة صالحة
    // طوال دقيقتين مهما اتفتحت — الحماية زي ما هي (التذكرة مخصصة للطالب
    // وبتنتهي تلقائيًا ومفيش أي معرف فيديو بيظهر نتيجة كده)
    if (new Date(row.expiresAt).getTime() < Date.now()) return pageError('تذكرة التشغيل خلصت صلاحيتها — اقفل المشغل وافتح الفيديو من الأول وهيفتح عادي.', 403)

    // ===== فيديوهات المعرض (gal_...) =====
    if (row.videoId && row.videoId.indexOf('gal_') === 0) {
      const galId = row.videoId.slice(4)
      let g: any = null
      try { g = await db.galleryImage.findUnique({ where: { id: galId } }) } catch (e) {}
      if (!g || !(g as any).videoUrl) return pageError('الفيديو غير موجود.', 404)
      const gYt = getYouTubeId(g.videoUrl || '')
      if (!gYt && !isDirectMediaUrl(g.videoUrl || '')) return pageError('الفيديو ده مفيهوش مصدر تشغيل صالح.', 415)
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

    // QR الووترمارك (2026-و6): بيتولد في السيرفر خصيص للطالب — محتويه
    // المنصة + اسمه + رقمه — لو الفيديو اتسرب، مسح الكود بيحدد مين سجّله فورًا
    var wmQr = ''
    if (wmEnabled === '1' && (wmName || wmPhone)) {
      try {
        const qrSvg = await QRCode.toString('Mr Sherif ElSayed | ' + wmName + ' | ' + wmPhone, {
          type: 'svg', margin: 0, width: 64, errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        })
        wmQr = 'data:image/svg+xml;base64,' + Buffer.from(qrSvg, 'utf8').toString('base64')
      } catch (e) { wmQr = '' }
    }

    const ytId = getYouTubeId(video.url || '')
    const mediaId = mediaIdFromPath(video.filePath || '')
    const directUrl = (!ytId && !mediaId && isDirectMediaUrl(video.url || '')) ? String(video.url).trim() : ''
    const videoIdEsc = htmlEscape(video.id)
    const titleEsc = htmlEscape(video.title || '')

    // مفيش طريقة تشغيل معروفة → صفحة خطأ (بالشرح: اللينك المباشر لازم ينتهي
    // بامتداد فيديو — MP4/M3U8/WebM — أو يرفع الملف من لوحة التحكم)
    // (ملغاة 2026-و4: ميزة كود HTML embed اتنست بطلب المستر نفسه)
    if (!ytId && !mediaId && !directUrl) {
      return pageError('الفيديو ده مفيهوش مصدر تشغيل صالح — اللينك المباشر لازم ينتهي بـ mp4 أو m3u8 أو webm، أو ارفع ملف الفيديو نفسه من لوحة التحكم.', 415)
    }

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
        qr: wmQr,
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
    } else if (directUrl) {
      // (المشغل العادي) لينك فيديو مباشر من أي موقع — MP4/M3U8/WebM
      // بيتشغل في مشغلنا العادي من غير أي يوتيوب + إعدادات جودة ظاهرة
      cfg.fileUrl = directUrl
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
  html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
  #stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000}
  #wrap{position:relative;width:100%;max-width:100vw;background:#000;overflow:hidden}
  #wrap.fs{width:100vw;height:100vh;max-width:none}
  #yt,#fileVid{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}
  /* ===== الووترمارك (رجوع المواصفات الأصلية + QR — طلب المستر 2026-و6) =====
     • 6 كروت ثابتة ظاهرة على طول: 1 فوق في النص + 1 يمين + 1 شمال
       + 3 تحت (شمال/نص/يمين) — كل كارت: الاسم + الرقم + **QR الطالب**
       (بيتولد في السيرفر باسمه ورقمه — لو الفيديو اتسرب مسح الكود يكشفه)
     • الووترمارك الكبيرة الشفافة في النص رجعت: **بتظهر 10 ثواني وبتختفي
       20 ثانية** (دورة 30 ثانية بتكرر لوحدها — keyframes wmBlink30) وقت التشغيل بس
     • مستطيلين سودة تحت خالص (يمين وشمال) بيغطوا علامة الاشتراك/اللوجو
       بتوع يوتيوب — طلب المستر الحرفي: «عايزك تداريها لي بمستطيل أسود كده يمين وشمال» */
  .wm{position:absolute;inset:0;z-index:40;pointer-events:none;user-select:none;overflow:hidden}
  @keyframes wmBlink30{0%{opacity:0}1.5%{opacity:var(--wmo,.5)}31.5%{opacity:var(--wmo,.5)}33.5%{opacity:0}98.5%{opacity:0}100%{opacity:var(--wmo,.5)}}
  #wmBig{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:41;direction:rtl;
    text-align:center;max-width:94%;--wmo:.5;opacity:0;
    animation:wmBlink30 30s linear infinite;
    font-weight:900;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
    /* 2026-و8 — المستر رجّع القرار: «اللي في النص الكبيرة دي رجّعلي مقاسها
       زي ما كانت كبيرة شوية» — رجعت لمقاسها الأصلي 5.6vw/72px بنفس المكان
       (التصغير بقى على الكروت الجانبية يمين وشمال بدلها) */
    font-size:clamp(20px,5.6vw,72px);line-height:1.25;
    unicode-bidi:plaintext;letter-spacing:0}
  #wmBig .b1{display:block;color:rgba(0,0,0,.10);white-space:nowrap;
    -webkit-text-stroke:1.3px rgba(0,0,0,.42);paint-order:stroke fill;
    text-shadow:0 0 16px rgba(255,255,255,.16)}
  #wmBig .b2{display:block;font-size:.5em;direction:ltr;unicode-bidi:plaintext;
    margin-top:.14em;letter-spacing:0;white-space:nowrap;color:rgba(0,0,0,.10);
    -webkit-text-stroke:1px rgba(0,0,0,.40);paint-order:stroke fill;
    text-shadow:0 0 12px rgba(255,255,255,.16)}
  .wmCard{position:absolute;z-index:46}
  .wmCardT{top:2.8%;left:50%;transform:translateX(-50%) scale(1.14)}
  /* 2026-و9 — الكروت اليمين والشمال طلعوا فوق: بقى 3 فوق (شمال/نص/يمين)
     و3 تحت — بنفس تصغير ~18% — بطلب المستر: «اللي في النص دول تطلعهم فوق
     يبقوا تلاتة فوق وتلاتة تحت» */
  /* 2026-و11 — «في الطرف خالص، في طرف الشاشة» — الكروت الجانبية بقيت ملاصقة
     للحافة بلا فاصل (كانت 2%) — يمين وشمال ملاصقين خالص */
  /* 2026-و15 — «كبّر الووترمارك اللي فوق مش كتير أوي» — الكروت التلاتة فوق
     كبروا شوية: النص 1.14x والجانبين من .82 لـ .92 */
  .wmCardMR{top:2.8%;right:0;transform:scale(.92);transform-origin:top right;opacity:.88}
  .wmCardML{top:2.8%;left:0;transform:scale(.92);transform-origin:top left;opacity:.88}
  /* 2026-و9 — كارتين صغيرين في نص الفيديو يمين وشمال على الطرف خالص —
     فيهم رقم الطالب بس (من غير اسم ولا QR) — بطلب المستر */
  .wmNumChip{position:absolute;z-index:46;transform:translateY(-50%)}
  /* 2026-و16 — طلب المستر: «اليمين كمان مرتين زي الشمال + الاسم تحتهم صغير» —
     كل جانب بقى: رقمين (44% و 56%) + اسم الطالب تحتهم (68%) صغير */
  .wmNumR{right:0;top:44%;border-radius:7px 0 0 7px}
  .wmNumR2{right:0;top:56%;border-radius:7px 0 0 7px}
  .wmNumL{left:0;top:44%;border-radius:0 7px 7px 0}
  .wmNumL2{left:0;top:56%;border-radius:0 7px 7px 0}
  .wmNameChip{position:absolute;z-index:46;max-width:36vw;overflow:hidden}
  .wmNameR{right:0;top:68%;border-radius:7px 0 0 7px}
  .wmNameL{left:0;top:68%;border-radius:0 7px 7px 0}
  .wmNameChip .in{display:inline-block;background:rgba(0,0,0,.55);color:#fff;
    border:1px solid rgba(255,255,255,.16);border-left:0;border-right:0;padding:2.5px 9px;
    font-size:clamp(8.5px,.95vw,11px);font-weight:700;direction:rtl;unicode-bidi:plaintext;
    letter-spacing:0;white-space:nowrap;opacity:.85;max-width:36vw;overflow:hidden;
    text-overflow:ellipsis}
  .wmNumChip .in{display:inline-block;background:rgba(0,0,0,.55);color:#fff;
    border:1px solid rgba(255,255,255,.16);border-left:0;border-right:0;padding:2.5px 9px;
    font-size:clamp(8.5px,.95vw,11px);font-weight:700;direction:ltr;unicode-bidi:plaintext;
    letter-spacing:0;white-space:nowrap;opacity:.85}
  .wmCardB1{bottom:66px;left:0;opacity:.85}
  .wmCardB2{bottom:66px;left:50%;transform:translateX(-50%);opacity:.85}
  .wmCardB3{bottom:66px;right:0;opacity:.85}
  .wmCard .in{display:inline-flex;align-items:center;gap:6px;background:rgba(0,0,0,.66);
    border:1px solid rgba(255,255,255,.20);color:#fff;border-radius:9px;padding:3px 9px;
    direction:rtl;white-space:nowrap}
  .wmCard .qr{width:clamp(22px,2.8vw,32px);height:clamp(22px,2.8vw,32px);border-radius:3px;
    background:#fff;padding:2px;display:block}
  .wmCard .nm{font-size:clamp(9px,1.05vw,12.5px);font-weight:800;unicode-bidi:plaintext;letter-spacing:0;white-space:nowrap}
  .wmCard .sep{opacity:.55;font-size:clamp(8px,.9vw,10.5px)}
  .wmCard .ph{font-size:clamp(8.5px,.95vw,11.5px);font-weight:700;direction:ltr;unicode-bidi:plaintext;letter-spacing:0;opacity:.92;white-space:nowrap}
  /* المستطيلات السودة تحت خالص يمين وشمال — تغطية علامة الاشتراك/اللوجو
     بتاعة يوتيوب تغطية كاملة + بتمنع الدوس عليها (فيه يوتيوب بس) */
  /* (2026-و9) الشريط السفلي بقى بنفس سمك العلوي بالظبط — طلب المستر:
     «تصغّر الشريط اللي تحت شوية، تقصّره، يكون بنفس سمك اللي فوق» —
     نفس المعادلة 40–50px ونفس الطقم (أسود + بلور + اسم المنصة) */
  #ytCoverR{position:absolute;z-index:45;bottom:0;right:0;width:min(215px,34%);height:max(40px,min(7.5%,50px));
    background:#000;pointer-events:auto}
  #ytCoverL{position:absolute;z-index:45;bottom:0;left:0;width:min(150px,26%);height:max(40px,min(7.5%,50px));
    background:#000;pointer-events:auto}
  /* درع فوق كامل (2026-ط2 — طلب المستر: «اعمل blur على كل حاجة،
     وغطّي اسم القناة اللي فوق بالكامل — علامة سودة أو كلمة اسم المنصة —
     أي حاجة بس تكون مغطية»): شريط داكن + بلور بعرض الشاشة كلها، ثابت
     دايمًا، بيغطي عنوان يوتيوب + اسم القناة + أزرار الشير/Watch on YouTube
     تغطية 100% — مستحيل يبانوا ولا حد يقدر يدوس عليهم — ومكتوب عليه
     اسم المنصة بدل أي برندنج يوتيوب.
     **(2026-و3 — طلب المستر: «قصره شوية، ما تخليهوش نازل كده طويل»)** —
     الشريط بقى رفيع (40–50px بدل 96px) — التغطية زي ما هي بس من غير ماياخد
     مساحة كبيرة من الفيديو */
  #topShield{position:absolute;top:0;left:0;right:0;z-index:22;pointer-events:auto;
    height:max(40px,min(7.5%,50px));
    background:rgba(0,0,0,.80);
    -webkit-backdrop-filter:blur(16px) saturate(.9);backdrop-filter:blur(16px) saturate(.9);
    display:flex;align-items:center;justify-content:flex-start;
    padding-right:14px;
    border-bottom:1px solid rgba(255,255,255,.10)}
  #topShield::after{content:'';position:absolute;top:100%;left:0;right:0;height:12px;
    background:linear-gradient(to bottom,rgba(0,0,0,.45),rgba(0,0,0,0))}
  #topShield .brand{color:rgba(255,255,255,.92);font-weight:900;
    font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
    font-size:clamp(12px,1.9vw,17px);letter-spacing:.5px;direction:ltr;white-space:nowrap;
    text-shadow:0 1px 3px rgba(0,0,0,.6);pointer-events:none}
  /* درع تحت كامل (2026-و7 — طلب المستر: «عاوزك تحط لي زي blur كده زي بتاع
     المستطيل الأسود اللي من فوق ومن تحت... يداري كل حاجة بس ما يكونش
     يداري الحتة اللي تحت دي») — نفس شكل الطقم العلوي بالظبط: شريط داكن
     + بلور بعرض الفيديو كلها، ثابت دايمًا، بيغطي صف يوتيوب تحت خالص
     (الاشتراك/اللوجو/الشير/سطر الكابشن) تغطية كاملة 100%.
     كروت QR بتاعتنا (bottom:66px) فوقيه فبتفضل ظاهرة زي ما المستر عايز،
     والشريط جوه مستطيل الفيديو بس — مبيوصلش لحاجة الصفحة اللي تحت الخالص */
  /* 2026-و19 — «نزّل الشريط اللي تحت شويه — ما يكونش عالي كده قوي» —
     بقى 66px + 6–10px بس (على مستوى سطر الكابشن بالظبط) بدل ما كان
     واصل لأول كروت الـ QR (96–106px) — والكروت فوقيه ظاهرة زي ما هي (z-46 > z-44) */
  #botShield{position:absolute;bottom:0;left:0;right:0;z-index:44;pointer-events:auto;
    height:calc(66px + clamp(6px,0.9vw,10px));
    background:rgba(0,0,0,.80);
    -webkit-backdrop-filter:blur(16px) saturate(.9);backdrop-filter:blur(16px) saturate(.9);
    display:flex;align-items:center;justify-content:flex-start;
    padding-right:14px;
    border-top:1px solid rgba(255,255,255,.10)}
  #botShield::before{content:'';position:absolute;bottom:100%;left:0;right:0;height:10px;
    background:linear-gradient(to top,rgba(0,0,0,.35),rgba(0,0,0,0))}
  #botShield .brand{color:rgba(255,255,255,.92);font-weight:900;
    font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
    font-size:clamp(12px,1.9vw,17px);letter-spacing:.5px;direction:ltr;white-space:nowrap;
    text-shadow:0 1px 3px rgba(0,0,0,.6);pointer-events:none}
  #fsBtn{position:absolute;bottom:10px;left:10px;z-index:50;width:40px;height:40px;border-radius:10px;border:0;cursor:pointer;
    background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;opacity:.75}
  #fsBtn:hover{opacity:1;background:rgba(0,0,0,.75)}
  /* ===== كنترولز بتاعتنا (بدون أي شكل يوتيوب) ===== */
  #tapLayer{position:absolute;inset:0;z-index:20;background:transparent}
  /* (الكنترولز بقيت بتاعة يوتيوب الأصلية — مفيش شريط تحكم من عندنا:
     قائمة ⚙ الأصلية هي الوحيدة اللي بتغير الجودة فعلًا) */
  /* درع الكابشن البلور (capShield) **اتشال خالص** (2026-ط2 — طلب المستر:
     «حاول تخفي لي الـ blur اللي تحت ده عشان شكله مش لطيف» + الإعدادات ⚙
     لازم تبقى ظاهرة وشغالة من غير بلور عشان يقدر يرفع الجودة لـ 1080p).
     منع الكابشن دلوقتي بـ 3 طبقات من غير أي شريط مرئي:
     cc_load_policy=0 + إبادة موديول الترجمة دوريًا (API)
     + أوامر postMessage للمشغل البديل المباشر كل 3 ثواني */
  /* ===== شريط التحكم بتاعنا (تمليين 2026-و2 — طلب المستر الحرفي:
     «شريط اللي بجر منه وعلامة التكبير والتصغير وعلامة الجودة بس») =====
     كنترولز يوتيوب مقفولة خالص controls=0 — وشريطنا 3 عناصر بس:
     ⚙ الجودة + شريط التقدم بالسحب + زرار ملء الشاشة (كبير وواضح).
     التشغيل/الإيقاف بدوسة على الفيديو نفسه — مفيش كتم ولا وقت ولا براند.
     الخلفية SOLID معتمة 100% (2026-ي) */
  #mgBar{position:absolute;bottom:0;left:0;right:0;z-index:60;height:60px;
    display:flex;align-items:center;gap:4px;direction:rtl;padding:0 10px;
    background:#050509;
    transition:opacity .3s ease;opacity:1}
  /* إخفاء تلقائي (2026-و3 — طلب المستر: الشريط يختفي أول ما الفيديو يمشي
     ويظهر لحظة الإيقاف — عشان ميفضلش مشتت الطالب طول المشاهدة) */
  #mgBar.hide{opacity:0;pointer-events:none}
  body.nocursor{cursor:none}
  #mgBar .mBtn{flex:0 0 auto;width:44px;height:44px;border:0;border-radius:10px;
    background:transparent;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
  #mgBar .mBtn:hover{background:rgba(255,255,255,.12)}
  /* زرار ملء الشاشة **الكبير** (2026-و2 — «حطلي علامة تصغير كبيرة») */
  #mgBar .mBtn.big{width:58px;height:48px}
  #mgTrackWrap{flex:1 1 auto;direction:ltr;height:44px;display:flex;align-items:center;cursor:pointer;padding:0 6px;min-width:80px}
  #mgTrack{position:relative;width:100%;height:5px;border-radius:4px;background:rgba(255,255,255,.22);overflow:hidden}
  #mgBuf{position:absolute;top:0;left:0;bottom:0;width:0;background:rgba(255,255,255,.35)}
  #mgFill{position:absolute;top:0;left:0;bottom:0;width:0;background:#fff}
  #mgBrand{flex:0 0 auto;color:rgba(255,255,255,.92);font-weight:900;font-size:12px;letter-spacing:.6px;
    direction:ltr;font-family:system-ui,sans-serif;margin-right:8px;text-shadow:0 1px 2px rgba(0,0,0,.6)}
  @media(max-width:420px){#mgBrand{display:none}}
  /* ===== (المشغل العادي 2026-و) الوقت + زرار إعدادات الجودة ⚙ + القايمة =====
     طلب المستر الحرفي: «يكون فيه إعدادات بتاعت الجودة.. تعرف حاجات تكون شايفها» */
  #mgTime{flex:0 0 auto;font-size:11.5px;font-weight:700;color:rgba(255,255,255,.85);
    direction:ltr;unicode-bidi:plaintext;letter-spacing:.2px;padding:0 6px;white-space:nowrap;
    font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.6)}
  @media(max-width:620px){#mgTime{display:none}}
  #mgBar .mBtnWide{flex:0 0 auto;min-width:44px;height:44px;border:0;border-radius:10px;
    background:transparent;color:#fff;display:flex;align-items:center;justify-content:center;
    gap:6px;padding:0 10px;cursor:pointer}
  #mgBar .mBtnWide:hover{background:rgba(255,255,255,.12)}
  #mgQLabel{font-size:11px;font-weight:800;color:rgba(255,255,255,.9);letter-spacing:.3px;white-space:nowrap}
  @media(max-width:520px){#mgQLabel{display:none}}
  #mgQMenu{position:absolute;bottom:68px;left:12px;z-index:72;min-width:170px;display:none;
    background:#0b0b12;border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:6px;
    box-shadow:0 14px 40px rgba(0,0,0,.6);direction:rtl}
  #mgQMenu.open{display:block}
  #mgQMenu .qHead{padding:5px 12px 7px;color:rgba(255,255,255,.55);font-size:11px;font-weight:800;
    border-bottom:1px solid rgba(255,255,255,.1);margin-bottom:4px}
  #mgQMenu .qi{padding:9px 12px;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;
    display:flex;align-items:center;justify-content:space-between;gap:12px;white-space:nowrap}
  #mgQMenu .qi:hover{background:rgba(255,255,255,.13)}
  #mgQMenu .qi.on{background:rgba(255,255,255,.08)}
  #mgQMenu .qi .ck{font-size:14px;font-weight:900}
  #mgQMenu .qNote{padding:7px 12px 5px;color:rgba(255,255,255,.55);font-size:10.5px;line-height:1.7;border-top:1px solid rgba(255,255,255,.1);margin-top:4px}
  /* (غطاء الكابشن capLid **اتشال نهائيًا** 2026-و2 — طلب المستر الحرفي:
     «من غير ما الفيديو يتقص عشان تقصص لي تحت برضه» — الفيديو كامل 100%
     لآخر بكسل، والكابشن ممنوع تقنيًا بدون أي تغطية مرئية زيادة) */
  #startOv{position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(2,2,8,.96);cursor:pointer}
  #startOv .big{width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;color:#fff}
  #startOv p{color:#fff;font-size:14px;font-weight:700;margin:0;font-family:system-ui,sans-serif}
  #endOv{position:absolute;inset:0;z-index:80;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(2,2,8,.94)}
  #endOv p{color:#fff;font-size:16px;font-weight:800;margin:0;font-family:system-ui,sans-serif}
  #endOv button{padding:10px 20px;border-radius:10px;border:0;background:rgba(255,255,255,.16);color:#fff;font-weight:700;font-size:14px;cursor:pointer}
  /* (باتش اللوجو القديم والزرار المنفصل لملء الشاشة اتشالوا 2026-ؤ:
     الشريط Opaque بتاعنا بيغطي الركنين من الأساس أصلًا — واللوجو في وضع
     RTL بيبقى تحت الشمال زي ما ظهر في سكرين شوت المستر والباتش القديم
     كان تحت يمين فكان مش بيوصله — وملء الشاشة بقى زرار جوه الشريط) */
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

/* ===== الووترمارك (توزيع المستر النهائي — 2026-و9) =====
   • 6 كروت QR: 3 فوق (شمال/نص/يمين) + 3 تحت (شمال/نص/يمين) — اللي كانوا
     في النص طلعوا فوق بطلب المستر
   • كارتين صغيرين في نص الفيديو يمين وشمال على الطرف خالص — رقم الطالب بس
   • الووترمارك الكبيرة في النص زي ما هي: 10 ثواني ظاهرة / 20 مخفية (دورة 30 ث)
     بتشتغل وقت التشغيل بس — عند الإيقاف بتقف */
var wmName = String(CFG.wm.name || '').trim();
var wmPhone = String(CFG.wm.phone || '').trim();
/* الاسم الثنائي: أول كلمتين بس — سطر واحد في النص */
function wmShortName(){
  var p = wmName.split(/\\s+/).filter(Boolean);
  return p.slice(0, 2).join(' ');
}
function wmCardHtml(){
  var qr = CFG.wm.qr ? '<img class="qr" src="' + CFG.wm.qr + '" alt="">' : '';
  return '<div class="in">' + qr + '<span class="nm">' + esc(wmName || wmPhone) + '</span>' +
    ((wmName && wmPhone) ? '<span class="sep">•</span><span class="ph">' + esc(wmPhone) + '</span>' : '') + '</div>';
}
function buildWm(){
  if(!CFG.wm.enabled) return;
  var old = document.getElementById('wm');
  if(old) old.parentNode.removeChild(old);
  var layer = document.createElement('div');
  layer.id = 'wm'; layer.className = 'wm';
  /* 1) الووترمارك الكبيرة في النص — سطرين: الاسم الثنائي والرقم تحته —
        بتظهر 10 ثواني وبتختفي 20 ثانية (دورة 30 ثانية متكررة) */
  var big1 = wmShortName() || wmPhone;
  if(big1){
    var big = document.createElement('div');
    big.id = 'wmBig';
    big.innerHTML = '<span class="b1">' + esc(big1) + '</span>' +
      ((wmName && wmPhone) ? '<span class="b2">' + esc(wmPhone) + '</span>' : '');
    var wmo = Math.min(0.6, Math.max(0.3, (Number(CFG.wm.opacity) || 0.55) * 0.85));
    big.style.setProperty('--wmo', String(wmo));
    big.style.animationPlayState = 'paused';
    layer.appendChild(big);
  }
  /* 2) الكروت الستة بالـ QR: تلاتة فوق (شمال/نص/يمين) + تلاتة تحت */
  if(wmName || wmPhone){
    var ch = wmCardHtml();
    var t  = document.createElement('div'); t.className  = 'wmCard wmCardT';  t.innerHTML  = ch; layer.appendChild(t);
    var mr = document.createElement('div'); mr.className = 'wmCard wmCardMR'; mr.innerHTML = ch; layer.appendChild(mr);
    var ml = document.createElement('div'); ml.className = 'wmCard wmCardML'; ml.innerHTML = ch; layer.appendChild(ml);
    var b1 = document.createElement('div'); b1.className = 'wmCard wmCardB1'; b1.innerHTML = ch; layer.appendChild(b1);
    var b2 = document.createElement('div'); b2.className = 'wmCard wmCardB2'; b2.innerHTML = ch; layer.appendChild(b2);
    var b3 = document.createElement('div'); b3.className = 'wmCard wmCardB3'; b3.innerHTML = ch; layer.appendChild(b3);
  }
  /* 3) (2026-و16) كل جانب: رقمين (يمين + شمال) + اسم الطالب تحتهم صغير —
     بطلب المستر الحرفي: «اللي على اليمين يكون مرتين برضه ويكون تحتهم اسم الطالب
     خليها صغيرة زي ما هي» */
  if(wmPhone){
    var phc = '<div class="in">' + esc(wmPhone) + '</div>';
    var nr = document.createElement('div'); nr.className = 'wmNumChip wmNumR'; nr.innerHTML = phc; layer.appendChild(nr);
    var nr2 = document.createElement('div'); nr2.className = 'wmNumChip wmNumR2'; nr2.innerHTML = phc; layer.appendChild(nr2);
    var nl = document.createElement('div'); nl.className = 'wmNumChip wmNumL'; nl.innerHTML = phc; layer.appendChild(nl);
    var nl2 = document.createElement('div'); nl2.className = 'wmNumChip wmNumL2'; nl2.innerHTML = phc; layer.appendChild(nl2);
  }
  if(wmShortName() && wmPhone){
    var nmc = '<div class="in">' + esc(wmName) + '</div>';
    var nmR = document.createElement('div'); nmR.className = 'wmNameChip wmNameR'; nmR.innerHTML = nmc; layer.appendChild(nmR);
    var nmL = document.createElement('div'); nmL.className = 'wmNameChip wmNameL'; nmL.innerHTML = nmc; layer.appendChild(nmL);
  }
  wrap.appendChild(layer);
}
/* درع الشريط العلوي — **دايمًا شغال** بيغطي عنوان يوتيوب/اسم القناة/زرار
   الشير — بديل القص: الفيديو كامل 100% والواجهة مستحيل تبان */
function ensureTopShield(){
  if(document.getElementById('topShield')) return;
  var ts = document.createElement('div'); ts.id='topShield';
  ts.innerHTML = '<span class="brand">Mr Sherif ElSayed</span>';
  wrap.appendChild(ts);
}
/* درع الشريط السفلي الكامل (2026-و7) — نفس الطقم العلوي بس تحت:
   بيغطي صف يوتيوب كله (اشتراك/لوجو/شير/كابشن) تغطية كاملة —
   وكروت QR فوقه ظاهرة، ومتلفسش أي حاجة برة مستطيل الفيديو */
function ensureBotShield(){
  if(document.getElementById('botShield')) return;
  var bs = document.createElement('div'); bs.id='botShield';
  bs.innerHTML = '<span class="brand">Mr Sherif ElSayed</span>';
  wrap.appendChild(bs);
}
/* المستطيلات السودة تحت يمين وشمال — تغطية علامة الاشتراك/اللوجو بتاعة
   يوتيوب (فيه يوتيوب بس) — وبتمنع الدوس على اللي تحتها كمان */
function ensureYtCovers(){
  if(CFG.kind !== 'youtube') return;
  if(!document.getElementById('ytCoverR')){
    var r = document.createElement('div'); r.id = 'ytCoverR'; wrap.appendChild(r);
  }
  if(!document.getElementById('ytCoverL')){
    var l = document.createElement('div'); l.id = 'ytCoverL'; wrap.appendChild(l);
  }
}
/* self-heal: الووترمارك بيرجع يترسم لو حد شاله من الـ DOM */
function ensureWm(){
  if(!CFG.wm.enabled) return;
  if(!document.getElementById('wm')) buildWm();
}
setInterval(function(){ ensureWm(); ensureYtCovers(); ensureBotShield(); }, 4000);
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
/* ===== عرض الفيديو **كامل 100% من غير أي قص** (طلب المستر 2026-هـ:
   "الفيديو مش كامل إنت قاصص منه الأطراف — لازم يبان كله") — مفيش أي قص،
   وأي واجهة يوتيوب بتتغطى بالدروع (الدرع العلوي + باتش اللوجو + الووترمارك). */
function layoutWrap(){
  var fs = isFs() || isFakeFs || parentFs;
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

/* ===== حماية الفحص + منع الحفظ (أحدث قرار للمستر 2026-م) =====
   • كليك يمين → "🚫 كليك يمين ممنوع"
   • (2026-ن) زرار C بقى حر — الكابشن ممنوع خالص ومفيش زرار يفتحه أصلًا
   • F12 + كل زرار function من F1 لـ F12 **فيهم F10 صراحةً** (طلب المستر
     الحرفي: "explicitly intercept and prevent the F10 key (event.key === 'F10')")
     + Ctrl+Shift+I/J/C/K + Ctrl+U/Ctrl+S + Ctrl+Shift+R/S
     → "الخاصية دي ممنوعة" (مفاتيح متصفح فعلًا وبتنمسك بجد)
   • زرار PrintScreen → محاولة تفريغ الحافظة + رسالة
   • ملاحظة صادقة: اختصارات نظام التشغيل نفسها (Win+Shift+S/R للقص) فوق
     صلاحية أي متصفح — لكن كل اختصارات المتصفح وأدوات المطور مقفولة هنا. */
document.addEventListener('contextmenu', function(e){ e.preventDefault(); toast('🚫 كليك يمين ممنوع'); });
document.addEventListener('dragstart', function(e){ e.preventDefault(); });
document.addEventListener('selectstart', function(e){ if(e.target && e.target.id !== 'toast') e.preventDefault(); });
document.addEventListener('keydown', function(e){
  var k = (e.key || '').toLowerCase();
  /* ملاحظة 2026-ن: زرار C مبقاش ليه أي وظيفة — الكابشن ممنوع خالص
     ومفيش أي طريقة لفتحه (زرار C كان بيفتحه زمان واتشال بطلب المستر).
     Ctrl+Shift+C بتاعة أدوات المطور بيتمسك في فحص أدوات المطور تحت */
  var blocked = false;
  /* F10 صراحةً بـ event.key — طلب المستر الحرفي:
     "explicitly intercept and prevent the F10 key (event.key === 'F10')
     from triggering any browser default behavior" */
  if(e.key === 'F10'){ e.preventDefault(); e.stopPropagation(); toast('🛡️ الخاصية دي ممنوعة'); return; }
  /* F12 + كل زرار function من F1 لـ F12 — **فيهم F10** (طلب المستر الحرفي
     2026-ل: "explicitly block the F10 key") */
  if(k === 'f12' || /^f([1-9]|1[0-2])$/.test(k)) blocked = true;
  if((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c' || k === 'k')) blocked = true;
  if((e.ctrlKey || e.metaKey) && (k === 'u' || k === 's')) blocked = true;
  if((e.metaKey || e.ctrlKey) && e.altKey && (k === 'i' || k === 'j' || k === 'c')) blocked = true;
  if(blocked){ e.preventDefault(); e.stopPropagation(); toast('🛡️ الخاصية دي ممنوعة'); return; }
  /* Ctrl + Shift + R / S — إعادة التحميل العنيدة + حفظ الصفحة/أداة القص */
  if(e.ctrlKey && e.shiftKey && (k === 'r' || k === 's')){
    e.preventDefault(); e.stopPropagation(); toast('🛡️ الخاصية دي ممنوعة'); return;
  }
  /* زرار PrintScreen → تحذير + تفريغ الحافظة */
  if(k === 'printscreen' || e.keyCode === 44){
    toast('🛡️ الخاصية دي ممنوعة');
    try{ if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText('🔒 المحتوى محمي').catch(function(){}); }catch(err){}
  }
});
/* (2026-ز) درع الشاشة السودا «المحتوى محمي — السكرين شوت والتسجيل ممنوع»
   اتشال خالص بطلب المستر الصريح — كان بيطلع لوحده أول ما الفيديو يفتح و
   كل دوسة إيقاف/تشغيل (فقدان فوكس عادي للإطار) والمستر قال حرفيًا:
   "لا أنا عاوزك ما تجبهاليش خالص". مفيش أي شاشة فوق الفيديو ولا أي
   إيقاف تلقائي خالص. الحماية الحقيقية دلوقتي: منع الاختصارات والكليك
   يمين + الووترمارك باسم الطالب ورقمه في كل إطار. */
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
/* ===== رسائل الخطأ + إعادة بناء المشغل (2026-ح — علاج "المشغل بيتجهز ومش بيشتغل") =====
   يوتيوب ساعات بيرفض التشغيل خالص (خطأ auth/153 — حماية ضد البوتات على شبكات
   معينة، أو فيديو اتحظر تضمينه، أو فيديو اتمسح). المشغل القديم كان يفشل
   **بصمت** — الطالب بيضغط ويلقي "المشغل بيتجهز" ومفيش أي رسالة أو حل.
   دلوقتي:
   • onError بيظهر سبب واضح بالعربي فورًا (حظر تضمين / فيديو اتمسح / شبكة)
   • لو يوتيوب رفض على www → بنجرب أوتوماتيك مرة واحدة youtube-nocookie.com
   • زرار "حاول تاني" + نصيحة تغيير الشبكة — مفيش شاشة ميّت من غير كلام */
var ytHostKind = 'www';   /* 'www' | 'nocookie' */
var rebuildTries = 0;     /* عداد إعادة بناء المشغل */
var lastErrCode = '';
var tickStarted = false;  /* مؤقت التقدم يتسجل مرة واحدة بس حتى مع إعادة البناء */
function msgForYtError(code){
  var c = String(code || '');
  if(c === '101' || c === '150') return 'الفيديو مرفوض التشغيل هنا — يا إما صاحب الفيديو قفل التضمين، يا إما يوتيوب مرفض على الشبكة دي. غيّر الشبكة (بيانات الموبايل بدل الواي فاي) وحاول تاني — ولو تكررت بلغ الإدارة في قسم الشكاوى';
  if(c === '100') return 'الفيديو ده اتمسح من يوتيوب أو بقى خاص — بلغ الإدارة في قسم الشكاوى';
  if(c === '2') return 'في مشكلة في تعريف الفيديو نفسه — بلغ الإدارة في قسم الشكاوى';
  if(c === '5' || c === 'auth') return 'يوتيوب مرفض تشغيل الفيديو على الشبكة دي حاليًا — غيّر الشبكة (بيانات الموبايل بدل الواي فاي أو العكس) وحاول تاني';
  return 'يوتيوب مرفض تشغيل الفيديو دلوقتي (كود ' + c + ') — غيّر الشبكة وحاول تاني، ولو تكررت بلغ الإدارة';
}
function showPlayError(msg){
  var so = document.getElementById('startOv');
  if(!so) return;
  so.style.display = 'flex';
  var old = document.getElementById('peBox');
  if(old && old.parentNode) old.parentNode.removeChild(old);
  var box = document.createElement('div');
  box.id = 'peBox';
  box.style.cssText = 'position:relative;z-index:6;background:rgba(127,29,29,.82);border:1px solid rgba(252,165,165,.45);border-radius:14px;padding:14px 18px;max-width:86%;direction:rtl;text-align:center;box-shadow:0 10px 34px rgba(0,0,0,.5)';
  box.innerHTML = '<p style="margin:0 0 10px;color:#fff;font-size:13.5px;font-weight:800;line-height:1.95">' + esc(msg) + '</p>' +
    '<button id="peRetry" type="button" style="background:#fff;color:#18181b;border:0;border-radius:10px;padding:9px 22px;font-weight:800;font-size:13.5px;cursor:pointer;font-family:system-ui,sans-serif">حاول تاني ↻</button>' +
    '<p style="margin:9px 0 0;color:rgba(255,255,255,.78);font-size:11px;line-height:1.8">لو ظهرت الرسالة دي تاني — غيّر الشبكة أو بلغ الإدارة في قسم الشكاوى</p>';
  so.appendChild(box);
  var rb = document.getElementById('peRetry');
  if(rb) rb.addEventListener('click', function(e){ e.stopPropagation(); try{ if(box.parentNode) box.parentNode.removeChild(box); }catch(ex){} retryPlayback(); });
}
function retryPlayback(){
  /* أول إعادة → نفس المضيف بمشغل نظيف. بعدها → nocookie. وأي فشل → الوضع البديل المضمون */
  rebuildThenPlay(rebuildTries === 0 ? 'www' : 'nocookie');
  scheduleFallbackIfStuck();
}
function rebuildThenPlay(kind){
  if(rebuildTries >= 2){
    /* (2026-ط) مفيش شاشة ميّت خلاص — لو يوتيوب مرفض على كل المضيفين
       → الوضع البديل المضمون (مشغل مباشر) والفيديو يشتغل */
    activateFallback('rebuild-limit');
    return;
  }
  rebuildTries++;
  ytHostKind = (kind === 'nocookie') ? 'nocookie' : 'www';
  try{ if(playerApi && playerApi.destroy) playerApi.destroy(); }catch(e){}
  playerApi = null;
  if(wdTimer){ clearInterval(wdTimer); wdTimer = null; }
  var old = document.getElementById('ytHost');
  if(old && old.parentNode) old.parentNode.removeChild(old);
  var crop = document.getElementById('ytCrop');
  var host = document.createElement('div');
  host.id = 'ytHost';
  host.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:#000';
  if(crop) crop.appendChild(host); else wrap.appendChild(host);
  pendingStart = true;
  try{ buildPlayer(); }catch(e){ showPlayError(msgForYtError(lastErrCode || 'auth')); }
}
/* ===== مراقب التشغيل — علاج "الفيديو مش بيفتح" =====
   أول أمر playVideo() على الموبايل ممكن يتصفر من المتصفح. بنجرب تاني كل
   700ms بتدرج قوي: playVideo → playVideo → loadVideoById (ضربة قوية بتقفل
   المشكلة نهائيًا) → playVideo → تشغيل صامت (مسموح دايمًا) + زرار تفعيل صوت.
   ومنع النقر المزدوج: بعض المتصفحات بتبعت touchend+click مع بعض.
   + لو الطالب دس قبل ما الـ API يجهز → الطلب بيتسجل وبيتنفذ أول ما يجهز. */
var wdTimer = null, muteFallback = false, lastTap = 0;
var pendingStart = false, pendingResume = 0, ytIdCached = '';
/* ===== (2026-ط) تحميل API يوتيوب بلا استسلام + الوضع البديل المضمون =====
   المشكلة الحقيقية اللي كانت بتقفل الفيديو خالص: سكريبت يوتيوب لو اتأخر
   أو فشل مرة واحدة، المشغل بيفضل "بيتجهز" للأبد من غير أي رسالة أو حل.
   الحل من مرحلتين:
   1) محاولات تحميل متجددة كل 3 ثواني (بالتبديل بين المضيفين + كسر الكاش)
   2) لو الطالب دس والمشغل ماجاش في 6 ثواني → الوضع البديل المضمون:
      مشغل يوتيوب مباشر (embed) بنفس الحمايات (الووترمارك والدروع فوقه
      وكلها pointer-events:none) — الفيديو يشتغل على أي حال مهما حصل */
var apiTimer = null, apiTries = 0, apiSrcIdx = 0, apiScriptPending = false;
var playerBuilt = false, fallbackActive = false, fallbackTimer = null;
var API_HOSTS = ['https://www.youtube.com/iframe_api', 'https://www.youtube-nocookie.com/iframe_api'];
function apiReadyNow(){
  if(playerBuilt || playerApi) return;
  try{
    buildPlayer();
    playerBuilt = true;
    try{ if(apiTimer){ clearInterval(apiTimer); apiTimer = null; } }catch(e2){}
  }catch(e){ try{ showPlayError('حصل خطأ في تجهيز مشغل يوتيوب — دوس حاول تاني'); }catch(e2){} }
}
function injectApi(bust){
  try{
    if(window.YT && window.YT.Player){ apiReadyNow(); return; }
    apiScriptPending = true;
    var s = document.createElement('script');
    s.src = API_HOSTS[apiSrcIdx % API_HOSTS.length] + (bust ? ('?r=' + Date.now()) : '');
    apiSrcIdx++;
    s.onload = function(){ apiScriptPending = false; if(window.YT && window.YT.Player) apiReadyNow(); };
    s.onerror = function(){ apiScriptPending = false; };
    document.head.appendChild(s);
  }catch(e){ apiScriptPending = false; }
}
function activateFallback(reason){
  if(fallbackActive) return;
  if(CFG.kind !== 'youtube'){ showPlayError('حصل خطأ في تشغيل الفيديو — جرب تاني'); return; }
  fallbackActive = true;
  try{ if(apiTimer){ clearInterval(apiTimer); apiTimer = null; } }catch(e){}
  try{ if(wdTimer){ clearInterval(wdTimer); wdTimer = null; } }catch(e){}
  try{ if(fallbackTimer){ clearTimeout(fallbackTimer); fallbackTimer = null; } }catch(e){}
  var ytId = ytIdCached || deobfuscate(CFG.blob, CFG.key);
  if(!ytId){
    fallbackActive = false;
    showPlayError('مش قادرين نوصل لفيديو يوتيوب دلوقتي — اتأكد من النت وحاول تاني، ولو تكررت بلغ الإدارة في قسم الشكاوى');
    return;
  }
  /* شيل طبقات المشغل الأصلي بس — شريط التحكم بتاعنا (mgBar) وطبقة النقر
     (tapLayer) بيفضلوا شغالين: أزرار الشريط بتتحول postMessage تلقائيًا
     لما fallbackActive يبقى true (الأوامر نفسها: تشغيل/إيقاف/كتم) */
  var killIds = ['ytHost','ytCrop','startOv','centerOv','endOv','ytCtrl','peBox','unmuteBtn'];
  for(var i=0;i<killIds.length;i++){ try{ var el = document.getElementById(killIds[i]); if(el && el.parentNode) el.parentNode.removeChild(el); }catch(e){} }
  /* (2026-ك) نمسح مرجع المشغل القديم — من غير كده التايمر بيفضل ينادي على
     مشغل اتشال من الـ DOM ويعمّي الكونسول بتحذيرات على الفاضي */
  playerApi = null;
  var startS = Math.max(0, Math.floor(Number(CFG.resume) || 0));
  if(pendingResume > 5) startS = Math.max(startS, Math.floor(pendingResume));
  var f = document.getElementById('ytPlain');
  if(!f){
    f = document.createElement('iframe');
    f.id = 'ytPlain';
    f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture');
    f.setAttribute('allowfullscreen','');
    f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#000';
    wrap.appendChild(f);
  }
  /* نفس مواصفات المشغل الأصلي بالظبط: **controls=0 — مفيش أي واجهة يوتيوب**
     (لا لوجو ولا وقت ولا share ولا إعدادات — القرار 2026-ؤ) + كابشن مقفول
     + ووترمارك ودروع وشريطنا فوقه — بيتشتغل لو الـ API نفسه ماقدرش يتحمل.
     enablejsapi=1 → بنقدر نبعت أوامر إبادة الكابشن + تشغيل/إيقاف/كتم
     لشريطنا جوه المشغل المباشر (postMessage كل 3 ثواني) — طلب المستر
     الحرفي: «اعمل للكابشن بلوك» في أي مشغل */
  f.src = 'https://www.youtube.com/embed/' + ytId + '?autoplay=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&cc_load_policy=0&cc_lang_pref=ar&hl=ar&disablekb=1&enablejsapi=1&vq=hd1080&origin=' + encodeURIComponent(location.origin || 'https://localhost') + '&start=' + startS;
  layoutWrap();
  try{ if(plainCapTimer){ clearInterval(plainCapTimer); plainCapTimer = null; } }catch(e){}
  plainCapTimer = setInterval(killCaptionsPlain, 3000);
  setTimeout(killCaptionsPlain, 1200);
  /* شريطنا بيفضل شغال في الوضع المباشر: شريط التقدم متخفي (مفيش API
     للمدة هنا) وأزرار التشغيل/الكتم بتبعت postMessage — الحالة متتبعة
     بأفضل مجهود (autoplay=1 → مفترضة شغالة) */
  try{
    plainAssumedPlaying = true; plainAssumedMuted = false;
    var twp = document.getElementById('mgTrackWrap'); if(twp) twp.style.display = 'none';
    setPlayIcon(true); setMuteIcon(false);
  }catch(e){}
  /* (2026-و3) الوضع البديل شغال → شريطنا يتخفي هو كمان بعد لحظات
     (نفس سلوك المشغل الأساسي — مفيش شريط واقف يشتت الطالب) */
  barScheduleHide();
  toast('تمام — الفيديو شغّال دلوقتي ▶');
}
function scheduleFallbackIfStuck(){
  if(fallbackActive || fallbackTimer || CFG.kind !== 'youtube') return;
  fallbackTimer = setTimeout(function(){
    fallbackTimer = null;
    if(playerApi && playerApi.playVideo) return;
    activateFallback('stuck');
  }, 6000);
}
/* ===== الكابشن ممنوع خالص (القرار النهائي للمستر 2026-ن) =====
   طلب المستر الحرفي: «تشيل زرار الكابشن وتشيل الكابشن أصلاً — اعمل للكابشن
   بلوك.. أنا مش عايز أي كتابة تظهر تحت الفيديو عشان بتشتت الطالب».
   التنفيذ على 3 طبقات (من غير أي شريط مرئي — المستر شال البلور اللي تحت):
   1) cc_load_policy=0 + hl=ar + cc_lang_pref=ar → مفيش ترجمة افتراضيًا
      حتى لو حساب يوتيوب بتاع المشاهد فاتح «الترجمة دايمًا» من إعداداته
   2) killCaptions() مع كل تغيير حالة + دوريًا كل 3 ثواني:
      تحميل-ثم-شيل موديول الترجمة بيقتل ترجمة ASR التلقائية كمان
      (اللي getOption مش بيشوفها فبيبان كأن «مفيش ترجمة» وهي ظاهرة)
      + killCaptionsPlain() — أوامر postMessage للوضع البديل المباشر
   3) مفيش زرار CC في أي واجهة ومفيش زرار C في الكيبورد — مفيش أي طريق
      لفتح الترجمة أصلًا */
/* **(تصحيح جذري 2026-و6 — سبب ظهور الكابشن اتحدد)**: loadModule('captions')
   كان بيتنادى هنا مع كل إبادة (كل 3 ثواني!) — تحميل الموديول نفسه بيخلّي
   يوتيوب يجهز ويعرض المسار الافتراضي للترجمة، يعني «العلاج» كان هو السبب.
   الإبادة الصح: تصفير المسار الأول + تفريغ الموديول — من غير أي تحميل خالص */
function killCaptions(){
  try{ playerApi.setOption && playerApi.setOption('captions','track',{}); }catch(e){}
  try{ playerApi.unloadModule && playerApi.unloadModule('captions'); }catch(e){}
}
/* إبادة الكابشن في **الوضع البديل المباشر** (iframe عادي بدون API):
   أوامر واجهة يوتيوب للويجت عبر postMessage — شغالة مع enablejsapi=1.
   بتتنادى كل 3 ثواني — لو حد فتح الكابشن من ⚙ بتنقفل تاني فورًا تقريبًا */
var plainCapTimer = null;
function killCaptionsPlain(){
  try{
    var fr = document.getElementById('ytPlain');
    if(!fr || !fr.contentWindow) return;
    fr.contentWindow.postMessage(JSON.stringify({event:'command', func:'setOption', args:['captions','track',{}]}), '*');
    fr.contentWindow.postMessage(JSON.stringify({event:'command', func:'unloadModule', args:['captions']}), '*');
  }catch(e){}
}
var lastCapCheck = 0;
var lastFloorCheck = 0;
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
    /* الـ API لسه بيتحمل — سجل الطلب وهيتشغل أول ما يجهز (بدل ما أول دوسة تضيع)
       + (2026-ط) نضغط على التحميل فورًا، ولو بعد 6 ثواني مفيش API → الوضع
       البديل المضمون — ممنوع إن الطالب يفضل دايس على طول من غير فيديو */
    pendingStart = true;
    toast('المشغل بيتجهز… ثواني ونشغّله');
    try{ injectApi(true); }catch(e){}
    scheduleFallbackIfStuck();
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
    } else if(attempts === 5){
      try{ playerApi.mute(); muteFallback = true; showUnmuteBtn(); playerApi.playVideo(); }catch(e){}
    } else if(attempts >= 7){
      /* المشغل لسه واقف بعد كل المحاولات → يوتيوب غالبًا رافض التشغيل أصلاً.
         (2026-ط) ممنوع الشاشة الميّتة: محاولة nocookie أوتوماتيك، ولو فشلت
         → الوضع البديل المضمون مباشرة — الفيديو لازم يشتغل */
      clearInterval(wdTimer); wdTimer = null;
      var ec = '';
      try{ ec = String((playerApi.getVideoData && playerApi.getVideoData().errorCode) || ''); }catch(e){}
      if(ec) lastErrCode = ec;
      if(ytHostKind === 'www' && rebuildTries < 1){ rebuildThenPlay('nocookie'); return; }
      activateFallback('yt-refused');
    } else { try{ playerApi.playVideo(); }catch(e){} }
  }, 700);
}
function ytState(){ try{ return playerApi && playerApi.getPlayerState ? playerApi.getPlayerState() : -1; }catch(e){ return -1; } }
/* دورة الووترمارك الكبيرة (10 ظاهرة / 20 مخفية) بتشتغل وقت التشغيل بس —
   عند الإيقاف بتتوقف مؤقتًا ومتكملش (طلب المستر 2026-ل) */
function wmRun(onoff){ try{ var w=document.getElementById('wmBig'); if(w) w.style.animationPlayState = onoff ? 'running' : 'paused'; }catch(e){} }

/* ===== إخفاء شريط التحكم تلقائيًا (2026-و3 — طلب المستر الحرفي:
   «الشريط اللي تحت عاوزها تختفي أول ما أفتح الفيديو عادي، ولما أوقفه تظهر،
   عشان بتفضل ظاهرة طول الفيديو وده بيشتت الطالب»):
   • الفيديو ماشي → الشريط بيختفي بعد 2.6 ثانية من آخر حركة/دوسة
   • أي حركة موس/لمسة → بيرجع فورًا ويعيد العد
   • إيقاف مؤقت أو نهاية → بيرجع ويفضل ظاهر
   • قايمة الجودة ⚙ بتقفل لو الشريط اختفى + مؤشر الموس بيتخفي */
var barHideTimer = null;
function anyPlayingNow(){
  try{
    if(fallbackActive) return !!plainAssumedPlaying;
    if(fileApi) return !fileApi.paused && !fileApi.ended;
    var st = ytState();
    return st === 1 || st === 3;
  }catch(e){ return false; }
}
function setBarHidden(h){
  var b = document.getElementById('mgBar');
  if(b){
    if(h){ b.classList.add('hide'); } else { b.classList.remove('hide'); }
  }
  try{ document.body.style.cursor = h ? 'none' : ''; }catch(e){}
  if(h) closeQMenu();
}
function barStopHide(){
  try{ if(barHideTimer){ clearTimeout(barHideTimer); barHideTimer = null; } }catch(e){}
  setBarHidden(false);
}
function barScheduleHide(){
  try{ if(barHideTimer){ clearTimeout(barHideTimer); barHideTimer = null; } }catch(e){}
  if(!anyPlayingNow()){ setBarHidden(false); return; }
  barHideTimer = setTimeout(function(){
    barHideTimer = null;
    if(anyPlayingNow()) setBarHidden(true);
  }, 2600);
}
function barOnStateChange(){ if(anyPlayingNow()) barScheduleHide(); else barStopHide(); }
function barPoke(){ setBarHidden(false); barScheduleHide(); }
try{
  wrap.addEventListener('pointermove', barPoke);
  wrap.addEventListener('pointerdown', barPoke);
  wrap.addEventListener('touchstart', function(){ barPoke(); }, {passive:true});
}catch(e){}

/* ===== شريط التحكم بتاعنا (تمليين 2026-و2 — بدل كنترولز يوتيوب المحذوفة) =====
   طلب المستر الحرفي: «شريط اللي بجر منه وعلامة التكبير والتصغير
   وعلامة الجودة بس، حتى لو علامة الجودة مش شغالة».
   القرار: controls=0 → مفيش أي واجهة يوتيوب أصلًا،
   وشريطنا 3 عناصر بس: ⚙ الجودة + شريط التقدم بالسحب + ملء الشاشة (كبير).
   التشغيل/الإيقاف بدوسة على الفيديو نفسه (tapLayer) — زي أي مشغل عادي. */
var plainAssumedPlaying = true;   /* حالة الوضع البديل المباشر (autoplay=1) */
var plainAssumedMuted = false;
var mgSeeking = false;
function pmCmd(func, args){
  try{
    var fr = document.getElementById('ytPlain');
    if(fr && fr.contentWindow) fr.contentWindow.postMessage(JSON.stringify({event:'command', func:func, args:args||[]}), '*');
  }catch(e){}
}
function setPlayIcon(playing){
  var b = document.getElementById('mgPlay'); if(!b) return;
  b.innerHTML = playing
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
  b.setAttribute('aria-label', playing ? 'إيقاف مؤقت' : 'تشغيل');
}
function setMuteIcon(muted){
  var b = document.getElementById('mgMute'); if(!b) return;
  b.innerHTML = muted
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  b.setAttribute('aria-label', muted ? 'تشغيل الصوت' : 'كتم الصوت');
}
function ytTogglePlay(){
  if(fallbackActive){
    plainAssumedPlaying = !plainAssumedPlaying;
    pmCmd(plainAssumedPlaying ? 'playVideo' : 'pauseVideo');
    setPlayIcon(plainAssumedPlaying);
    wmRun(plainAssumedPlaying);
    barOnStateChange();
    return;
  }
  try{
    if(ytState() === 1){ playerApi.pauseVideo(); wmRun(false); }
    else { playerApi.playVideo(); wmRun(true); }
    barOnStateChange();
  }catch(e){}
}
function ytToggleMute(){
  if(fallbackActive){
    plainAssumedMuted = !plainAssumedMuted;
    pmCmd(plainAssumedMuted ? 'mute' : 'unMute');
    setMuteIcon(plainAssumedMuted);
    return;
  }
  try{
    var m = false; try{ m = !!(playerApi.isMuted && playerApi.isMuted()); }catch(e){}
    if(m){ playerApi.unMute(); if(playerApi.setVolume) playerApi.setVolume(100); }
    else { playerApi.mute(); }
    setMuteIcon(!m);
  }catch(e){}
}
function mgUpdateProgress(){
  if(fallbackActive || mgSeeking) return;
  try{
    if(!playerApi || !playerApi.getDuration) return;
    var dur = playerApi.getDuration() || 0;
    if(!dur) return;
    var cur = playerApi.getCurrentTime() || 0;
    var fill = document.getElementById('mgFill');
    var buf = document.getElementById('mgBuf');
    if(fill) fill.style.width = Math.min(100, (cur / dur) * 100) + '%';
    if(buf){ var lf = 0; try{ lf = playerApi.getVideoLoadedFraction() || 0; }catch(e){} buf.style.width = (lf * 100) + '%'; }
  }catch(e){}
}
function buildMgBar(){
  if(document.getElementById('mgBar')) return;
  var bar = document.createElement('div'); bar.id = 'mgBar';
  /* تمليين 2026-و2 (طلب المستر الحرفي): الشريط 3 عناصر بس —
     ⚙ الجودة + شريط التقدم + ملء الشاشة الكبير. مفيش تشغيل/كتم/براند:
     التشغيل والإيقاف بدوسة على الفيديو نفسه زي أي مشغل عادي */
  var gear = document.createElement('button'); gear.id = 'mgGear'; gear.type = 'button'; gear.className = 'mBtnWide';
  gear.setAttribute('aria-label','إعدادات الجودة');
  gear.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
    '<span id="mgQLabel">…</span>';
  gear.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); ytCollectLevels(); var m = qMenuEl(); if(m) m.classList.toggle('open'); });
  var tw = document.createElement('div'); tw.id = 'mgTrackWrap';
  tw.innerHTML = '<div id="mgTrack"><div id="mgBuf"></div><div id="mgFill"></div></div>';
  var fsb = document.createElement('button'); fsb.type = 'button'; fsb.className = 'mBtn big';
  fsb.setAttribute('aria-label','تكبير وتصغير');
  fsb.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  fsb.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); toggleFs(); });
  bar.appendChild(gear); bar.appendChild(tw); bar.appendChild(fsb);
  wrap.appendChild(bar);
  /* قايمة الجودة + قفلها بأي دوسة بره القايمة والزرار */
  var qm = document.createElement('div'); qm.id = 'mgQMenu'; wrap.appendChild(qm);
  document.addEventListener('click', function(e){
    var m = qMenuEl(); if(!m || !m.classList.contains('open')) return;
    var t = e.target;
    if(t && (t.id === 'mgGear' || t.id === 'mgQLabel' || (t.closest && t.closest('#mgQMenu')))) return;
    closeQMenu();
  });
  /* السحب على شريط التقدم (الاتجاه LTR ثابت زي أي مشغل فيديو) */
  var trackWrap = document.getElementById('mgTrackWrap');
  var track = document.getElementById('mgTrack');
  function seekTo(clientX){
    if(fallbackActive || !playerApi || !playerApi.getDuration) return;
    try{
      var r = track.getBoundingClientRect();
      if(!r.width) return;
      var frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      var dur = playerApi.getDuration() || 0;
      if(dur){
        playerApi.seekTo(frac * dur, true);
        var fl = document.getElementById('mgFill'); if(fl) fl.style.width = (frac * 100) + '%';
      }
    }catch(e){}
  }
  if(trackWrap && track){
    trackWrap.addEventListener('pointerdown', function(e){
      e.preventDefault(); mgSeeking = true;
      try{ if(e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId); }catch(err){}
      seekTo(e.clientX);
    });
    trackWrap.addEventListener('pointermove', function(e){ if(mgSeeking) seekTo(e.clientX); });
    trackWrap.addEventListener('pointerup', function(){ mgSeeking = false; });
    trackWrap.addEventListener('pointercancel', function(){ mgSeeking = false; });
  }
}
/* ===== أرضية الجودة 480p (2026-و5 — طلب المستر الحرفي: «خلي الجودة
   مقبولة لـ 480 تكون هي دي الجودة وأنا أقدر أغيرها والتغيير يكون بيحصل
   بجد») — نظام من طبقتين:
   1) أرضية دائمة: setPlaybackQualityRange('large','highres') عند كل تشغيل
      وكل تغير جودة ودوريًا — أقرب باب سبه يوتيوب مفتوح لرفع أقل حد للتيار
      (لو النت يسمح بأعلى من 480 ياخد أعلى — لو مش يسمح بـ 480 نفسها
      بيرجع لأقرب مستوى ممكن فوق 360).
   2) حارس دوري: لو التيار مع كده واقف تحت 480 (tiny/small/medium)
      → إعادة تحميل التيار من نفس الثانية بـ large — محاولة محدودة
      (3 مرات بفاصل 12 ثانية) عشان ميقعدش يعيد التحميل على طول.
   لو الطالب اختار مستوى بنفسه من قايمة ⚙ → مفيش أرضية، وبدلها
   ytVerifyQuality بتتحقق كل شوية إن يوتيوب ثبت المستوى المطلوب بجد —
   لو لأ → إعادة طلب (2 مرة كحد أقصى) وبعدها رسالة صادقة بالمستوى
   الفعلي. يوتيوب بيفضل يقدر يتجاهل — أقصى الـ API بيسمح بيه من 2023 */
/* (2026-و9) وقف علّة «يقف ويشتغل» نهائيًا: إعادة تحميل الجودة كانت بتتجدد
   بلا حدود (التصفير بعد أي استقرار) — الفيديو كان بيقف ويشتغل كل شوية.
   دلوقتي: محاولتين بس في عمر الفيديو كله، في أول 90 ثانية بس، وبينهم 25
   ثانية، وبعدها رسالة صادقة واحدة — التشغيل السلس أهم من إلحاح 480p،
   والتلميح قبل التشغيل (onReady) هو فرصة 480p من غير أي قطيعة */
var qFloorTries = 0, qFloorLast = 0, qFloorTold = false;
function ytApplyFloor(){
  if(fallbackActive || ytQWanted) return;
  try{ if(playerApi && playerApi.setPlaybackQualityRange) playerApi.setPlaybackQualityRange('large','highres'); }catch(e){}
}
function ytFloorGuard(){
  if(fallbackActive || ytQWanted || !playerApi || !ytIdCached) return;
  if(qFloorTries >= 2){
    if(!qFloorTold){ qFloorTold = true;
      var qf = '';
      try{ qf = String(playerApi.getPlaybackQuality() || ''); }catch(e){}
      if(qf === 'tiny' || qf === 'small' || qf === 'medium'){
        toast('يوتيوب مثبّت دلوقتي على ' + ytQName(qf) + ' — عرض 480p محتاج سرعة إنترنت أعلى، ومش هنقطع الفيديو تاني'); }
    }
    return;
  }
  var cur = 0; try{ cur = playerApi.getCurrentTime()||0; }catch(e){}
  if(cur > 90) return; /* ممنوع قطع الفيديو في النص — المحاولات في البداية بس */
  var q = '';
  try{ q = String(playerApi.getPlaybackQuality() || ''); }catch(e){}
  if(q !== 'tiny' && q !== 'small' && q !== 'medium') return;
  var now = Date.now();
  if(now - qFloorLast < 25000) return;
  qFloorTries++; qFloorLast = now;
  try{
    playerApi.loadVideoById(ytIdCached, Math.max(0, Math.floor(cur)), 'large');
    try{ if(playerApi.setPlaybackQualityRange) playerApi.setPlaybackQualityRange('large','highres'); }catch(e){}
  }catch(e){}
}
/* ===== متحقق اختيار الطالب (2026-و5 — طلب المستر: «والتغيير يكون بيحصل
   بجد مش زي كل مرة تقولي اشتغل وهو مبيشتغلش»): لما الطالب يختار مستوى من
   ⚙ بنبعت الطلب، وبعدها بنتحقق دوريًا إن يوتيوب ثبت نفس المستوى فعلًا.
   لو ثبت غيره → إعادة الطلب من نفس الثانية (2 محاولات بفاصل 6 ثواني)،
   ولو استمر → رسالة صادقة بالمستوى الحقيقي اللي يوتيوب مثبته */
/* 2026-و11 — علة تعليق الفيديو الأخيرة: التصفير qVerifyTries=0 بعد الرسالة
   كان بيخلّي الدورة (تحميتين كل 18 ثانية للأبد) تتكرر من غير نهاية لما
   يوتيوب يرفض المستوى المطلوب — بقت رسالة واحدة بعدها سكوت تام،
   والصفير بيتصفّر بس لو يوتيوب ثبت المستوى المطلوب فعلًا */
var qVerifyTries = 0, qVerifyLast = 0, qVerifyTold = false;
function ytVerifyQuality(){
  if(fallbackActive || !ytQWanted || !playerApi || !ytIdCached) return;
  var st = 0; try{ st = playerApi.getPlayerState ? playerApi.getPlayerState() : 0; }catch(e){}
  if(st !== 1 && st !== 3) return;
  var q = ytCurQuality();
  if(q === ytQWanted){ qVerifyTries = 0; qVerifyLast = 0; qVerifyTold = false; return; }
  if(qVerifyTold) return; /* الرسالة ظهرت = مفيش قطع تاني — السلاسة أهم */
  var now = Date.now();
  if(now - qVerifyLast < 6000) return;
  qVerifyTries++; qVerifyLast = now;
  if(qVerifyTries > 2){
    qVerifyTold = true;
    toast('يوتيوب ثابت دلوقتي على ' + ytQName(q) + ' — المستوى المطلوب مش ثابت على سرعة النت الحالية');
    return;
  }
  try{
    var cur2 = 0; try{ cur2 = playerApi.getCurrentTime()||0; }catch(e){}
    playerApi.loadVideoById(ytIdCached, Math.max(0, Math.floor(cur2)), ytQWanted);
    try{ if(playerApi.setPlaybackQualityRange) playerApi.setPlaybackQualityRange(ytQWanted, ytQWanted); }catch(e){}
    try{ playerApi.playVideo(); }catch(e){}
  }catch(e){}
}
/* ===== ⚙ قايمة جودة يوتيوب (2026-و2 — طلب المستر الحرفي: «علامة الجودة
   بس، حتى لو علامة الجودة مش شغالة»): بنعرض المستويات الحقيقية المتاحة
   من يوتيوب + الرقم الحي من getPlaybackQuality على الزرار، واختيار الطالب
   بيتطلب بأفضل مجهود (loadVideoById + suggestedQuality + Range) — يوتيوب
   بيوزّع النهائي حسب سرعة النت وبيمكن يتجاهل الطلب، والمستر موافق صراحة.
   **الجودة المضمونة فعليًا = لينك مباشر (مش يوتيوب)** — ساعتها المشغل
   العادي بيبدّل المستويات بجد عبر HLS أو بيعرض جودة الملف الأصلية */
var ytQLevels = [], ytQWanted = '';
var YT_Q_ORDER = {tiny:1,small:2,medium:3,large:4,hd720:5,hd1080:6,hd1440:7,hd2160:8,highres:9};
function ytQName(q){ return ({tiny:'144p',small:'240p',medium:'360p',large:'480p',hd720:'720p',hd1080:'1080p',hd1440:'1440p',hd2160:'4K',highres:'أعلى جودة'})[q] || 'تلقائي'; }
function ytCurQuality(){ try{ if(playerApi && playerApi.getPlaybackQuality) return String(playerApi.getPlaybackQuality()||''); }catch(e){} return ''; }
function ytUpdateQLabel(){
  var el = document.getElementById('mgQLabel'); if(!el) return;
  var cur = ytCurQuality();
  el.textContent = cur ? ytQName(cur) : 'تلقائي';
}
function ytCollectLevels(){
  if(!fallbackActive){
    try{
      if(playerApi && playerApi.getAvailableQualityLevels){
        var ls = playerApi.getAvailableQualityLevels() || [];
        var real = [];
        for(var i=0;i<ls.length;i++){ if(ls[i] && ls[i] !== 'auto' && real.indexOf(ls[i]) === -1) real.push(ls[i]); }
        if(real.length) ytQLevels = real;
      }
    }catch(e){}
  }
  ytRenderQMenu(); ytUpdateQLabel();
}
function ytRenderQMenu(){
  var m = qMenuEl(); if(!m) return;
  var cur = ytCurQuality();
  var autoOn = (!ytQWanted || cur === 'auto');
  var html = '<div class="qHead">إعدادات الجودة</div>';
  html += '<div class="qi' + (autoOn ? ' on' : '') + '" data-q="auto"><span>تلقائي' + (cur && cur !== 'auto' ? ' (' + ytQName(cur) + ')' : '') + '</span><span class="ck">' + (autoOn ? '✓' : '') + '</span></div>';
  var sorted = ytQLevels.slice().sort(function(a,b){ return (YT_Q_ORDER[b]||0) - (YT_Q_ORDER[a]||0); });
  for(var i=0;i<sorted.length;i++){
    var q = sorted[i];
    html += '<div class="qi' + (ytQWanted === q ? ' on' : '') + '" data-q="' + q + '"><span>' + ytQName(q) + '</span><span class="ck">' + (ytQWanted === q ? '✓' : '') + '</span></div>';
  }
  html += '<div class="qNote">الجودة بتُطلب تلقائيًا بـ 480p على الأقل — ويوتيوب بيرفعها أعلى لو النت يسمح. ولو اخترت مستوى بنفسك هنطلب ونتحقق إنه ثبت بجد</div>';
  m.innerHTML = html;
  var items = m.getElementsByClassName('qi');
  for(var j=0;j<items.length;j++){
    (function(item){
      item.addEventListener('click', function(ev){
        ev.preventDefault(); ev.stopPropagation();
        ytSetQuality(String(item.getAttribute('data-q')||'auto'));
      });
    })(items[j]);
  }
}
function ytSetQuality(q){
  ytQWanted = (q === 'auto') ? '' : q;
  qVerifyTries = 0; qVerifyLast = 0;
  try{
    if(playerApi && playerApi.loadVideoById && ytIdCached){
      var cur = 0; try{ cur = playerApi.getCurrentTime()||0; }catch(e){}
      playerApi.loadVideoById(ytIdCached, Math.max(0, Math.floor(cur)), ytQWanted || 'default');
      try{ if(playerApi.setPlaybackQualityRange) playerApi.setPlaybackQualityRange(ytQWanted || 'auto', ytQWanted || 'auto'); }catch(e){}
      try{ playerApi.playVideo(); }catch(e){}
      toast('تم طلب جودة ' + (ytQWanted ? ytQName(ytQWanted) : 'تلقائي') + ' — وبنمتأكد إنها ثبتت بجد');
    } else {
      toast('الجودة تلقائية في الوضع ده');
    }
  }catch(e){}
  closeQMenu();
  ytRenderQMenu(); ytUpdateQLabel();
}

function mountYouTube(){
  var ytId = deobfuscate(CFG.blob, CFG.key);
  if(!ytId){ wrap.innerHTML = '<p style="color:#fca5a5;font-family:sans-serif;padding:24px;direction:rtl">حصل خطأ في تحميل الفيديو</p>'; return; }
  /* **مفيش أي كنترولز يوتيوب خالص** (القرار النهائي 2026-ؤ — طلب المستر
     الحرفي: «مش لاقي زرار الإعدادات.. خبي علامة اليوتيوب.. علامة الـ share
     والـ time دي لغيها»): controls=0 → لوجو يوتيوب والوقت وshare والقايمة
     كلهم **ماتشالوا من الأساس** (مش متغطيين — الغطاء كان بيفشل مع RTL).
     مكانهم شريط تحكمنا (تشغيل/تقدم/ملء شاشة + الجودة) والفيديو
     كامل 100% من غير أي قص.
     (ملغاة 2026-و4: استثناء وضع كود HTML embed اتنست — المستر شال الميزة
     نفسها لأنها كانت بتجيب واجهة يوتيوب) */
  var host = document.createElement('div');
  host.id = 'ytHost';
  host.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:#000';
  wrap.appendChild(host);
  /* الكابشن: إبادة API + postMessage دورية — من غير أي تغطية مرئية زيادة
     (غطاء capLid اتشال نهائيًا 2026-و2 بطلب المستر: «الفيديو من غير قص
     تحت») — الشريط السفلي Opaque بتاعنا هو التغطية الوحيدة الباقية */
  // شاشة البداية — **صورة الفيديو الحقيقية من يوتيوب** (بتغطي أي عنوان/
  // برanding بتاع يوتيوب لحظة التحميل) + دوسة الطالب = إذن تشغيل بالصوت
  var startOv = document.createElement('div');
  startOv.id='startOv';
  startOv.innerHTML = '<img src="https://i.ytimg.com/vi/' + ytId + '/maxresdefault.jpg" ' +
    'onerror="this.onerror=null;this.src=\\'https://i.ytimg.com/vi/' + ytId + '/hqdefault.jpg\\';" ' +
    'alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' +
    'filter:brightness(.34) saturate(.92);pointer-events:none">' +
    '<div class="big" style="position:relative"><svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg></div><p style="position:relative">اضغط للمشاهدة</p>';
  startOv.addEventListener('click', function(){ if(!tapOk()) return; startWithWatchdog(); });
  startOv.addEventListener('touchend', function(e){ e.preventDefault(); if(!tapOk()) return; startWithWatchdog(); });
  wrap.appendChild(startOv);
  // طبقة النقر — دوسة على الفيديو نفسه = تشغيل/إيقاف عن طريق الـ API
  // (زي سلوك يوتيوب، بس بأمر من عندنا لأن كنترولزه مقفولة controls=0)
  var tap = document.createElement('div');
  tap.id = 'tapLayer';
  tap.addEventListener('click', function(){ if(!tapOk()) return; ytTogglePlay(); });
  wrap.appendChild(tap);
  // شريط التحكم بتاعنا — ملء الشاشة الأصلي ليوتيوب مقفول (fs:0) وزراره
  // في شريطنا عشان الووترمارك والدروع تفضل شغالة جوه ملء الشاشة
  buildMgBar();
  // شاشة النهاية (بتغطي شاشة يوتيوب النهائية بالعنوان والاقتراحات)
  var endOv = document.createElement('div'); endOv.id='endOv';
  endOv.innerHTML = '<p>🎉 خلصت الفيديو — برافو عليك!</p><button type="button" id="replayBtn">شوفه تاني ↺</button>';
  wrap.appendChild(endOv);
  document.getElementById('replayBtn').addEventListener('click', function(e){ e.stopPropagation(); try{ playerApi.seekTo(0,true); playerApi.playVideo(); }catch(err){} });
  /* (2026-ط) تحميل API يوتيوب بلا استسلام: الكولباك بيتحدد قبل حقن السكريبت
     (قفل سباق التحميل)، والتحميل بيتجدد كل 3 ثواني بالتبديل بين المضيفين
     (www ↔ nocookie) مع كسر الكاش — مفيش "بيتجهز للأبد" خالص: إما API يجهز
     أو الوضع البديل المضمون (iframe مباشر بنفس المواصفات) يشتغل تلقائيًا */
  ytIdCached = ytId;
  window.onYouTubeIframeAPIReady = apiReadyNow;
  if(window.YT && window.YT.Player){ apiReadyNow(); }
  injectApi(false);
  if(apiTimer){ clearInterval(apiTimer); }
  apiTries = 0;
  apiTimer = setInterval(function(){
    if(playerApi || fallbackActive){ if(apiTimer){ clearInterval(apiTimer); apiTimer = null; } return; }
    apiTries++;
    injectApi((apiTries % 2) === 0);
    if(apiTries === 4){
      var so = document.getElementById('startOv');
      if(so){
        var pm = so.getElementsByTagName('p')[0];
        if(pm) pm.textContent = 'الاتصال بطيء — دوس تاني وهيشتغل خلال لحظات';
      }
    }
  }, 3000);
}

function buildPlayer(){
  var ytId = ytIdCached;
  var popts = {
    videoId: ytId,
    width: '100%',
    height: '100%',
    /* **controls:0 — مفيش أي واجهة يوتيوب خالص** (القرار النهائي 2026-ؤ):
       مفيش لوجو/وقت/share/إعدادات — كله اتمسح من الأساس. كل التحكم بيبقت
       عندنا (شريط mgBar + tapLayer عن طريق الـ JS API) */
    playerVars: { autoplay:1, controls:0, rel:0, modestbranding:1, playsinline:1, iv_load_policy:3, cc_load_policy:0, cc_lang_pref:'ar', hl:'ar', fs:0, disablekb:1, enablejsapi:1, vq:'hd1080', origin: location.origin },
    events: {
      onReady: function(ev){
        /* تكملة المشاهدة بنأجلها لأول لحظة تشغيل فعلية — أعلى أمان على الموبايل
           (الـ seek قبل التشغيل كان بعلّق المشغل في حالة cued على بعض الأجهزة) */
        try{ if(Number(CFG.resume) > 5) pendingResume = Number(CFG.resume); }catch(e){}
        killCaptions();
        /* (2026-س1) دفعة مكثفة لإبادة الكابشن بعد الجاهزية — «تمنعه منعاً باتاً»:
           0.4/1.2/2.5/4 ثواني — لو يوتيوب جهز موديول الترجمة متأخر بيتإباد فورًا
           + الإبادة الدورية كل 3 ثواني شغالة زي ما هي */
        try{
          [400, 1200, 2500, 4000, 6000, 8000].forEach(function(ms){ setTimeout(killCaptions, ms); });
        }catch(e){}
        /* (2026-و8) تلميح 480p من أول لحظة: لو التيار المقرر دلوقتي تحت 480
           والفيديو لسه مش شغال → إعادة ترتيب بـ large قبل أي تشغيل —
           ده كان سبب إن أول تشغيل بيبدأ 360p (التلميح كان في مسار إعادة
           المحاولة بس) */
        try{
          setTimeout(function(){
            try{
              if(fallbackActive || ytQWanted || !playerApi || !ytIdCached) return;
              var st0 = 0; try{ st0 = playerApi.getPlayerState ? playerApi.getPlayerState() : -1; }catch(e){}
              if(st0 === 1 || st0 === 3) return;
              var q0 = ''; try{ q0 = String(playerApi.getPlaybackQuality() || ''); }catch(e){}
              if(q0 === 'tiny' || q0 === 'small' || q0 === 'medium'){
                playerApi.cueVideoById(ytIdCached, 0, 'large');
                try{ if(playerApi.setPlaybackQualityRange) playerApi.setPlaybackQualityRange('large','highres'); }catch(e){}
              }
            }catch(e){}
          }, 1200);
        }catch(e){}
        try{ setMuteIcon(!!(playerApi.isMuted && playerApi.isMuted())); }catch(e){}
        if(pendingStart){ pendingStart = false; startWithWatchdog(); }
        layoutWrap();
      },
      onPlaybackQualityChange: function(){
        /* أرضية 480p: أي تغير جودة من يوتيوب → بنعيد طلب الأرضية فورًا
           (لو الطالب مش مختار مستوى صريح) */
        ytApplyFloor();
        ytUpdateQLabel();
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
            /* الكابشن ممنوع خالص — إبادة فورية مع كل تشغيل (قرار 2026-ن) */
            killCaptions();
            /* قايمة الجودة: نجمع المستويات المتاحة من يوتيوب ونحدّث الزرار */
            ytCollectLevels();
            /* أرضية 480p مع كل تشغيل — طلب المستر 2026-و5: «مقبولة لـ 480» */
            ytApplyFloor();
            /* دورة الووترمارك الكبيرة بتشتغل مع التشغيل */
            wmRun(true);
            setPlayIcon(true);
            /* (2026-و3) الشريط يختفي لوحده أول ما الفيديو يمشي */
            barScheduleHide();
            var so=document.getElementById('startOv'); if(so) so.style.display='none';
            var eo=document.getElementById('endOv'); if(eo) eo.style.display='none';
          } else if(ev.data === YT.PlayerState.PAUSED){
            wmRun(false);
            killCaptions();
            setPlayIcon(false);
            /* (2026-و3) الإيقاف → الشريط يرجع يظهر فورًا */
            barStopHide();
          } else if(ev.data === YT.PlayerState.ENDED){
            wmRun(false);
            setPlayIcon(false);
            barStopHide();
            var eo2=document.getElementById('endOv'); if(eo2) eo2.style.display='flex';
            /* رجوع للبداية + وقوف → شاشة اقتراحات يوتيوب عمرها ما بتترسم */
            try{ playerApi.seekTo(0,true); playerApi.pauseVideo(); }catch(e){}
            reportEnded();
          }
        }catch(e){}
      },
      onApiChange: function(){
        /* أول ما موديول الترجمة يتجهز → بيتإباد فورًا (الكابشن ممنوع خالص) */
        killCaptions();
      },
      onError: function(ev){
        /* يوتيوب رفض الفيديو نفسه — ممنوع الصمت: سبب واضح فورًا.
           100 = الفيديو اتمسح/خاص. 2 = تعريف غلط → رسالة فورية (إعادة مش هتنفع).
           101/150/5/auth = منع تضمين أو رفض شبكة (حماية ضد البوتات بترجع 150
           برضه) → محاولة أوتوماتيك واحدة على youtube-nocookie، وبعدها
           **الوضع البديل المضمون (مشغل مباشر embed)** — الفيديو يشتغل على أي حال
           بدل شاشة الخطأ الميّتة (2026-ط) */
        var code = '';
        try{ code = String((ev && ev.data) || ''); }catch(e){}
        lastErrCode = code;
        if(wdTimer){ clearInterval(wdTimer); wdTimer = null; }
        if(code === '100' || code === '2'){ showPlayError(msgForYtError(code)); return; }
        if(ytHostKind === 'www' && rebuildTries < 1){ rebuildThenPlay('nocookie'); return; }
        activateFallback('on-error-' + (code || 'auth'));
      }
    }
  };
  /* المحاولة الثانية بتتم على youtube-nocookie.com — مضيف تاني بيتجاوز بعض
     حالات الرفض (خطأ 153/auth) بنفس الـ API بالظبط */
  if(ytHostKind === 'nocookie') popts.host = 'https://www.youtube-nocookie.com';
  playerApi = new YT.Player('ytHost', popts);
  /* مؤقت التقدم/الجودة — مرة واحدة بس حتى لو المشغل اتبنى من جديد */
  if(!tickStarted){
    tickStarted = true;
    setInterval(function(){
    try{
      if(playerApi && playerApi.getCurrentTime){
        var cur = playerApi.getCurrentTime() || 0, dur = playerApi.getDuration() || 0;
        reportProgress(cur, dur);
        mgUpdateProgress();
        ytUpdateQLabel();
        /* أرضية 480p دورية: طلب الأرضية كل 5 ثواني + حارس محدود (محاولتين
           في أول 90 ثانية بس — من غير قطيعة) + متحقق اختيار الطالب */
        var floorNow = Math.floor(Date.now() / 5000);
        if(floorNow !== lastFloorCheck){ lastFloorCheck = floorNow; ytApplyFloor(); }
        ytFloorGuard();
        ytVerifyQuality();
        /* حارس النهاية: لو شاشة الاقتراحات هتظهر (ENDED ماتفوتش) → غطّي فورًا */
        if(ytState()===0){
          var eo3=document.getElementById('endOv');
          if(eo3 && eo3.style.display!=='flex'){ eo3.style.display='flex'; try{ playerApi.seekTo(0,true); playerApi.pauseVideo(); }catch(e){} reportEnded(); }
        }
        /* الكابشن ممنوع خالص — إبادة دورية كل 3 ثواني (بتقتل ترجمة ASR كمان):
           حتى لو يوتيوب حاول يطلّع أي سطر، بيتشال فورًا — من غير أي شريط
           بلور مرئي (اتشال بطلب المستر — كان بيغطي زرار الإعدادات ⚙) */
        var capNow = Math.floor(Date.now() / 3000);
        if(capNow !== lastCapCheck){
          lastCapCheck = capNow;
          killCaptions();
        }
      }
    }catch(e){}
    }, 1000);
  }
}

/* ============================================================
   مشغّل الملفات — **المشغل العادي** (قرار المستر 2026-و)
   «غيرلي المشغل بتاع الفيديوهات.. خليه مشغل عادي من غير أي يوتيوب
   ولا أي حاجة تبقى من يوتيوب.. يكون فيه إعدادات بتاعت الجودة..
   تعرف حاجات تكون شايفها»
   ============================================================
   • شريط تحكم عادي كامل من عندنا: تشغيل/إيقاف + شريط تقدم بالسحب
     + **الوقت (الحالي / المدة)** + كتم + **⚙ إعدادات الجودة** +
     ملء شاشة + اسم المنصة — نفس شكل الشريط المعتمد
   • إعدادات الجودة شغالة بجد:
     - بث HLS (.m3u8) → قايمة حقيقية من ملف البث (تلقائي + 1080p/720p/480p…)
       والتبديل فوري من غير إعادة تحميل (hls.js)
     - ملف MP4 مباشر → بيتشغّل بجودته الأصلية ثابتة والقايمة تعرضها
       — ده الحل الجذري لمشكلة «مختار 1080 وبيثبت على 360»:
       الملف الأصلي 1080 بيفضل 1080 — مفيش حد بيقلله خالص
   • الكابشن ممنوع زي ما هو: إتلاف أي tracks مدمجة + مفيش زرار CC أصلًا
   • كل الحمايات شغالة: ووترمارك + دروع + منع كليك يمين/مفاتيح + تذاكر */
var fileApi = null, hlsApi = null, hlsLevels = [], hlsAuto = true, hlsCurIdx = -1;
var fileQualityLabel = '';
function fmtTime(s){
  s = Math.max(0, Math.floor(Number(s) || 0));
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  var ss = (x < 10 ? '0' : '') + x;
  return h ? (h + ':' + (m < 10 ? '0' : '') + m + ':' + ss) : (m + ':' + ss);
}
function hLabel(h){
  h = Number(h) || 0;
  var names = {2160:'4K', 1440:'1440p', 1080:'1080p', 720:'720p', 480:'480p', 360:'360p', 240:'240p', 144:'144p'};
  return names[h] || (h ? (h + 'p') : 'أصلية');
}
/* رسايل أخطاء المشغل العادي — شاشة واضحة + زرار إعادة */
function fileError(msg){
  var ov = document.getElementById('fileErrOv');
  if(!ov){
    ov = document.createElement('div'); ov.id = 'fileErrOv';
    ov.style.cssText = 'position:absolute;inset:0;z-index:75;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(2,2,8,.92)';
    ov.innerHTML = '<p style="color:#fff;font-size:13.5px;font-weight:700;max-width:82%;text-align:center;line-height:1.95;margin:0;direction:rtl"></p>' +
      '<button type="button" style="padding:10px 22px;border-radius:10px;border:0;background:#fff;color:#111;font-weight:800;font-size:13px;cursor:pointer;font-family:system-ui,sans-serif">حاول تاني ↻</button>';
    ov.getElementsByTagName('button')[0].addEventListener('click', function(){ try{ location.reload(); }catch(e){} });
    wrap.appendChild(ov);
  }
  ov.style.display = 'flex';
  try{ ov.getElementsByTagName('p')[0].textContent = msg; }catch(e){}
}
/* ===== قايمة الجودة ⚙ (ظاهرة وشغالة — الطلب الأساسي للمستر) ===== */
function qMenuEl(){ return document.getElementById('mgQMenu'); }
function closeQMenu(){ var m = qMenuEl(); if(m) m.classList.remove('open'); }
function updateQLabel(){
  var el = document.getElementById('mgQLabel'); if(!el) return;
  if(hlsLevels.length){
    if(hlsAuto){
      var hh = (hlsCurIdx >= 0 && hlsLevels[hlsCurIdx]) ? hlsLevels[hlsCurIdx].h : 0;
      el.textContent = hh ? ('تلقائي • ' + hLabel(hh)) : 'تلقائي';
    } else {
      el.textContent = hLabel((hlsLevels[hlsCurIdx] || {}).h);
    }
  } else {
    el.textContent = fileQualityLabel || 'أصلية';
  }
}
function renderQMenu(){
  var m = qMenuEl(); if(!m) return;
  var html = '<div class="qHead">إعدادات الجودة</div>';
  if(hlsLevels.length){
    html += '<div class="qi' + (hlsAuto ? ' on' : '') + '" data-lv="-1"><span>تلقائي' + (hlsAuto && hlsCurIdx >= 0 && hlsLevels[hlsCurIdx] ? (' (' + hLabel(hlsLevels[hlsCurIdx].h) + ')') : '') + '</span><span class="ck">' + (hlsAuto ? '✓' : '') + '</span></div>';
    var sorted = hlsLevels.map(function(l, i){ return { h: l.h, i: i }; }).sort(function(a, b){ return (b.h || 0) - (a.h || 0); });
    for(var i = 0; i < sorted.length; i++){
      var L = sorted[i];
      html += '<div class="qi' + (!hlsAuto && hlsCurIdx === L.i ? ' on' : '') + '" data-lv="' + L.i + '"><span>' + hLabel(L.h) + '</span><span class="ck">' + ((!hlsAuto && hlsCurIdx === L.i) ? '✓' : '') + '</span></div>';
    }
  } else {
    html += '<div class="qi on"><span>' + esc(fileQualityLabel || 'الجودة الأصلية') + '</span><span class="ck">✓</span></div>';
    html += '<div class="qNote">الملف بيتشغّل بجودته الأصلية ثابت — مفيش تقليل تلقائي خالص</div>';
  }
  m.innerHTML = html;
  var items = m.getElementsByClassName('qi');
  for(var j = 0; j < items.length; j++){
    (function(item){
      item.addEventListener('click', function(ev){
        ev.preventDefault(); ev.stopPropagation();
        var lv = parseInt(item.getAttribute('data-lv'), 10);
        if(hlsApi && hlsLevels.length && !isNaN(lv)){
          hlsAuto = (lv === -1);
          try{ hlsApi.currentLevel = lv; }catch(e){}
          if(!hlsAuto) hlsCurIdx = lv;
          renderQMenu(); updateQLabel();
        }
        closeQMenu();
      });
    })(items[j]);
  }
}
/* ===== بث HLS (.m3u8) — مستويات جودة حقيقية من ملف البث ===== */
function setupHls(url){
  function nativeHls(){ try{ return !!(fileApi && fileApi.canPlayType && fileApi.canPlayType('application/vnd.apple.mpegurl')); }catch(e){ return false; } }
  function boot(){
    var Hls = window.Hls;
    if(!Hls || !Hls.isSupported || !Hls.isSupported()){
      if(nativeHls()){ fileApi.src = url; return; }
      fileError('المتصفح ده مش بيدعم بث HLS — جرب كروم أو بلغ الإدارة في قسم الشكاوى');
      return;
    }
    try{
      var hls = new Hls({ enableWorker: true });
      hlsApi = hls;
      hls.loadSource(url);
      hls.attachMedia(fileApi);
      hls.on(Hls.Events.MANIFEST_PARSED, function(ev, data){
        try{
          var ls = (data && data.levels) || [];
          hlsLevels = [];
          for(var i = 0; i < ls.length; i++){ hlsLevels.push({ h: ls[i].height || 0 }); }
          hlsAuto = true; hlsCurIdx = -1;
          renderQMenu(); updateQLabel();
        }catch(e){}
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, function(ev, data){
        try{
          if(data && typeof data.level === 'number'){
            hlsCurIdx = data.level; updateQLabel();
            var mm = qMenuEl(); if(mm && mm.classList.contains('open')) renderQMenu();
          }
        }catch(e){}
      });
      hls.on(Hls.Events.ERROR, function(ev, data){
        try{
          if(data && data.fatal){
            if(data.type === Hls.ErrorTypes.NETWORK_ERROR){ hls.startLoad(); }
            else if(data.type === Hls.ErrorTypes.MEDIA_ERROR){ hls.recoverMediaError(); }
            else { fileError('مصدر البث مش متاح دلوقتي — اتأكد من النت وحاول تاني، ولو تكررت بلغ الإدارة في قسم الشكاوى'); }
          }
        }catch(e){}
      });
    }catch(e){ fileError('حصل خطأ في تشغيل البث — جرب تاني'); }
  }
  if(window.Hls){ boot(); return; }
  var s = document.createElement('script');
  s.src = '/hls.min.js';
  s.onload = function(){ boot(); };
  s.onerror = function(){
    if(nativeHls()){ fileApi.src = url; return; }
    fileError('مش قادرين نحمّل مشغل البث — اتأكد من النت وحاول تاني');
  };
  document.head.appendChild(s);
}
/* ===== تحديث التقدم + الوقت في شريط الملفات ===== */
function fileUpdateProgress(){
  var v = fileApi; if(!v) return;
  var d = v.duration || 0;
  var fl = document.getElementById('mgFill'), bf = document.getElementById('mgBuf'), tl = document.getElementById('mgTime');
  if(fl && d) fl.style.width = Math.min(100, (v.currentTime / d) * 100) + '%';
  if(bf && d){ try{ var b = v.buffered; var end = b.length ? b.end(b.length - 1) : 0; bf.style.width = Math.min(100, (end / d) * 100) + '%'; }catch(e){} }
  if(tl) tl.textContent = fmtTime(v.currentTime) + ' / ' + (d ? fmtTime(d) : '…');
}
/* ===== بناء شريط التحكم العادي (نفس شكل الشريط المعتمد) ===== */
function buildFileBar(){
  if(document.getElementById('mgBar')) return;
  var bar = document.createElement('div'); bar.id = 'mgBar';
  var v = fileApi;
  var play = document.createElement('button'); play.id = 'mgPlay'; play.type = 'button'; play.className = 'mBtn';
  play.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); try{ if(v.paused){ v.play(); } else { v.pause(); } }catch(err){} });
  var tw = document.createElement('div'); tw.id = 'mgTrackWrap';
  tw.innerHTML = '<div id="mgTrack"><div id="mgBuf"></div><div id="mgFill"></div></div>';
  var fSeeking = false;
  function fSeekTo(clientX){
    try{
      var tr = document.getElementById('mgTrack'); if(!tr) return;
      var r = tr.getBoundingClientRect(); if(!r.width) return;
      var d = v.duration || 0; if(!d) return;
      var frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      v.currentTime = frac * d;
      var fl = document.getElementById('mgFill'); if(fl) fl.style.width = (frac * 100) + '%';
    }catch(e){}
  }
  tw.addEventListener('pointerdown', function(e){ e.preventDefault(); fSeeking = true; try{ if(e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId); }catch(err){} fSeekTo(e.clientX); });
  tw.addEventListener('pointermove', function(e){ if(fSeeking) fSeekTo(e.clientX); });
  tw.addEventListener('pointerup', function(){ fSeeking = false; });
  tw.addEventListener('pointercancel', function(){ fSeeking = false; });
  var time = document.createElement('span'); time.id = 'mgTime'; time.textContent = '0:00 / …';
  var mute = document.createElement('button'); mute.id = 'mgMute'; mute.type = 'button'; mute.className = 'mBtn';
  mute.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); try{ v.muted = !v.muted; setMuteIcon(v.muted); }catch(err){} });
  /* ⚙ إعدادات الجودة — ظاهرة وشغالة (طلب المستر الحرفي) */
  var gear = document.createElement('button'); gear.id = 'mgGear'; gear.type = 'button'; gear.className = 'mBtnWide';
  gear.setAttribute('aria-label', 'إعدادات الجودة');
  gear.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
    '<span id="mgQLabel">…</span>';
  gear.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); var m = qMenuEl(); if(m) m.classList.toggle('open'); });
  var fsb = document.createElement('button'); fsb.type = 'button'; fsb.className = 'mBtn';
  fsb.setAttribute('aria-label','ملء الشاشة');
  fsb.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  fsb.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); toggleFs(); });
  var brand = document.createElement('span'); brand.id = 'mgBrand'; brand.textContent = 'Mr Sherif ElSayed';
  bar.appendChild(play); bar.appendChild(tw); bar.appendChild(time); bar.appendChild(mute); bar.appendChild(gear); bar.appendChild(fsb); bar.appendChild(brand);
  wrap.appendChild(bar);
  /* قايمة الجودة (بتتملي لما المصدر يجهز) */
  var qm = document.createElement('div'); qm.id = 'mgQMenu'; wrap.appendChild(qm);
  /* قفل القايمة بأي دوسة بره القايمة والزرار */
  document.addEventListener('click', function(e){
    var m = qMenuEl(); if(!m || !m.classList.contains('open')) return;
    var t = e.target;
    if(t && (t.id === 'mgGear' || t.id === 'mgQLabel' || (t.closest && t.closest('#mgQMenu')))) return;
    closeQMenu();
  });
  setPlayIcon(false); setMuteIcon(false);
  /* ملحوظة: مفيش غطاء كابشن هنا — مشغل الملفات مفيهوش ترجمات أصلًا
     (killTracks بتدمر أي tracks) فمفيش حاجة محتاجة تتغطى، والفيديو
     يبان كامل 100% من غير أي شريط أسود زيادة */
}
function onFileMeta(){
  try{
    var v = fileApi; if(!v) return;
    if(!fileQualityLabel){ fileQualityLabel = hLabel(v.videoHeight); }
    renderQMenu(); updateQLabel(); fileUpdateProgress();
  }catch(e){}
}
function mountFile(){
  var v = document.createElement('video');
  v.id = 'fileVid'; v.playsInline = true;
  v.setAttribute('playsinline',''); v.setAttribute('webkit-playsinline','');
  v.removeAttribute('controls');
  v.setAttribute('disablePictureInPicture','');
  v.setAttribute('disableRemotePlayback','');
  v.preload = 'metadata';
  /* الكابشن ممنوع خالص (قرار المستر 2026-ن): إتلاف أي ترجمات مدمجة
     + ممنوع إضافة ترجمات جديدة + مفيش زرار CC أصلًا ومفيش أي طريق ليها */
  function killTracks(){
    try{ var tt = v.textTracks; for(var i=0;i<tt.length;i++){ tt[i].mode = 'disabled'; } }catch(e){}
    try{ var trs = v.getElementsByTagName('track'); while(trs.length){ trs[0].parentNode.removeChild(trs[0]); } }catch(e){}
  }
  v.addEventListener('loadedmetadata', killTracks);
  try{ if(v.textTracks && v.textTracks.addEventListener) v.textTracks.addEventListener('addtrack', killTracks); }catch(e){}
  if(CFG.resume > 5) v.addEventListener('loadedmetadata', function(){ try{ if(v.duration && CFG.resume < v.duration - 5) v.currentTime = CFG.resume; }catch(e){} });
  v.addEventListener('loadedmetadata', onFileMeta);
  v.addEventListener('timeupdate', function(){
    lastCur = v.currentTime;
    if(Math.floor(v.currentTime) % 5 === 0 && v.currentTime > 0) reportProgress(v.currentTime, v.duration || 0);
  });
  v.addEventListener('timeupdate', fileUpdateProgress);
  v.addEventListener('progress', fileUpdateProgress);
  v.addEventListener('durationchange', fileUpdateProgress);
  /* دورة الووترمارك الكبيرة (10 ظاهرة / 20 مخفية) بتتبع التشغيل */
  v.addEventListener('play', function(){ wmRun(true); setPlayIcon(true); barScheduleHide(); });
  v.addEventListener('pause', function(){ wmRun(false); setPlayIcon(false); barStopHide(); });
  v.addEventListener('ended', function(){
    wmRun(false); setPlayIcon(false);
    barStopHide();
    /* رجوع للبداية ووقوف — شكل نضيف من غير شاشة اقتراحات */
    try{ v.currentTime = 0; v.pause(); }catch(e){}
    reportEnded();
  });
  wrap.appendChild(v);
  fileApi = v;
  /* طبقة النقر — دوسة على الفيديو = تشغيل/إيقاف (سلوك المشغل العادي) */
  var tap = document.createElement('div'); tap.id = 'tapLayer';
  tap.addEventListener('click', function(){ if(!tapOk()) return; try{ if(v.paused){ v.play(); } else { v.pause(); } }catch(e){} });
  wrap.appendChild(tap);
  buildFileBar();
  /* المصدر: بث HLS له قايمة جودات حقيقية — الملف المباشر بجودته الأصلية */
  var src = String(CFG.fileUrl || '');
  if(/\\.m3u8(\\?|$)/i.test(src)) setupHls(src);
  else v.src = src;
}

/* ===== تشغيل ===== */
buildWm();
ensureTopShield();
ensureYtCovers();
ensureBotShield();
layoutWrap();
if(CFG.kind === 'youtube') mountYouTube(); else if(CFG.kind === 'file') mountFile();

/* زرار ملء الشاشة للملفات (ليوتيوب الزرار جوه الكنترولز بتاعته) */
if(CFG.kind === 'file'){
  /* mounted جوه mountFile */
}
/* (يوتيوب: النقر المفرد على tapLayer = تشغيل/إيقاف، وملء الشاشة من زرار
   شريطنا — الدبل كليك اتشال عشان مايتضاربش مع النقر المفرد) */
</script>
</body>
</html>`
