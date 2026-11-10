# Work Log - منصة مستر شريف السيد (Mr Sherif Elsayed Platform)

> This is a NEW repository forked from the Maths-Genius codebase (Task IDs 1-10 history lives in Adam-Hawash/Maths-Genius → worklog.md).
> Task ID numbering continues the global sequence.

---
Task ID: 11
Agent: Main Agent (Z.ai Code)
Task: Create a brand-new GitHub repo "منصة مستر شريف السيد" — an exact clone of Maths-Genius functionality, fully rebranded for a new teacher (مستر شريف السيد) with a fresh glossy orange/navy design, Egyptian-3ammiya texts everywhere, new teacher photo (anime default, admin-changeable), and new login/admin credentials.

Work Log:
- Copied the entire Maths-Genius codebase (sans .git/.next) to /home/z/mr-sherif as the new独立 project; fresh git history
- GLOBAL THEME SWAP (glossy "لمعة" style, clean colors):
  * sed-replaced every gold hex across src: #C49A38→#EA580C, #D4A843→#F97316, #E5BE5A→#FB923C, #8B6914→#C2410C, #0F0D0A→#12121F, #1A1714→#1B1B30 + beige→warm orange tints + rgba gold→rgba orange
  * globals.css: dark mode is now deep NAVY (#0E0E1E bg, #16162A cards, #2B2B47 borders) instead of pure black; added glossy utilities: .shine-text (animated gradient sweep), .gloss-btn (gradient + moving sheen highlight), .glass-card, .orange-orb, .spin-slow, .float-soft (all with prefers-reduced-motion fallback)
  * NO mouse/cursor effects anywhere (kept as user requested — design shine only)
- HeroSection.tsx completely REDESIGNED to match the user's reference screenshot:
  * Always-dark navy hero (#12121F) in both themes, ambient orange orbs, faint math symbols, orange floating dots
  * Text column (right in RTL): glass badge "🎓 تعلّم الرياضيات بطريقة عامة وممتعة!", giant animated shine-text title (hero_title_line1), white subtitle, primary glossy CTA button "ادخل لحسابك دلوقتي" (replaces اشترك دلوقتي — opens login), secondary "اعمل حساب جديد", مواعيد السنتر chip, developer credits, stats row with shine-text values
  * Photo column (left): big circular photo with white border + float animation, SOLID ORANGE CRESCENT disc behind it (like the reference), rotating dashed ring, name pill badge "مستر شريف السيد", floating glass math chips (π, √x, 2²=4)
  * Default fallback photo is now /images/instructor.png (NEW: AI-generated ANIME math teacher matching the navy/orange palette — user asked for anime default; DB config instructor_photo overrides it, admin can change anytime via CMS "صورة المعلم" slot)
- FULL REBRAND (zero traces of the old teacher/platform left in src — verified by grep):
  * config API DEFAULTS rewritten in Egyptian 3ammiya: navbar "منصة مستر شريف السيد / الرياضيات بقت أسهل", hero title "مستر شريف السيد", features "ليه تختارنا؟ / شرح بيسهّللك الماث / فهم مش حفظ…", tips "نصايح المستر…", guide "بتستخدم المنصة إزاي؟…", footer "جميع الحقوق محفوظة لمنصة مستر شريف السيد", schedule_brand, instructor_name "مستر شريف السيد"
  * layout.tsx metadata title/description + favicon default → /logo.svg; page.tsx loading screen brand; Navbar fallbacks + logo letters MG→MS; Footer fallbacks; FeaturesGuideSection fallback; TipsSection alt; StudentPortal "انتظر النتيجة من مستر شريف السيد"; discussions fallback name; schedule page brand
  * AI: assistant route system prompt now locks platform name to "منصة مستر شريف السيد"; AIAssistant welcome message rebranded; notify-admin email subject/from/html rebranded + no longer defaults to the old developer's gmail (skips unless ADMIN_EMAIL env is set)
  * package.json name → mr-sherif-elsayed-platform
- AUTH CREDENTIALS (exactly as the user specified):
  * Hidden student-login entry: phone 22222222222 + password "mr sherif2026#" → toast "جاري تحويلك إلى تسجيل دخول المشرفين..." → opens the "تسجيل دخول المشرفين" dialog (AdminLoginDialog title updated)
  * Admin login API (route + settings): DEFAULT_EMAIL 'sherif math@2026', DEFAULT_PASSWORD 'mr sherif2026#', ADMIN_NAME 'Mr Sherif Elsayed' (first login creates the Admin row with these)
- VERIFICATION:
  * prisma schema pushed to fresh local SQLite (db/custom.db) — clean empty database
  * tsc --noEmit --skipLibCheck: 90 error lines = EXACT pre-existing baseline (diff shows only the /home/z path string difference) → ZERO new errors
  * Dev server :3100 + agent-browser E2E: landing renders (hero matches reference: orange crescent + anime photo + shine title + "ادخل لحسابك دلوقتي"), all sections in 3ammiya, footer brand correct, light mode clean white/orange, mobile 390px layout correct (photo-top), ZERO console/page/server errors
  * AUTH E2E PASSED: 22222222222 + mr sherif2026# opened "تسجيل دخول المشرفين" dialog → sherif math@2026 + mr sherif2026# → Admin Dashboard loaded (empty clean stats) → CMS panel verified showing "صورة المعلم | Instructor Photo" upload slot

Stage Summary:
- New standalone repo created for منصة مستر شريف السيد — same battle-tested Maths-Genius engine (videos, homework, exams, AI assistant with tutor-mode + streaming, payments, CMS) with a completely different glossy orange/navy identity
- All user requirements met: new design "لمعة", 3ammiya texts, "ادخل لحسابك دلوقتي" CTA, anime teacher photo (admin-changeable), hidden admin gate 22222222222/mr sherif2026# → تسجيل دخول المشرفين → sherif math@2026
- Deploy note (same as Maths-Genius): set env vars TURSO_DATABASE_URL/TURSO_AUTH_TOKEN (or DATABASE_URL), GEMINI_API_KEYS, optional RESEND_API_KEY+ADMIN_EMAIL, then push schema

---
Task ID: 11-note
Agent: Main Agent (Z.ai Code)
Task: Repo creation follow-up note

Work Log:
- Attempted to create the repo with the exact Arabic name "منصة-مستر-شريف-السيد" — GitHub API accepted the call but transliterated EVERY Arabic character into a dash, producing a junk repo named "-------"
- The PAT lacks the delete_repo scope, so the junk repo could NOT be deleted via API — it was renamed to "Adam-Hawash/zzz-delete-me-unused" instead
- ACTION NEEDED (owner): delete the repo "zzz-delete-me-unused" manually from GitHub → Settings → Danger Zone (the real platform repo is Adam-Hawash/Mr-Sherif-ElSayed)

Stage Summary:
- Final repo: https://github.com/Adam-Hawash/Mr-Sherif-ElSayed (main branch, Arabic description set)

---
Task ID: ز22-ج
Agent: Z.ai Code (subagent)
Task: ز22 على Mr-Sherif-ElSayed — مشغل يوتيوب الأصلي (ز21) + بلوكات الوقف العلوية (ز22) + الفيديو اللي بفلوس اختياري صامت

Work Log:
- git status أظهر ملفات متعدلة (junk) → git stash push -u -m "pre-z22-junk" ثم git pull origin main — Fast-forward من 6c13658 إلى 60eaf1b بدون تعارض
- نسخ المشغل المرجعي من Zicola-Math/src/app/api/player/[ticket]/route.ts (فيه ز21 + ز22 + ص3) إلى نفس المسار هنا + sed تغيير البراند "Zicola In Math" → "Mr Sherif ElSayed" (كل الحالات)
- باتش جراحي src/lib/video-guard.ts (ملف المنصة نفسه، مش نسخ من Zicola): (1) إضافة price: true لـ select بتاع db.video.findMany جوه checkSequentialUnlock؛ (2) جوه حلقة for (let i = idx - 1; i >= 0; i--) — بعد if (!isYT && !isFile) continue وقبل const prog = await db.videoProgress.findUnique( — إدراج بلوك ز22: لو v.price > 0 ومفيش VideoAccess ولا دفعة approved → continue (التسلسل ما يقفش بالفيديو اللي بفلوس اللي الطالب مالوش وصول له)
- باتش جراحي src/components/student/StudentPortal.tsx جوه VideosTab: في lockedMap useMemo وفي prevVideoMap useMemo — استبدال if (trackable) prevTrackable = v.id بـ var paidNoAccess = (Number(v.price) || 0) > 0 && !approvedVideoIds.has(v.id) ثم if (trackable && !paidNoAccess) prevTrackable = v.id + إضافة approvedVideoIds لdependencies الاتنين ([lessons, mergedProgress, approvedVideoIds] و [lessons, approvedVideoIds]) — approvedVideoIds موجود في السكوب (prop دا خلص destructured في line 527)
- tsc --noEmit --skipLibCheck: 102 سطر كله pre-existing (101 TS2307 وحدات ناقصة في البيئة + 1 TS2339 في ui/input-otp.tsx) — صفر أخطاء جديدة في الأسطر الملموسة
- Commit وpush على main بauthor ثابت Adam-Hawash ثم تحقق حقيقي على Vercel (status API + نطاق الإنتاج + raw file)

Stage Summary:
- الملفات المتغيرة: src/app/api/player/[ticket]/route.ts (نسخ Zicola + براند Mr Sherif ElSayed)، src/lib/video-guard.ts (price: true + بلوك ز22 في checkSequentialUnlock)، src/components/student/StudentPortal.tsx (paidNoAccess في lockedMap + prevVideoMap + dependencies)، worklog.md
- شاف التحقق: grep counts على route.ts — Zicola In Math = 0، Mr Sherif ElSayed = 13، ytShareHi = 4 (>=2)، controls=1 = 4 (>=2)؛ raw GitHub بعد الpush ytShareHi >= 2؛ Vercel build success + الراوت حي بيرد صفحة خطأ عربية
- ز22 مكتمل: المشغل يوتيوب أصلي بنفسه (ز21) + بلوكات علوية شفافة بتمنع دوسة زرار النسخ وكارت المزيد في حالة الوقف + الفيديو اللي بفلوس اختياري صامت (سيرفر + كلاينت) من غير أي كتابة «اختياري» في الواجهة

---
Task ID: ز25
Agent: Z.ai Code (Main)
Task: ز25 على منصة مستر شريف — (1) بحث الطلاب في تاب إدارة الطلاب (طلب المستر الحرفي: «ابحث عن الطلاب انت مش ضايفهالي») (2) نظام ملاحظات الدروس (المستر يكتب ملاحظة على أي درس/فيديو والطالب يشوفها أول ما يفتح الدرس بمودال «ملاحظة خد بالك» وزرار تمام أزرق) (3) إصلاح فيديوهات الآيفون (حدث خطأ 153 + الذهاب لليوتيوب) — نفس إصلاح منصة شعبان بالظبط

Work Log:
- **بحث الطلاب**: StudentsManager (تاب إدارة الطلاب) كان مفيهوش أي خانة بحث خالص (فلترة صف/حالة بس) + pageSize=100 → أضفت خانة بحث فورية (الاسم/رقم الطالب/اسم ولي الأمر/رقم ولي الأمر/الصف) + pageSize=1000 — الطلاب بعد المية ما كانوش بيظهروا خالص
- **نظام الملاحظات (Backend)**: prisma/schema.prisma — Video نموذج جديد note (TEXT فاضي = مفيش ملاحظة) + noteUpdatedAt (بصمة آخر تعديل) | ensure-schema.ts SCHEMA_COLUMNS — عمودين جداد بيتضافوا أوتوماتيك على قاعدة الإنتاج أول ريكوست (بصمة السكيما بتتغير) | PATCH /api/videos/[id] بيحدد noteUpdatedAt لوحده مع أي تغيير note (عشان الطلاب اللي شافوها يشوفوها تاني لو اتعدلت) — prisma validate ✓
- **نظام الملاحظات (لوحة الأدمن)**: زرار «📝 ملاحظة» على كل درس متعدد الأجزاء (بتكتب مرة واحدة بتتسجل على كل الأجزاء) + على كل فيديو مستقل + بادج سماوي «📝 عليه ملاحظة» على الكروت اللي عليها ملاحظة + نافذة تحرير بحفظ/مسح/إلغاء
- **نظام الملاحظات (الطالب)**: مودال «📝 ملاحظة من المستر / ملاحظة خد بالك» بيظهر أول ما الطالب يفتح الدرس قبل طلب التذكرة — نص الملاحظة + زرار تمام أزرق (bg-blue-600) تحت بمساس 48px — بعد تمام الملاحظة مش بتظهر تاني (localStorage mg_note_seen__<groupKey|id> + بصمة هاش من نص الملاحظة) ولو المستر عدل النص بتظهر مرة جديدة — للدرس المتعدد المفتاح على الدرس كله (groupKey) مش على كل جزء
- **إصلاح الآيفون 153 (src/app/api/player/[ticket]/route.ts)**: (1) IS_IOS + hideYtSurface/showYtSurface — أي خطأ سطح يوتيوب كله بيختفي فورًا: كارت خطأ يوتيوب الداخلي (حدث خطأ 153 + زرار الذهاب لليوتيوب) عمره ما يبان ولا حد يقدر يدوس عليه (مع كنترولز يوتيوب الأصلية ز21 الزرار كان متاح للدوس مباشرة — تسريب للقناة) (2) حارس الموت المفاجئ ytFatalCheck في التيك الثانية — بيكتشف 153 الصامت (من غير onError): لو التشغيل كان شغال/بيحمّل وفجأة الحالة رجعت unstarted/cued → إخفاء فوري + إعادة بناء على nocookie → الوضع البديل المضمون — بكولداون 15 ثانية ومن غير لوب (3) إخفاء فوري في showPlayError وonError (4) على iOS: من غير غلاف سكالر الجودة ytQWrap (mountYouTube + rebuildThenPlay + activateFallback بمقاس حقيقي 100% من غير transform) — خدعة السكالر من مسببات 153 على iOS وبتصغّر الكنترولز الأصلية
- التحقق: tsc --noEmit --skipLibCheck — صفر أخطاء جديدة في الملفات الملموسة (الأخطاء الظاهرة كلها baseline بيئي: sonner/qrcode/resend + خطأ assistant pre-existing) | backticks BALANCED | grep: IS_IOS=4 hideYtSurface=4 | الميزات ان salvaged بعد rebase على origin/main (ز19/ز20) بدون تعارض | GitHub commit status: success على 759fcb4 | raw GitHub: الكود الجديد موجود في SHAs المبنيّة

Stage Summary:
- تلات ميزات انزلت في ريبو شريف: بحث الطلاب (زي ما المستر طلب حرفيًا) + نظام ملاحظات الدروس كامل (أدمن + طالب) + إصلاح خطأ 153 على الآيفون — والبناء success على Vercel
- ملاحظة: alias الإنتاج mr-sherif-el-sayed.vercel.app بيرجع DEPLOYMENT_NOT_FOUND حاليًا (حصل قبل ز25 — اتحقق منه في ز22 وكان شغال) — البناء نفسه success والدومين محتاج يتراجع من حساب فيرسل

---
Task ID: Z-26
Agent: Z.ai Code (Main)
Task: منصة مستر شريف — تحكم الطالب الكامل في الشريط الزمني (سحب/تقديم/ترجيع/وقت معاينة) + علامة copy-link/unlisted الشكلية (طلب المستر — نفس التعديل في كل المنصات)

Work Log:
- ز22 (): مشغل يوتيوب + مشغل الملفات — الشريط بقى قابل للسحب بالإصبع/الماوس (Pointer Events + setPointerCapture + touch-action:none) بمساحة لمس مكبرة (8px فوق وتحت) — فقاعة معاينة بتعرض الوقت أثناء السحب + مقبض بيكبر أثناء السحب + seekTo(t,false) أثناء السحب و seekTo(t,true) عند الإفلات (throttle 250ms)
- زرارين ±10 ثواني (تقديم/ترجيع) جنب زرار التشغيل — بعد القفزة الكنترولز تفضل ظاهرة 3 ثواني عشان الطالب يشوف الوقت الجديد
- الوقت المعروض أثناء السحب بياخد من إصبع الطالب مش من المشغل (guard في البولنج) — والمقبض/الفقاعة بيختفوا عند الإفلات
- النسبة المحفوظة cumulative (max) — الرجوع للور مش بينزل نسبة المشاهدة المحفوظة للطالب
- علامة copy-link + unlisted الشكلية جوه الباتش العلوي (زي منصة شعبان) — الطبقة كلها pointer-events-none: شكل بس، ممنوعة تصمّل حاجة ولا تنسخ أي لينك
- الحمايات كلها زي ما هي: click-catch overlay + درع علوي + باتشات 🔒 + منع كليك يمين/اختصارات + ووترمارك

Stage Summary:
- الطلاب دلوقتي يقدروا يرجّعوا ويجروا الفيديو من الشريط ويشوفوا الوقت في كل لحظة + علامة الشكل الإعلاني غير الشغالة موجودة في المنصة دي زي باقي المنصات


---
Task ID: Z-27
Agent: Z.ai Code (Main)
Task: زرار حذف الطالب بقى حذف نهائي حقيقي من قاعدة البيانات — مش مجرد «رفض/مقفول» — الطالب يمسح وما يبقاش موجود أصلًا (طلب المستر — نفس التعديل في كل المنصات)

Work Log:
- AdminDashboard: handleRejectDelete كان بيعمل PUT status=rejected (رفض بس) — بقى window.confirm ثم DELETE /api/students/[id] + فحص res.ok + توست «تم حذف الطالب نهائيًا» + reload، وtitle الزرار «حذف نهائي من النظام»
- DELETE API بينظف cascade كل صفوف الطالب (نتايج/تقدم/إشعارات/دفعات/ولي الأمر) قبل مسح صف الطالب نفسه
- rebase --autostash على origin/main (كان متقدم) ثم push — التعديلات نزت من غير تعارض

Stage Summary:
- المسح دلوقتي حقيقي: الطالب يختفي من كل قايمات الأدمن خالص، ولو سجل تاني يبقى طالب جديد عادي — مفيش «مقفول» ولا «مرفوض» راجع

---
Task ID: Z-28
Agent: Z.ai Code (Main)
Task: مجتمع الأدمن زي Maths-Genius — إرسال رسايل من اللوحة للطلاب + تعديل/مسح أي رسالة + خانة الكتابة شغالة حتى لو المجتمع فاضي (طلب المستر)

Work Log:
- CommunityPanel: تعديل (قلم) ومسح (سلة) لأي رسالة + الإرسال دايمًا متاح + من غير بادج Admin — بنفس منطق و62/و63 من Maths-Genius
- API اتأكدت: PUT/DELETE /api/discussions/[id] موجودين وشغالين
- جهة الطلاب بتعرض رسايل المستر — مفيش تغيير مطلوب فيها

Stage Summary:
- المجتمع في اللوحة بقى كامل: إرسال/تعديل/مسح — والطلاب بيشوفوا كل حاجة في تاب المجتمع

---
Task ID: Z-29
Agent: Z.ai Code (main)
Task: (ز29 — طلب المستر) مفتاح القبول التلقائي للطلاب في كل المنصات + منصة شريف: قص الرسمات زي بقية المنصات + ملف إجابات اختياري + تصحيح ذكي

Work Log:
- POST /api/students: قراءة المفتاح auto_approve_students من SiteConfig — «1» (افتراضي مفعّل) الحساب بيتقبل على طول (active) | «0» يبقى pending (قيد المراجعة والأستر يوافقه من إدارة الطلاب)
- /api/config: المفتاح auto_approve_students: '1' في DEFAULTS
- AdminDashboard إدارة الطلاب: مفتاح Switch «قبول تلقائي» — تحفظ فوري PUT /api/config + توست + رجوع لو فشل
- AuthPages: رسالة نجاح التسجيل بتتفرّق — لو اتقبل تلقائي «اتقبلت 🎉 اعمل دخول على طول» | لو pending نفس الرسالة القديمة
- منصة شريف — القبول التلقائي + محرر قص الرسمات (✂️ عدّل القص + إنقاذ سيرفري /api/crop-figures + إصلاح شامل /api/backfill-figures + FigureCropEditor + server-figures + figure-demerger + question-figures أحدث + @napi-rs/canvas) + ملف الإجابات الاختياري في مسار الملفات الكبيرة (ai-extract-pages answersOnly + تخزين المصدر sourceMediaId في ai-extract) + مزامنة smart-grader/ai-image-grader (و39)
- tsc check: مفيش أخطاء جديدة (بس خط الـ baseline المعروف في extractAllImagePaths سطر ~80)

Stage Summary:
- Commit: cf87743 (main — origin/Adam-Hawash)
- المفتاح الحالي: مفعّل (قبول تلقائي) زي ما المستر طلب بالظبط
- قيد المراجعة عند الأستر زي الأول: زرار ✅ في إدارة الطلاب شغال بنفس الطريقة

### Z-29 — إصلاح البناء + تحقق نهائي
- أول push (cf87743) وقّع البناء على Vercel: Turbopack مش بيلف @napi-rs/canvas (non-ecmascript placeable asset) — الإصلاح: serverExternalPackages + outputFileTracingIncludes زي Zicola بالظبط (36717fc)
- البناء على Vercel: ✅ success — والدومين الرسمي لسه 404 (alias — Vercel-side من Z-27)


---
# Worklog — سجل المهام (Z.ai Code)

---
Task ID: Z-30
Agent: Z.ai Code (Main)
Task: نظام الإشعارات الشامل للواجبات والامتحانات في كل المنصات — طلب المستر الحرفي: (1) أول ما واجب/امتحان ينزل → إشعار فوري لولي الأمر (2) لو له وقت محدد وفاضل عليه 24 ساعة → تحذير (3) لو عدّى 24 ساعة من غير حل → تنبيه (4) الإشعارات توصل الطالب وولي الأمر معًا (5) كل الإشعارات بصورة الفافيكون بتاعة كل منصة (6) إصلاح إن الإشعارات مش بتوصل غير في منصة وائل

Work Log:
- **التشخيص الحقيقي على الإنتاج** (مسار جديد /api/notify-sweep?diag=1 — بيفحص الجداول والأشكال والعدادات ببيانات مقنعة): الإشعارات الداخلية كانت بتتكتب فعلًا (زيكولا 1105 صف) لكن الجديد ناقص — والمسار الموحد الناقص: إشعارات النزول/التحذير/التأخير
- **السبب الجذري الحقيقي لشكوى المستر**: ميزة القبول التلقائي (Z-28) بتسجل الطلاب الجدد status='active'، وكل فلاتر الإشعارات كانت `status IN ('approved','paid')` بس → الطلاب الجدد مستبعدون بصمت من كل الإشعارات (ولي الأمر والطالب) — اتصلح في notify.ts (3 مواضع × 6 منصات) + parent-notify.ts (notifyParentsOfNewContent × 4 منصات) + موديول assignment-notify الجديد
- **البناء الجديد** `src/lib/assignment-notify.ts` (Raw SQL دفاعي — شغال على SQLite وTurso بغض النظر عن السكيما):
  1) notifyAssignmentPosted — إشعار فوري لولي الأمر أول ما الأدمن ينزل واجب/امتحان (hook في POST /api/exams + /api/homework عبر after()) مع نص مختلف للامتحان المحدد بوقت (endsAt لو العمود موجود)
  2) sweepAssignmentNotifications — ماسح خامل بيشتغل من إشعارات ولي الأمر + جرس الطالب + /api/notify-sweep: (أ) نزول جديد آخر 24 ساعة (ب) تحذير ≤24 ساعة قبل قفل الامتحان (ج) الوقت خلص وما حلهوش (د) عدّى 24 ساعة من غير حل — كلها للطالب وولي الأمر معًا
  3) منع تكرار NotifySweepLog (مفتاح بعد الكتابة مش قبلها) + ميزانية أمان (3 عناصر/120 إشعار للتشغيلة — منع إغراق أول تشغيل وtimeout) + شفاء أشكال الجداول القديمة (PRAGMA + rebuild) + حالة الطلاب approved/paid/active
