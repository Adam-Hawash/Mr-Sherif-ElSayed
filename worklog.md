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