- **الفافيكون**: الـ Push أصلاً بيقرا favicon_url من SiteConfig (resolveParentPushIcon) — اتضاف للإشعارات الداخلية: responses فيها site.icon + ParentNotificationsCard وNotificationsBell بيعرضوا صورة المنصة على كل إشعار بدل النقطة/الإيموجي
- **منصة القائد**: كان ناقصها نظام إشعارات ولي الأمر الداخلي كله — اتضاف: /api/parent/notifications + ParentNotificationsCard + التكامل في ParentPortal + إصلاح اسم المنصة في الإشعار التجريبي (كان منسوخ من زيكولا)
- المنصة دي (شريف (Mr Sherif Elsayed) — maths-station.com) منصّة بنفس الحقيبة والتحقق الإنتاجي موثق فوق

**التحقق الإنتاجي الحقيقي (وليس محليًا فقط)**:
- زيكولا (zicola-in-math.com): sweep?force=1 ولّد **50 إشعار تأخير فعلية** للطلاب اللي ما حلووش → NotifySweepLog 170 مفتاح + parent_notifications 1105→1273 + Notification 697→867 | تشغيلتان إضافيتان = صفر تكرار (التفريد شغال)
- شريف (maths-station.com): sweep ولّد **52 إشعار فعلية** → parent_notifications 20→71
- **اختبار E2E كامل على إنتاج زيكولا**: تسجيل طالب (اتقبل active تلقائيًا) + ولي أمر → إنزال امتحان → **ولي الأمر استلم إشعار «📝 امتحان جديد… يا ريت ابنك يحله» فورًا + الطالب استلم إشعاره** + site.icon = فافيكون المنصة → تنظيف كامل (حذف الامتحانات والطالب cascade)
- **نفس الاختبار E2E على إنتاج شريف (maths-station.com)**: ولي الأمر استلم إشعارين فورًا + الطالب استلم → تنظيف كامل
- صبري + القائد: النظام منشور ويرد (قواعد البيانات فاضية — منصات جديدة، أول استخدام هيتعمل الجداول لوحدها)
- وائل: اكتشفنا إن مستودع Maths-Genius الحقيقي (المنشور) فيه نظام ز30 كامل أصلًا (إشعار نزول + كرون تذكير يومي + شفاء اشتراكات) — والمجلد المحلي نسخة قالب قديمة ممنوع دفعها (درس موثق في 809b990) — تحقق إنتاجي: /api/cron/homework-reminders رجّع ok وذكّر 13 مستلم عن امتحانين فعلًا — فمفيش أي تعديل مطلوب على وائل وهو الأصل اللي بنسخ منه

Stage Summary:
- المنصات كلها دلوقتي: نزول واجب/امتحان = إشعار فوري لولي الأمر (وللطالب) + تحذير 24 ساعة قبل قفل الامتحانات المحددة بوقت + تنبيه بعد 24 ساعة من غير حل — كل الإشعارات داخلية وPush بصورة فافيكون كل منصة — والسبب الجذري (استبعاد طلاب active) اتصلح في كل ملفات الإشعارات
- للمستر: لو عايز تشغّل الماسح يدويًا في أي وقت: /api/notify-sweep?force=1 — والتشخيص: /api/notify-sweep?diag=1

---
Task ID: Z-36a
Agent: Z.ai Code (Sub)
Task: سد ثغرة /api/site-config — GET كان بيرجّع كل الصفوف الخام (حتى الأسرار) وPUT/POST مفتوحين لأي زائر

Work Log:
- src/app/api/site-config/route.ts: إعادة كتابة كاملة — GET بقى بيرجّع المفاتيح العامة بس (PUBLIC_KEYS = grades_data, schedule_data, video_sequence_lock, wm_enabled, wm_opacity, wm_interval) ومحدد الشكل {key, value, updatedAt} عشان مفيش سر يطلع؛ ولو all=1 + adminId موثّق (عبر isAdmin من @/lib/video-guard) بيرجّع كل الصفوف للوحة الأدمن. PUT/POST بقوا محتاجين isAdmin(adminId) وإلا 401 «غير مصرح»، مع رفض مفتاح session_secret بـ403 «مفتاح محمي»، وتحقق إن المفتاح string ≤120 حرف. POST كان create مفتوح — بقى نفس PUT (upsert) ورا توثيق الأدمن.
- src/components/admin/GradesSchedulePanel.tsx: جبت adminId بنفس نمط المنصة (useAppStore(function (s) { return s.currentAdmin?.id || '' })) زي BooksManager بالظبط، وربطته بطلبَي PUT (grades_data وschedule_data) بـ ?adminId=' + encodeURIComponent(adminId).
- src/components/admin/VideoProtectionSettings.tsx: أضفت استيراد useAppStore من @/stores/app-store ونفس نمط adminId، وربطته بـ PUT (wm_*). الـ GET فضل عادي لأنه بيقرا wm_enabled/wm_opacity/wm_interval وكلها مفاتيح عامة.
- الفوتر: اتأكدت إن توقيع «Developed by Adam Hawash» موجود في src/components/landing/Footer.tsx (سطر 56: var madeByLabel = cfg.footer_made_by_label || 'Developed by Adam Hawash') — سيبته زي ما هو.
التحقق: tsc نظيف على الملفات المتغيرة
Stage Summary: الكونفج العام بس اللي بيخرج للعامة، وأي كتابة محتاجة أدمن موثّق بنفس نظام adminId بتاع المنصة


---
Task ID: Z-35
Agent: Z.ai Code (Main)
Task: إصلاح الرفع في ماث ستيشن (طلب المستر: «الرفع الطويل مبيحملش») — راوتر /api/upload/chunk ناقص + تحقيت المكتبة + جلسة استخراج 5 دقايق

Work Log:
- **العلة الجذرية**: `/api/upload/chunk` كان ناقص خالص من المستودع والمكتبة الكلينت (chunked-upload.ts — نسخة متوازية 3MB + finalize صريح) بينادي عليه → كل رفع (كتاب/ملف/ورقة حل/فيديو) بيرجع 404 «فشلت العملية»
- راوتر جديد **متوافق مع البروتوكول المتوازي بالظبط**: ملف صغير = حفظ مباشر، جزء = تخزين مؤقت __chunks/<uploadId>/<i> من غير تجميع (الرفع متوازي فالترتيب مش مضمون)، finalize=1 = التأكد من كل الأجزاء → تجميع بالترتيب → صف Media نهائي → تنظيف — كل الكتابات safeWrite + تنظيف المهجور (24h) + maxDuration 300
- ملاحظة: كومِت 757256c (session موازية) كان رجّع راوتر بأسلوب التجميع التسلسلي (تجميع على آخر جزء) — ده كان هيكسر الرفع المتوازي (آخر جزء بيوصّل بدري → 400) — النسخة دي اتعوضت بالفاينلايز-كومباتبل في 3e01689
- تحقيت المكتبة: 3 محاولات لكل جزء (0/900/2200ms) + readUploadError (401 جلسة/413 حجم/429/5xx/ردود HTML → رسالة عربية واضحة)
- جلسة الاستخراج بقت 5 دقايق: ai-extract + ai-extract-pages maxDuration 300 + 7 مؤقتات متصفح 300000ms
- **تحقق محلي**: ملف صغير ✓ + أجزاء متوازية خارج الترتيب (0,2,1) ✓ + فاينلايز 7MB مضبوط ✓ + MD5 متطابق ✓
- **تحقق إنتاجي على maths-station.com**: 400 JSON للطلب الناقص ✓ + ملف صغير done:true ✓ + 12MB أجزاء متوازية 4×3MB ✓ + فاينلايز 12000000 بايت done:true ✓ + تحميل الملف من /api/files و MD5 متطابق 100% ✓ + نشر Vercel success

Stage Summary:
- الرفع في ماث ستيشن رجع شغال من جذرها على الإنتاج (متوثق بالضخ الفعلي وMD5) — والمستر هيشوف سبب أي فشل بالعربي بدل «فشلت العملية»


---
Task ID: Z-36
Agent: Z.ai Code (Main)
Task: زرار القبول التلقائي ظاهر جوه تاب الطلاب + شيل فلتر Rejected المتبقي (ماث ستيشن — نفس تعديل جينيوس)

Work Log:
- زرار «القبول التلقائي: مفعّل/متقفل» بارز في هيدر إدارة الطلاب — نفس مفتاح student_auto_approve بتاع شاشة الإعدادات — ضغطة واحدة تبدّل مع توست تأكيد
- فلتر «Rejected» المتبقي في تاب الطلاب اتشال نهائيًا (الحذف حقيقي حقيقي من Z-27 ومفيش رفض خالص — طلب المستر)
- تحقق إنتاجي على maths-station.com: نشر Vercel success + المسار الحقيقي: قراءة (1) → تبديل (0) مؤكد → رجعة (1) مؤكدة — STATION-TOGGLE-OK

Stage Summary:
- نفس تحكم جينيوس بالظبط: زرار القبول التلقائي قدام المستر في تاب الطلاب — ومفيش أي أثر للرفض في الواجهة

---
Task ID: Z-36b
Agent: Z.ai Code (Main)
Task: «ما فيش ولا تعديل اتعمل» — التشخيص: Vercel شال نشرات Z-28→Z-36a من فوق والمنصة لسه على ز16 — trigger نشر + تحقق إنتاجي كامل بعيني

Work Log:
- شكوى المستر: مفيش أي تعديل ظاهر — التشخيص: GitHub شايف كل الكود بس آخر نشر إنتاجي على Vercel = 46970f7 (ز16) — النشرات الجديدة اترفعت واتخطت
- الحل: empty commit «trigger» (383e2ad) → النشر نزل فعلًا
- إثبات النشر: /api/site-config كان بيرجّع كل الصفوف خام (ز16) — بعد النشر بيرجّع المفاتيح العامة بس (كود Z-36a شغال) و?all=1 من غير أدمن مفلتر كمان
- تحقق الرفع على الإنتاج: single-chunk MD5 ✅ + multi-chunk 3 أجزاء (4,288,895 بايت) + finalize=1 → MD5 byte-identical ✅ (البروتوكول المتوازي + finalize شغالين)
- تحقق الزرار بعيني (متصفح آلي على maths-station.com): دخول أدمن (22222222222 + mr sherif2026# → شاشة المشرفين → sherifmath@2026) → تاب الطلاب → «القبول التلقائي: مفعّل» ظاهر → ضغطة = متقفل (سيرفر 0 اتأكد) → ضغطة = مفعّل (سيرفر 1 اتأكدت) ✅
- استخراج 5 دقايق (Z-35) نازل مع نفس البناء — maxDuration 300 + مؤقتات 300000

Stage Summary:
- كل شغل Z-28→Z-36a بقى حي على الإنتاج: الرفع بالضخ + finalize، الزرار قدام المستر وبيتحكم فيه لحظيًا، والإعدادات مقفولة — المشكلة كانت Vercel مش الكود

---
Task ID: Z-36c
Agent: Z.ai Code (Main)
Task: «عايز الزرار يبقى زي سويتش زي بتاع زيكولا ماث» — زرار القبول التلقائي في تاب الطلاب بقى سويتش حقيقي

Work Log:
- استبدال زرار «القبول التلقائي: مفعّل/متقفل» في هيدر تاب الطلاب بسويتش حقيقي (نفس Switch شاشة الإعدادات): ⚡ أيقونة + «القبول التلقائي» + سويتش + حالة ملونة (مفعّل أخضر/متقفل أصفر)
- الـ handler بياخد القيمة من السويتش مباشرة (onCheckedChange) — نفس المفتاح student_auto_approve ومتزامن مع شاشة الإعدادات
- فحص Service Worker: network-first ومفيش كاش للصفحات/API — مش سبب أي نسخة قديمة؛ لو تاب قديم مفتوح تحديث الصفحة يكفي
- تحقق إنتاجي بعد النشر (متصفح آلي على maths-station.com): السويتش ظاهر role=switch + تسمية «القبول التلقائي» → تبديل OFF (سيرفر 0 اتأكد) → رجعة ON (سيرفر 1 اتأكدت) ✅

Stage Summary:
- القبول التلقائي بقى سويتش أنيق شكله زي زيكولا بالظبط — المستر يفتح ويسد بضغطة ويشوف الحالة ملونة جنبه


---
Task ID: Z-37
Agent: Z.ai Code (Main)
Task: تلات تعديلات بطلب المستر الحرفي — (1) الاستخراج كل حاجة بالإنجليزي (2) جدولة الواجبات لكل مجموعة زي الفيديوهات (3) زرار «لوحة الطالب» في الهيرو

Work Log:
- (1) الإنجليزي: ai-extract (PDF/ملفات) كان متظبط من ز31 — اللي كان ناقص: ai-extract-youtube + ai-extract-frames + ai-extract-and-save → اتوصلوا كلهم بحارس ز31 المركزي (برومبت ENGLISH ONLY GUARANTEE صارم + ensureEnglishQuestions/ensureEnglishText بترجم أي عربي زلّق قبل الرجوع) + تعريب تعليمات برومبت الفريمات اتشالت (بقت إنجليزي)
- (2) جدولة الواجبات للمجموعات — نفس نظام الفيديوهات بالحرف:
  * جدول جديد HomeworkGroupSchedule (homeworkId + groupId + unlockAt) + API /api/homework-group-schedule (GET/POST/DELETE بنمط video-group-schedule)
  * GET /api/homework: واجب له خطط مجموعات → يشوفه بس أعضاء المجموعات وكل مجموعة من موعدها — قبل الميعاد مخفي تمامًا (بدون عداد) — الواجب من غير خطط = سلوكه القديم
  * HomeworkGroupScheduleDialog (نسخة دايلوج الفيديوهات) + زرار 🧑‍🤝‍🧑 في صف الواجب فبدل منتقي المجموعات القديم + بادج «🕒 جدولة مجموعات (n)» في اللوحة
- (3) زرار «لوحة الطالب» في HeroSection: بيظهر بس لو mg_student موجود على الجهاز (طلاب ليهم حسابات) — ضغطة واحدة: setCurrentStudent + فتح البورتال فورًا من غير تسجيل دخول
- الملفات: 8 (3 routes استخراج + homework/route + homework-group-schedule جديد + دايلوج جديد + AdminDashboard + HeroSection) — كومِت 1842c80

Stage Summary (تحقق إنتاجي 2026 — maths-station.com بعد النشر):
- (1) استخراج يوتيوب لايف حقيقي: 2 أسئلة رجعوا — arabicFound: false (صفر حروف عربية في كل الناتج: العنوان/الأسئلة/الاختيارات) ✓
- (2) الدايلوج لايف: فتح على واجب اختباري بالمجموعات الحقيقية (السبت/الوسام/قباء) → تحديد السبت + ميعاد مستقبلي → «تم حفظ جدولة المجموعات (1 مجموعة)» + الخطة راجعة من الـ API + بادج ظهر ✓
  * فلترة الطالب لايف: طالب تانية إعدادي مش في مجموعة → الواجب المجدول HIDDEN ✓
  * التنظيف: مسح الخطط + الواجب الاختباري + الطالب الاختباري (Student deleted + cleaned) — أثر صفر وداتا المستر سليمة ✓
- (3) المسار الحقيقي كامل: جهاز فاضي = مفيش زرار ✓ → تسجيل طالب (auto-approve) → خروج → الزرار ظهر ✓ → ضغطة → البورتال فتح بالحساب من غير شاشة دخول ✓ → تنظيف
- tsc: صفر أخطاء في الملفات المعدلة | eslint: no-var بس (ستايل الكود الموجود) | /api/homework-group-schedule بدون جلسة → 401 ✓

---
Task ID: Z-38
Agent: Z.ai Code (Main)
Task: «Ultimate Student Engagement & Gamification Ecosystem» — مركز الألعاب الكامل لمنصة ماث ستيشن بس (طلب المستر بالمواصفات الحرفية)

Work Log:
- (1) التحدي اليومي والستريك: المستر بيحدد دورة التحدي (7/10 يوم) لكل صف لوحده من تاب «مركز الألعاب» الجديد في اللوحة + باني أسئلة يومي متدرج (يوم 1 سؤال، يوم 2 سؤالين — صعوبة تصاعدية) + قاعدة العقوبة الحرفية: الطالب اللي يفوّت يوم كامل من غير حل → ستريكه يرجع صفر ويبدأ من اليوم الأول (الدرع من الصندوق بيغطي يوم ضايع واحد، حد أقصى 3) + تنبيه نيون نابض على داشبورد الطالب لما الوقت بيقرب يخلص والتحدي مش متحل
- (2) صندوق الأسرار اليومي: صندوق متوهج متحرك (CSS نقي — glow/shake) — فتح واحد كل 24 ساعة بتهدئة حية بعدّاد تنازلي — جوائز عشوائية موزونة: XP (3 مستويات 45%/20%/10%) + درع ستريك 15% + كوزمتيك بروفايل حصري 10% — لما الدروع مليانة أو الكوزمتيك خلص الحالة بتتحول XP بديل
- (3) مراهنات XP: الطالب بيحط جزء من رصيده على نتيجته في امتحان/واجب قبل التسليم — 3 مستويات توقع (50%+ → ×1.5 | 70%+ → ×2 | 90%+ → ×3) — الخصم فوري من دفتر XP، ممنوع الرهان بعد التسليم أو فوق الرصيد، إلغاء بالاسترجاع في أول 10 دقايق، والتسوية أوتوماتيك (lazy) لما النتيجة تنزل — من غير أي لمسة في مسارات التسليم الحساسة
- (4) شارات الإنجاز: 10 شارات بثلاث ندرات (عادية/نادرة/أسطورية) بتتفتح أوتوماتيك — البداية الجريئة، سخون المطبخ، صياد الصناديق، الثابت (ستريك 7)، الصاروخ (واجب كامل خلال 24 ساعة)، المقامر الشجاع، العرّاف (3 كسب مراهنات)، جامع النقاط (1000 XP)، ساحر الرياضة (دقة 90%+ في 5 امتحانات)، الأسطورة (ستريك 30) — كوزمتيك البروفايل بيتجهّز وبيبان كإطار متوهج حوالين اسم الطالب في لوحة الترتيب
- (5) لوحة ترتيب XP: منفصلة تمامًا عن لوحة الشرف الأكاديمية (PointsLedger) — دفتر XpLedger مستقل (تحديات + صناديق + مراهنات + تعديلات المستر) + مكان «أنا» لو خارج أول 50 + تحكم المستر في XP أي طالب من اللوحة
- الملفات: 12 (lib/game.ts نواة النظام + 6 مسارات API جديدة /api/game/* + GameCenter.tsx الطالب + GameZonePanel.tsx الأدمن + دمج تابين + CSS الجيمنج) — كومِت 01f1e95
- البنية: 9 جداول جديدة بتتعمل تلقائيًا (GameConfig/DailyChallengeDay/DailySolve/StreakState/MysteryBoxOpen/XpLedger/XpBet/Badge/StudentBadge) بنفس نمط ensureTable الذاتي — يوم القاهرة (Intl timeZone) للستريك — الأسئلة بتتثبت لكل طالب/يوم عشان العينة العشوائية ما تتبدلش بين العرض والتصحيح

Stage Summary (تحقق إنتاجي 2026-11-06 — maths-station.com بعد النشر):
- النشر: /api/game/state بقى يرد 400 «studentId مطلوب» بعد ما كان 404 — الكود نازل حي
- الأدمن بعينه: تاب «Game Zone» ظاهر في اللوحة → إعدادات تانية إعدادي (7 يوم/+10 XP/صناديق ومراهنات مفعّلة) اتسجلت → باني الأسئلة: يوم 1 سؤال «15% of 200» بـ4 اختيارات وإجابة B اتسجل → API أكد configs + builtDays 1 + 10 شارات مبذورة
- الطالب بعينه (تسجيل حقيقي auto-approve): تاب «الألعاب» في البوابة → شريط البطل (XP ذهبي + ستريك + دروع + Day 1/7) → حل التحدي (1/1 صح) → XP 10 + ستريك 1 + «Done today» + توست «شارة جديدة: البداية الجريئة» + «New streak started» → API أكد ledger daily:+10 وbadges:[first_challenge]
- الصندوق بعينه: فتح → جايزة 🛡️ درع ستريك بمودال متحرك → عداد الدروع 1 → الصندوق اتقفل بتهدئة 23:59:54 عدّاد حي
- الشارات بعينها: مجموعة 1/10 — 9 مقفولة رمادي بأيقونة قفل والبداية الجريئة مفتوحة
- لوحة XP بعينها: 🥇 المركز الأول للطالب بـ10 XP + شعلة ستريك + عداد شارات + سطر «منفصلة عن لوحة الشرف الأكاديمية»
- المراهنات لايف: واجب اختباري اتعمل للأدمن → ظهر في «متاح للمراهنة (1)» → رهان 10 XP @ 50% → توست «لو نجبت +15» → الرصيد نزل 0 (خصم فوري) → الرهان اتلغي → استرجاع الرصيد 10 (API 200 ok) → رهان تاني 10 XP @ 70% مفتوح بانتظار النتيجة
- تسوية الرهان: الواجب اتسلّم 2/2 (بعد إصلاح مفتاح الدرجات بالمسار الطبيعي correct+regrade-all) → التسوية التلقائية اتأكدت بعيني: بعد 10 دقايق الرهان بقى status=won وpayout=+20 (10×2) وfinal 2/2 والدفتر bet_win:+20 ورصيد الطالب 70 مطابق حسابيًا — صف «WON +20 XP» أخضر ظاهر في تاب المراهنات
- تحكم المستر في XP: adjustXp +50 → ok — إحصائيات اللوحة حية (ستريكات 1/XP 70/صناديق 1/رهانات مفتوحة 1)
- التنظيف الكامل بعد التحقق: مسح الواجب الاختباري + الطالب الاختباري (حذف نهائي) + أسئلة اليوم 1 → لوحة XP رجعت فاضية والمشرف رجع صفر بعد ز38-ب (تنظيف الأشباح) — وداتا المستر الحقيقية سليمة (الواجب الحقيقي الوحيد موجود) | كومِت إضافي d11712b
- tsc: صفر أخطاء في ملفات ز38 | eslint: نفس ستايل الكود الموجود (no-var/setState-in-effect زي كل المنصة) | console: صفر أخطاء | /api/game/admin من غير جلسة → 401

Task ID: غ1
Agent: Z.ai Code (Main)
Task: منظومة التحفيز الكاملة (Gamification Ecosystem) — تحدي يومي + ستريك + صندوق كنز + شارات + رهان XP + لوحتي ترتيب منفصلتين + تصفير اللوحة الدراسية (طلب المستر — «في منصة مستر شريف السيد بس»)

Work Log:
- lib/gamify.ts (القلب): جداول ذاتية الإنشاء/الشفاء — GamifyProfile (XP/ستريك/دروع/هالات) + ChallengeSeries + ChallengeQuestion + ChallengeAttempt (بنظام حقب epoch عشان «الرجوع من اليوم الأول») + Badge/StudentBadge + MysteryBoxLog + XpLedger + XpBet + LeaderboardReset
- منطق السلسلة: اليوم المفتوح = أول يوم مش مكتمل (أسئلة اليوم كلها لها محاولة متكافأة في الحقبة الحالية) — فات يوم كامل من غير حل = ستريك صفر + رجوع من اليوم الأول (إلا لو فيه درع 🛡️ من صندوق الكنز) — التوقيت كله بتوقيت القاهرة (نافذة اليوم + تحذير 6 مساءً)
- صندوق الكنز: كولداون 24 ساعة (متحمل Prisma DATETIME Date objects) — جوايز بأوزان: 10/20/30 XP + **60 XP نادرة** (لأن أسئلة المستر مش بتعدّي 60 درجة — بطلب المستر) + درع ستريك + هالات نادرة
- الشارات: 5 شارات مزروعة (الصاروخ/الثابت 🔥7 أيام/ساحر الرياضيات 90%+/جامع الكنوز 500XP/بطل التحدي) — **المقامر الشجاع محذوف نهائيًا** — محرك فتح تلقائي + إشعار لكل شارة
- الرهان: الطالب يراهن XP على عدد إجابات صحيحة قبل امتحان — توقع تام ×2 / فارق سؤال = رجوع الرهان / غلط = يحرق — تسوية تلقائية أول ما النتيجة تنزل (lazy settle)
- لوحات الترتيب: نقاط دراسية (PointsLedger) منفصلة تمامًا عن XP (GamifyProfile) — **التصفير النهائي اتنفذ**: كل النقاط القديمة متعلّمة preReset=1 (بتختفي من اللوحات فورًا) + أي نتيجة جديدة بتتراكم عادي من الصفر + كاش الـ leaderboard بيتلغي لحظيًا عند التصفير
- الإشعارات: طالب (نزول الأسئلة/تذكير «خش حل السؤال اليومي بسرعة» تلقائي بعد 6 مساءً/فتح شارة/نتيجة رهان/صندوق) + ولي أمر (notifyParentsOfGamify — تنبيه ما حلش سؤال اليوم) + زرار تنبيه جماعي من اللوحة
- APIs: /api/gamify/state|answer|box|bet|leaderboards + admin/series (إنشاء/حفظ أسئلة باليوم/نشر+إشعار الطلاب/إيقاف/مسح) + admin/badges CRUD + admin/reset-leaderboard + admin/nag
- UI الطالب: GamifyNavbar لاصق أول حاجة في البورتال (عنوان السلسلة + نقاط الأيام 1..N مقفولة/مفتوحة/مكتملة + ستريك + XP + صندوق + CTA + شريط الجوايز الكبرى + تحذير نبضي للوقت) + غرفة التحدي (سؤال اليوم + إجابة فورية صح=XP/غلط=مفيش XP + صندوق كنز متحرك بعداد تنازلي + حائط الشارات بالندرة + المراهنة + لوحتين ترتيب بميداليات) — مزامنة لحظية بين الغرفة والشريط عبر حدث gamify-state-updated
- UI الأدمن: تاب «الجوائز والتحدي» — بناء السلاسل (استخراج أسئلة من ملف/كتاب بالـ AI الموجود + توزيعها على الأيام + XP لكل سؤال + نشر بضغطة يبعت إشعار للطلاب) + محرر الشارات (إضافة/تعديل/حذف/نص مخصص) + لوحة الترتيب معاينة + زرار تصفير مؤكد + تنبيه جماعي
- تنظيف: بيانات الاختبار اتمسحت كلها — المنصة رجعت نظيفة (0 طلاب/0 نقاط ظاهرة/السلسلة التجريبية منشورة على أولى إعدادي بـ 4 أسئلة)

Stage Summary:
- المنصة بقت فيها غرفة تحدي كاملة: الطالب أول ما يدخل بيلقي شريط التحدي قداماه — يحل يومه، يكسب XP، يفتح صندوق كنز كل 24 ساعة، يجمع شارات، يراهن، ويتنافس على لوحة XP منفصلة — والمستر يبني سلاسل من ملفاته، يعدّل الشارات، يصفّر اللوحات، ويبعت تنبيهات — ولوحة الشرف الدراسية اتصفّرت بالكامل ورجعت تشتغل من الصفر

---
Task ID: غ2
Agent: Z.ai Code (Main)
Task: تأمين + تثبيت منظومة التحفيز — حماية routes الأدمن + إصلاح تزامن الشريط + رفع الكل على GitHub (بالتوكن الجديد)

Work Log:
- **تأمين (ثغرة حقيقية)**: routes الأدمن الأربعة (/api/gamify/admin/badges|series|reset-leaderboard|nag) كانت مفتوحة لأي حد — اتضافت حارس isAdmin (من video-guard) على كل GET/POST/PUT/DELETE — adminId من الـ body أو الكويري — بدون صلاحية → 401 «غير مصرح» (مُختبر: كل النداوات بترجع 401 قبل وبعد adminId فاسد)
- **تزامن الشريط**: useGamifyState كان بيسقّط التحديث لو حدث gamify-state-updated وصل والنداء شغال → الشريط كان يفضل قديم لحد الـ 60 ثانية (ظهر فعليًا: الشريط 40 والكارت 65) — اتصلح بـ trailing refresh (pendingRefresh ref) — مُختبر: فتح الصندوق حدّث الشريط لحظيًا (85 = 65+20)
- **بيانات متبقية**: SiteConfig كان فيه branding لمدرس تاني (Math Genius — مستر وائل خضير من اختبار قديم على نفس الـ DB التجريبي) — اتصحح لـ Math Station — مستر شريف السيد (navbar/hero/instructor/schedule)
- **اختبار e2e حقيقي بالمتصفح**: تسجيل طالب (أولى إعدادي) → لوجين → البورتال الكامل بـ Let's Go → شريط التحدي أول حاجة (عنوان + اليوم 1 من 10 + ستريك/XP + صندوق متوهج + CTA + نقاط الأيام + تحذير نابض + شريط الجوايز) → حل 3 أسئلة (+20/+20/+25 = 65 XP) → اليوم 1 اتقفل زمردي واليوم 2 اتفتح تلقائيًا → فتح صندوق الكنز (+20 XP والكولداون بقى 23:59) → حائط الشارات → المراهنة → لوحة XP (الميدالية الذهبية للطالب) → النقاط الدراسية مصفّرة فعلاً → لوجين الأدمن (البوابة المخفية) → تاب الجوائز والتحدي بيحمّل السلاسل/الشارات/اللوحة بالحارس الجديد → محرر الشارات كامل (5 شارات بدون المقامر الشجاع)
- الرفع: كل ملفات منظومة التحفيز (untracked) + التعديلات — اترفعت على github.com/Adam-Hawash/Mr-Sherif-ElSayed

Stage Summary:
- المنظومة بقيت مؤمّنة بالكامل (مفيش حد من غير صلاحية يقدر يمسّ اللوحات أو الشارات أو السلاسل)، وتزامن الشريط لحظي حقيقي، والمنصة معروضة بbranding مستر شريف الصح — وكل حاجة متسجلة على GitHub
- **ملاحظة دمج مهمة**: الـ remote كان فيه تنفيذ موازٍ (ز38 مركز الألعاب — api/game/* + GameCenter + GameZonePanel) اتبنى من جلسة تانية واتنشر على الإنتاج قبل توكن المستر الجديد — تنفيذ غ1/غ2 هو اللي بيحقق طلبات المستر الثمانية حرفيًا (الشريط أول حاجة + محرر الشارات بدون المقامر الشجاع + كنز 60 نادرة + شريط الجوايز + تصفير الترتيب + ناغ «خش حل السؤال اليومي») فهو اللي متوصّل في الواجهات — **ملفات ز38 مفضولة على القرص بدون wiring** (GameCenter.tsx + GameZonePanel.tsx + api/game/* + lib/game.ts) والرجوع ليها سهل بتعديد الـ imports والتابات لو المستر طلب

---
Task ID: ت6
Agent: Z.ai Code (Main)
Task: خمسة تعديلات بطلب المستر — أيام التحدي بإيده + تغيير اسم المراهنات (حرام) + شروط الشارات + معلومة/حكمة اليوم (إشعار كبير من الشمال) + أزرار تصوير صفحات الواجب والامتحان

Work Log:
- **(ت1) تحديد أيام التحدي بإيدك**: ChallengeSeries اتضاف له عمود dayDates (JSON {"1":"2026-10-25",...}) بـ self-heal ALTER — محرر السلسلة بقى فيه قسم «تحديد أيام التحدي بإيدك 📅» (منتقي تاريخ لكل يوم بالعربي «12 نوفمبر 2026» + مسح الكل) — السيرفر: لو فيه تواريخ → وضع الجدولة (اليوم بيفتح في تاريخه بالظبط مهما كان تتابع الحل + يوم من غير تاريخ يفتح مع أقرب يوم قبله + قبل أول تاريخ اليوم 0 مع nextDayDate للعد التنازلي) ولو مفيش → نفس التتابع القديم بالظبط — الستريك في وضع الجدولة ما بيضربش غير لو يوم مجدول فات ومااتحلّش (أيام الفاصل آمنة) — حارس answerQuestion بيرفض أسئلة أيام المستقبل («السؤال ده يومه كذا — استنى يومه») — التحذير النابض + النداء التلقائي + إشعار سؤال اليوم بيظهروا بس لو النهاردة يوم تحدي مجدول فعلًا — GamifyHub يورّي تاريخ اليوم المفتوح + GamifyNavbar بيقول «التحدي بيرجع يوم كذا»
- **(ت2) المراهنة حرام → «توقع واربح XP»**: كل الكلام اللي الطالب بيشوفه اتنظف من كلمات الرهان (القسم بقى «توقع واربح XP 🎯» + قواعد «توقع تام = ضعف النقاط ×2 • فارق سؤال = رجوع نقاطك • توقع بعيد = نقاط المشاركة بتحرق» + زرار «ثبّت توقعك» + «توقعاتي» + «قيمة المشاركة») — نفس الميكانيزم بالظبط من غير أي كلمة رهان/مراهنة — رسايل السيرفر (حجز/حسم/إشعارات) كلها اتحدثت
- **(ت3) شروط الشارات واضحة**: نصوص الشارات الافتراضية الخمسة اتكتبت بصيغة «شرطك: كذا» — أي شارة موجودة ووصفها فاضي بيتملى أوتوماتيك — حائط الشارات بقى يورّي للطالب «الشرط: أيام ستريك متتالية 7 — عندك 3» + شريط تقدم حي (streak/xp/accuracy/challenge من badgeProgress الجديد) + «✅ خلّصت الشرط» للمفتوحة
- **(ت4) معلومة اليوم / حكمة اليوم**: جدولين جدد DailyInfo + DailyInfoView (self-heal) + API كامل (/api/daily-info CRUD للأدمن + GET للطالب بيجيب آخر معلومة في آخر 7 أيام ما شافهاش + /api/daily-info/seen) — تاب جديد في الجوائز والتحدي «معلومة اليوم» (نوع معلومة/حكمة + يوم بتوقيت القاهرة + عنوان + نص + ملف/صورة مرفق بـ chunkedUpload + تشغيل/إيقاف + عداد المشاهدات + تعديل/مسح) — للطالب: DailyInfoToast إشعار كبير ينزلق من الشمال أول ما يفتح المنصة بعلامة X فوق (تقفلها خالص ومش بترجع) ولو ما قفلهاش بتتقفل لوحدها بعد 30 ثانية (شريط عد تنازلي) — كل معلومة مرة واحدة لكل طالب
- **(ت5) أزرار تصوير الصفحات**: PagePhotoCapture جديد (كاميرا حقيقية getUserMedia جوه الصفحة + رداءة رفع ملف + ضغط قبل الرفع + chunkedUpload + معاينة ✅ + إعادة تصوير) — في الواجب والامتحان (وضع ورقة العمل والعادي): لما الأسئلة موزعة على أكتر من صفحة بتيجي زرار لكل صفحة بنص المستر حرفيًا «تصوير الصفحة الأولى (من السؤال 1 للسؤال 5)»… — الصورة بتتحط كعلامة [📷 صورة مرفقة] في إجابة أول سؤال مقالي في نفس الصفحة (نفس ميكانيزم ورقة الحل — المصحح الذكي وشاشات المراجعة بيفهموها) + بتنساب في __pagePhotos جوه الإجابات المحفوظة (زي نمط __tableAnswers — صفر تعديل داتابيز) — الصفحة بتتمنع تسلم والصورة بتترفع (hwPhotoBusy/examPhotoBusy)
- **اختبار حقيقي**: APIs اتحققت بالكامل (إنشاء سلسلة بتواريخ → نشر → حالة طالب: unlockedDay=2 صح في يوم تاريخه 2026-11-09 + isScheduledToday + nextDayDate=2026-11-10 + رفض سؤال يوم 3 المستقبلي + إجابة يوم 2 = 20 XP + ستريك 1 + badgeProgress) + معلومة اليوم (إنشاء أدمن → ظهور للطالب → X → مش بترجع → معلومة جديدة → أوتوكلوز بعد 30 ثانية بمشاهدة مسجلة في السيرفر) + المتصفح: إشعار معلومة اليوم ظهر من الشمال بالضبط زي الطلب + تاب معلومة اليوم في اللوحة + قسم تحديد الأيام في المحرر بالمنتقيين والتسمية العربية
- تنظيف: كل بيانات الاختبار اتمسحت (سلاسل/طلاب/معلومات)

Stage Summary:
- المستر بقى يحدد أيام التحدي بتواريخه هو، القسم اللي كان اسمه مراهنات بقى «توقع واربح XP» حلال وواضح، الشارات بقى فيها شروط مقروءة بتقدم حي، ومعلومة/حكمة اليوم بتوصل كل طالب إشعار كبير من الشمال أول ما يفتح — تقفله بالـ X أو تلقائي بعد 30 ثانية — والطلاب بيقصفوا صفحات واجباتهم وامتحاناتهم صفحة صفحة بزرار لكل صفحة

---
Task ID: T-7
Agent: Z.ai Code (Main)
Task: تغيير اسم قسم التوقعات بطلب المستر الحرفي — «ما تخليهاش اسمها توقع واربح، خليها اسمها ضاعف — ضاعف النقاط بتاعتك — وجنبيها تكتب معلومة صغيرة بالخط الصغير no risk, no fun.»

Work Log:
- GamifyHub.tsx: عنوان القسم بقى «ضاعف نقاطك» وجنبه بخط صغير (text-[10px] text-zinc-500) النص اللاتيني «no risk, no fun.» بالظبط زي ما طلب — مكان «توقع واربح XP»
- تعليقات الكود اتحدثت (GamifyHub/gamify.ts/bet route) — نفس الميكانيزم من غير أي تغيير: توقع تام = ×2، الفارق بيرجّع نقاطك، والتسوية أوتوماتيك
- التحقق: eslint نظيف + متصفح حي على 3100 — القسم ظاهر بالاسم الجديد والجملة الصغيرة جنبه والاسم القديم اختفى تمامًا من الواجهة

Stage Summary:
- قسم التوقعات بقى اسمه «ضاعف نقاطك» بجملة no risk, no fun. الصغيرة جنبه — زي طلب المستر حرفيًا
Task ID: س1
Agent: Z.ai Code (Main)
Task: س1 على منصة مستر شريف — (1) قبول ملفات جوجل درايف وعرضها في كل المنصة (طلب المستر الحرفي: «تقبل ملفات جوجل درايف وتعرضها») (2) ترقيم صفحات الكتاب مع الغلاف — سؤال المستر: «الملف فيه صفحة غلاف والكتاب كاتب صفحة 10 لكن في الملف 11 — أحسب من الغلاف ولا أسيبه؟» — الإجابة: الاتنين مدعومين باختيار واحد (3) تصحيح الواجب أدق — كل صفحات الحل بتتقري مش أول صورة بس (طلب المستر: «تصحح الواجب صح وتصحيح الصفحات يكون دقيق»)

Work Log:
- **src/lib/drive.ts (جديد)**: مساعد موحّد لينكات درايف — بيستخرج معرف الملف من كل الصيغ (/file/d/ID/view، open?id=، uc?id=، drive.usercontent، docs.google.com/document|presentation|spreadsheets) + كشف المجلدات (مرفوضة برسالة واضحة) + روابط التحميل المباشر (drive.usercontent.google.com/download?...&confirm=t) وروابط العرض المدمج (/preview)
- **/api/books/proxy**: مسار درايف مخصص — تحويل أي صيغة لينك → تحميل مباشر + معالجة صفحة تأكيد الفحص للملفات الكبيرة (قراءة فورم التأكيد وإكمال التحميل أوتوماتيك بمتغيراته uuid/confirm/at) + رسايل عربية واضحة (ملف مش متاح للمشاركة / لينك مجلد)
- **تاب الكتب والملازم (أدمن)**: لينك درايف بمؤشر حي (✓ ملف صحيح / ⚠ مجلد) + بادج «🟢 جوجل درايف» في القايمة + توست نجاح مخصص
- **تاب الكتب والملازم (طالب — BooksTab)**: كتب درايف بتتفتح **مدموجة جوه المنصة** في نافذة عارض كبيرة (iframe درايف /preview) بزرار تحميل مباشر وفتح في درايف — مش خروج من المنصة زي قبل
- **DriveViewerDialog (جديد)**: عارض درايف المدمج المشترك — بيتخدم في الكتب وفي مرفقات الواجبات
- **الواجبات (FileAttachment في StudentPortal)**: نموذج الواجب بلينك درايف بيتعرض بزرار «🟢 عرض الملف من جوجل درايف — هنا في المنصة» يفتح العارض المدمج — والورقة بتتقري من غير ما الطالب يخرج
- **لوحة الأدمن (ContentManager واجبات/امتحانات)**: خانة «أو رابط» بتقبل لينكات درايف للأسئلة ولنموذج الإجابة بمؤشر حي + رفض المجلدات قبل الحفظ
- **/api/ai-extract**: تحميل ملف الأسئلة/الإجابات من لينك درايف بقت شغالة (src/lib/drive-fetch.ts — تحويل + صفحة تأكيد) — الاستخراج من كتاب على درايف بدون تنزيل يدوي
- **ترقيم صفحات الكتاب (سؤال المستر)**: في وضع «كتاب — صفحات محددة» مبدّل جديد بعد فتح الكتاب: 🔢 «بترقيم الملف» (الغلاف = صفحة 1 — زي الأول) أو 📖 «بترقيم الكتاب المطبوع» — المستر يكتب عدد صفحات الغلاف/المقدمات والمنصة بتحول أوتوماتيك (صفحة الكتاب 10 = صفحة الملف 11) بعرض حي للتوليد + تحقق صحيح للحدود (بأرقام الكتاب المسموح حتى عدد صفحات الملف ناقص الغلاف) + الاستخراج بيرندر صفحات **الملف** الحقيقية وبيسميها للـ AI بأرقام **الكتاب** فبادج «صفحة N» في المراجعة يبان برقم الكتاب المطبوع + رسالة الحالة والتوست بيقولوا الاتنين (كتاب 10–15 / ملف 11–16)
- **تصحيح الصفحات أدق (ai-image-grader)**: gradeImageAnswer بقت بتقبل allMediaIds — لو الطالب صور حل السؤال على أكتر من صورة/صفحة **كل** الصور (لحد 5) بتتحمى وبتروح للـ AI في نفس الطلب، والبرومبت بيتحدث بعدد الصفحات ويأمر بقراية كل الصفحات ودمجها والإجابة النهائية غالبًا في آخر صفحة — مش أول صورة بس. متصل في: تسليم الواجبات + تسليم الامتحانات + إعادة التصحيح (regrade-core)
- إصلاح عرضي: استعادة src/app/api/upload/chunk/route.ts كانت محذوفة من شجرة الشغل (الرفع المجزأ كان هيبوظ) + ضبط core.fileMode=false (تغييرات صلاحيات بيئية على ملفات public)

Verification:
- tsc --noEmit --skipLibCheck: 104 خطأ كلها baseline بيئي (وحدات ناقصة sonner/qrcode/resend + input-otp) — صفر أخطاء جديدة
- E2E بالمتصفح (localhost:3100): دخول أدمن → تاب AI Extract → وضع كتاب → فتح PDF من لينك عبر البروكسي ✓ → واجهة الترقيم ظهرت → تحويل حي «صفحة الكتاب 10 = صفحة الملف 11» ✓ (غلاف=1) → تحقق النطاق بأرقام الكتاب ✓ → استخراج بيبدأ بالتصنيف الصح (كتاب 2–5 / ملف 3–6) والفشل الوحيد بسبب مفيش مفتاح Gemini محلي (بيئي — الإنتاج فيه مفاتيح)
- طالب: تسجيل → اعتماد → تاب الكتب → بادج «🟢 جوجل درايف» + زرار «عرض هنا» فتح العارض المدمج (iframe درايف) ✓ + تاب الواجبات: واجب بلينك درايف → زرار «🟢 عرض الملف من جوجل درايف» فتح العارض ✓ — X وتحميل وفتح في درايف شغالين
- اختبارات وحدة لينكات درايف (bun): كل الصيغ استخرجت المعرف صح + المجلد مرفوض + غير درايف بيمر زي ما هو

Stage Summary:
- المنصة دلوقتي بتقبل ملفات جوجل درايف في: الكتب (أدمن+طالب) والواجبات والامتحانات والاستخراج بالـ AI — وبتعرضها **مدموجة جوه المنصة** بعارض درايف الداخلي
- سؤال الغلاف اتحسم بمبدّل واحد: يعد بالغلاف (ترقيم الملف) أو يكتب أرقام الكتاب والمنصة تحول لوحدها — والتصحيح بيبقى على الأسئلة الصح
- تصحيح الحلول المصرّة صفحات بقى بيقرا كل الصور مش أول واحدة بس

Task ID: ز32
Agent: Z.ai Code (main)
Task: منصة ماسستيشن (Math Station) — طلب المستر الحرفي: «أنت مش محدث فيها الحاجات: (1) أنا باجي أضيف كتاب ولما باجي أحدد الصفحات بيقول لي من صفحة كذا لصفحة كذا — لا أنا عاوز أكتب الصفحات بإيدي مثلًا صفحة 9 صفحة 20. (2) بضيف لينك جوجل درايف مبعرفش أحفظه/بيقول لي الكتب مش محفوظة. (3) لما باجي أستخرج بيقول لي ملف أسئلة وملف إجابة — لا أنا عاوز أسئلة بس عادي سواء بالاجابة أو مش بالاجابة هو بيحل — خليها زي منصة نجوى جينيس كده حديثة»

Work Log:
- **(1) الصفحات بكتابة يد حرة:** خانتي «من صفحة/إلى صفحة» في وضع كتاب كانوا number inputs بتصحيح تلقائي مزعج (مسح الخانة كان يرجّع 1 + «إلى» بيقفز لوحده مع «من» + بريست 30 صفحة عند فتح أي كتاب + حد أقصى 30 صفحة بيمنع نطاقات أكبر) — بقوا خانتين نصية بكتابة حرة (bookFromText/bookToText) من غير أي تصحيح ولا قفزات ولا بريست — والتحقق بس لما يدوس استخراج — والحد 30 بقى تحذير كهرماني مش منع (المستر حر يكتب 9→20 أو أي نطاق) — نفس الوضع مع الفتح من لينك ومن الكتب المحفوظة (البريست اتشال)
- **(2) علة «الكتب مش محفوظة» اتكشفت:** `ensureBookTable` القديم بيشغّل ALTERs (sourceUrl/usage) **مرة واحدة لكل instance** وبيبلع أي فشل بصمت `catch(e){}` — أول فشل لحظي كان بيسيب جدول قديم ناقص أعمدة للأبد و`db.book.create` يرجّع 500 بالرسالة الغامضة. بقى: قراءة الأعمدة الحقيقية بـ `PRAGMA table_info(Book)` + إضافة الناقص + **تحقق بعد كل ALTER** (لو لسه ناقص الخطأ بيطلع فورًا برسالة واضحة 503) + أي فشل بيرجّع `_bookTableReady` لـ null عشان الطلب اللي بعده يعيد — شفاء ذاتي عبر الطلبات مش كاش حالة مكسورة
- **(2) لينكات الدرايف:** `src/lib/drive-url.ts` (منقولة من Zicola Z-40e المجرّبة): `extractDriveFileId` + `directDownloadCandidates` (drive.usercontent.google.com/download?…&confirm=t ← uc?export=download&confirm=t ← الأصلي) + `isHtmlContentType` — `/api/books/proxy` بقى بيجرب المرشحين بالترتيب ويرفض أي رد HTML (صفحة جوجل مش الملف) برسالة عربية بتشرح إن المشاركة لازم تكون «أي شخص لديه الرابط» — و`normalizeBookSourceUrl` بقت تخزن اللينك **زي ما هو** (التحويل القديم لـ uc?export=download كان بيبوّظ الملفات الكبيرة)
- **(2) عرض الكتب للطلاب («تعرضها»):** BooksTab بقى فيه عارض داخلي (Dialog + iframe) — لينك درايف → `drive.google.com/file/d/<id>/preview` (بيقرا من جوه المنصة من غير تحميل) | ملف مرفوع → `/api/files/<id>#view=FitH` بعارض المتصفح | زرار «افتح في تاب جديد» + «تحميل» احتياط — ولينك الدرايف في الوضع القديم `uc?id=` بيتتعرف عليه كمان — وزرار «فتح وقراءة» بيظهر بس للينكات اللي ليها عارض داخلي
- **(3) استخراج بملف واحد:** صندوق «ملف الإجابات (اختياري)» المنفصل اتشال خالص من واجهة رفع الملف — بقى صندوق واحد حديث: «ارفع ملف الأسئلة — ملف واحد بس» وشرح واضح: الإجابات مكتوبة جواه → الـ AI هيقراها، مش مكتوبة → **هيحل كل سؤال بنفسه** — و`answerFileRef` اتشالت — وضع الملف الكبير (>3.5MB)/الكتاب (صفحات مصورة) كان مفيهوش ضمانة إجابات خالص: برومبت `/api/ai-extract-pages` اتعدل — لو الإجابة مش مطبوعة **يحل السؤال ويحط correct = index إجابته وممنوع −1** (كان −1 بيمنع الحفظ بـ422!) — وبرومبت الملف الواحد اتقوى بنفس القاعدة — و`/api/ai-extract` بقى بيفتح لينكات الدرايف في fileUrl/answerUrl بنفس سلسلة المرشحين ورفض HTML
- **ملاحظة دمج مهمة:** الجلسة اشتغلت على clone قديم — بعد الـ rebase على origin/main اتضح إن (س1) كان نازل قبلها بالدرايف الكامل (بروكسي بيفك صفحة التأكيد + عارض داخلي للطالب + ترقيم بالغلاف أو بأرقام الكتاب) — فاتُخذت نسخة (س1) للبروكسي والعارض ومكتبة drive، وبقيت إضافات الجلسة الحقيقية فوقها: خانات الكتابة الحرة (bookFromText/bookToText بدل number inputs بالتصحيح التلقائي) + شيل حد الـ 30 صفحة (بقى تحذير) + صندوق «ملف واحد بس» وبرومبت «يحل السؤال وممنوع correct:-1» في الملف الواحد والصفحات + شفاء ذاتي أعمدة جدول Book في /api/admin/books
- **التحقق بعد الدمج:** tsc نظيف على الملفات الملموسة — سيرفر محلي 3002 بقاعدة SQLite معزولة + تسجيل دخول أدمن حقيقي بالمتصفح: (أ) حفظ كتاب بلينك درايف من التاب → توست «تم إضافة الكتاب باللينك الخارجي!» ✓ (ب) وضع كتاب → فتح كتاب PDF حقيقي من رابط عبر البروكسي (200 application/pdf %PDF-1.4) → كتابة الصفحات بالإيد (1 و1) → زرار «استخراج من الصفحات» اتفعل ✓ (ج) واجهة رفع الملف: «ملف واحد بس» وصندوق الإجابات المنفصل مختفي تماماً ✓ (د) لاندينج نضيف من غير أخطاء كونسول ✓ — ولينك درايف وهمي عبر البروكسي رجّع خطأ عربي نضيف من غير تمرير HTML ✓

Stage Summary:
- المستر يكتب الصفحات بإيده (9 و20) من غير أي عونشة تلقائية ولا حد أقصى — الكتاب بلينك درايف بيتحفظ من أول مرة (شفاء ذاتي للأعمدة) والطلاب بيقراه جوه المنصة بالعارض المدمج — والاستخراج بقى ملف واحد بس: بالاجابة أو من غيرها والذكاء الاصطناعي بيحل الناقص وبيمتلئ مفتاح الإجابة تلقائيًا بدل رسالة «السؤال ده محتاج مفتاح»

---
Task ID: و117
Agent: Z.ai Code (main)
Task: Math Station — المستر قال «ما فيش أي تعديل اتعمل خالص» والصورة بقت شاشة الكتاب القديمة (من/إلى) من غير زرار المكتبة — فحص لايف أكد إن (و115) غير ملموسة في شاشة الكتاب: رسالة الكوميت ادّعت «قايمة صفحات 7،9،20 + أحفظ في المكتبة» والفعل الكود ما كانش فيه — اتعملوا فعليًا دلوقتي + نقل إصلاح القفل المتقطع للفيديو المدفوع من و116

Work Log:
- **قايمة الصفحات بإيدي المستر (طلب المستر الحرفي: «عاوز آخذ الواجب صفحة 7 وصفحة 9، عاوز أشيل 8»):** خانتي «من صفحة/إلى صفحة» اتحولت لخانة واحدة «اكتب أرقام الصفحات المطلوبة» بـ parsePageSpec — بتفهم «7، 9، 20» و«صفحة 7 وصفحة 9» و«12-15» والأرقام العربي (٧) — اللي مش مكتوب **عمره ما بيتقرا** (لستة مرتبة من غير تكرار) — معاينة خضراء «هيتستخرج N صفحة: 7، 9، 20» + خطأ أحمر لو رقم خارج الكتاب + تحذير كهرماني فوق 30 صفحة (تحذير بس — ز31: من غير حد أقصى) — والترقيم بالغلاف (س1) شغال زي ما هو: بأرقام الكتاب أو الملف والتحويل أوتوماتيك جوه parsePageSpec
- **زرار «احفظ في المكتبة» (طلب المستر: «لما أحط اللينك أول ما أدوس يكون في زرار صغير زي Math Genius أدوس أحفظ في المكتبة»):** ظاهر في وضعين — (أ) بعد اختيار ملف الكتاب جنب زرار الاختيار (رفع فعلي chunked) (ب) **أول ما اللينك يتلصق تحت خانة الرابط** (حفظ باللينك نفسه من غير رفع — مثالي لكتب درايف الكبيرة) — بيسأل على العنوان لو فاضي ويحفظ على /api/admin/books ويفتح «الكتب المحفوظة» فورًا بالتوست — والكتاب بيفضل ثابت يتحول واجبات وامتحانات منه في أي وقت
- **handleExtractBook على القايمة:** دفعات 5 صفحات بترتيب القايمة، الرسالة بتعرض صفحات الكتاب والملف مع بعض في وضع الترقيم بالغلاف، بادج «صفحة N» للـ AI برقم الكتاب المطبوع — العنوان التلقائي بقى «كتاب — صفحات 7، 9، 20»
- **الفيديو المدفوع — إصلاح «ساعات بتشتغل وساعات ما بتشتغلش» (منقول من و116 منصة وائل بالحرف):** (1) تحديث حي لحالة التسديد (payments معتمدة + video-access) أول ما التاب يفتح وكل رجعة للمنصة — الأدمن يعتمد والطالب يشوف الفيديو من غير reload (2) فشل القراية = «مش متأكدين» → منعرضش جدار الدفع والسيرفر هو اللي يفصل (3) رد 402 من /api/video-ticket بيودي الطالب شاشة الدفع تلقائيًا من غير رسالة غريبة (4) كل فحوصات الجدار الدفعي (فردي/جروب/أجزاء الدرس) على effectiveApproved — وقاعدة «اللي بدأه (أي نسبة) عمره ما يتقفل» + سلسلة المخفيين اتشالت زي ما هي من ص3
- **التحقق:** tsc نظيف (صفر أخطاء جديدة على src خارج baseline الوحدات) — كل مراجع approvedVideoIds للجدار الدفعي على effectiveApproved — المراجع القديمة bookFromText/bookToText/bookFileFrom/bookRangeValid اتشالت بالكامل

Stage Summary:
- المستر يكتب «7، 9، 20» واللي مش مكتوب مش بيقرا — اللينك يتلصق وزرار «احفظ في المكتبة» تحت على طول — والفيديو المدفوع بقى اختياري صامت/إجباري للمشتري بحالة تسديد حية ما بتعلقش

---
Task ID: و120
Agent: Z.ai Code (main)
Task: Math Station — «ضيف الزرار اللي أنا أقدر أمسح الكتاب وأقدر أشوفه زي مستر وائل» — أزرار 👁 معاينة + 🗑 حذف جنب كل كتاب محفوظ في وضع كتاب (منقولة من Math Genius و110 بالحرف)

Work Log:
- **🗑 حذف:** deleteSavedBook — تأكيد بنافذة (حذف نهائي؟ الطالب مش هيشوفه تاني) + DELETE /api/admin/books (بيمسح صف Book وملفه المخزن) + لوست اللوحة + لو الكتاب بيُعاين لحظة المسح المعاينة بتتقفل + سبنر تحميل على الزرار
- **👁 معاينة:** bookPreviewSrc (ملف متخزن → مساره مباشرة / لينك خارجي → بروكسي المنصة) + نافذة معاينة كبيرة (92vh) بعارض داخلي + «فتح في تاب جديد» + ✕ — بتفتح من غير ما يتغير مصدر الاستخراج
- **الصف بقى زي Math Genius:** الضغط على الكتاب = فتحه كمصدر للاستخراج زي ما هو + أزرار 👁 و🗑 على يمينه — اللي مالوش ملف ولا لينك مفيهوش زرار معاينة
- **التحقق:** tsc نظيف (صفر أخطاء جديدة)

Stage Summary:
- قايمة «الكتب المحفوظة» في وضع كتاب بقت كاملة زي منصة وائل: دوس الكتاب يفتح للمستخرج + 👁 يشوفه + 🗑 يمسحه نهائيًا

---
Task ID: ز44
Agent: Z.ai Code (Main)
Task: (ز42+ز43) نقل كامل لمنصة مستر شريف السيد — إبادة حرف الـ N وكل رموز الاستخراج + القص الذكي + تفكيك الاختيارات المدموجة — سبب شكوى المستر «ما فيش أي تعديل + حرف الـ ان موجود + أسئلة بتستخرج غلط»

Work Log:
- الجذر: المنصة كانت أقدم من Zicola-Math/mensat-alqaid — حزمة ز42+ز43 (القص الذكي + إبادة حرف الـ N) عمره ما وصلت لها رغم إن و115/و117/و120 وصلوا
- cleanEscapeGarbage (مقوّاة): \n \a \b الحرفية → سطور حقيقية + الـ n الملتحومة «na. nb. nc.» (بمسافة أو من غيرها) بتتفك — الحارس بقى يشتغل حتى من غير شرطة في النص
- ai-json: sanitizeParsed على كل مسارات parseAIJsonRobust — أي استخراج جديد بينزل نضيف من المصدر
- splitEmbeddedOptions في راوتي الاستخراج (ملف + صفحات) + سقف 8 اختيارات بدل 4
- القص الذكي: figure-locator.ts + محرر القص v42 (لصق تلقائي على الرسمة + مقترحات) + حارس الحبر سيرفري + /api/page-image (المصدر الرابع)
- 🧹 زرار «تنظيف رموز الاستخراج» في تاب الاستخراج — ضغطة واحدة بتنضف كل الواجبات والامتحانات المخزنة (cleanup-extraction)
- ExamResultViewer: شفاء نصوص نتيجة الطالب وقت العرض

Verification:
- tsc: صفر أخطاء جديدة (الـ 3 القديمة baseline موجودة قبل التعديل)
- اختبارات حية: النص الحرفي «rectangles.\na. \nb. \nc.» → سطور حقيقية | «rectangles. na. nb. nc.» → «rectangles. / a. / b. / c.» | \frac و sin/cos/tan محميين | نص سليم ما بيتلمسش
- push: 1c8d4df على origin/main ✓

Stage Summary:
- الاستخراجات الجديدة بينزل نضيفة من المصدر، والبيانات القديمة بتتنضف بضغطة زرار 🧹 واحدة، والقص الذكي بقى شغال زي Math Station بالحرف
