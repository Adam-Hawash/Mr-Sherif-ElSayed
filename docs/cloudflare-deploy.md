# دليل النشر على Cloudflare Workers (منصة Math Genius — مستر شريف)

الدكتور: المنصة دي جاهزة دلوقتي للبناء والنشر على Cloudflare Workers عن طريق **OpenNext** (`@opennextjs/cloudflare`). الدليل ده بيشرح الملفات اللي اتضافت وخطوات النشر خطوة بخطوة بلغة مبسطة.

---

## 1) الملفات اللي اتضافت / اتعدلت ووظيفة كل واحدة

| الملف | نوعه | وظيفته |
|---|---|---|
| `wrangler.jsonc` | جديد | إعدادات كلاود فلير: اسم الـ Worker (`math-genius`)، نقطة الدخول `.open-next/worker.js`، تاريخ الـ compatibility، تفليغ `nodejs_compat`، الأصول الثابتة (assets) من `.open-next/assets`، وتشغيل الـ observability |
| `open-next.config.ts` | جديد | إعداد OpenNext الخاص بكلاود فلير (`defineCloudflareConfig`) — بيوصّل بين نتيجة `next build` وبين شكل الـ Worker |
| `.npmrc` | جديد | سطر `legacy-peer-deps=true` — لأن بناء كلاود فلير بيستخدم npm الصارم، و`@opennextjs/cloudflare` بيتخاصم مع `next@16.3.1` في الـ peer deps؛ السطر ده بيمنع فشل التثبيت |
| `.gitignore` | تعديل | ضفنا `.open-next/` و`.wrangler/` عشان مخرجات البناء ماتترفعش للجيت |
| `package.json` | تعديل | سكربتات جديدة + اعتمادية تطوير جديدة (تحت) |
| `next.config.ts` | تعديل | ضفنا `@prisma/client` و `@prisma/engines` لـ `serverExternalPackages`، وضفنا مفتاح `'/api/**'` في `outputFileTracingIncludes` يضمّن ملفات Prisma و pdfjs-dist و napi canvas مع أي API route |
| `scripts/patch-canvas-cf.cjs` | جديد | سكربت صغير بيشغّل قبل بناء كلاود فلير (عن طريق `prebuild:cf`) وبيرقّع `node_modules/@napi-rs/canvas/js-binding.js` عشان esbuild اللي بيستخدمه OpenNext ما يقعش على ملفات `.node` الأصلية |

### السكربتات الجديدة في package.json

- `build:cf` — بناء كامل للنشر على كلاود فلير: `prisma generate && opennextjs-cloudflare build`
- `preview:cf` — تجربة الـ Worker محلياً بنفس بيئة كلاود فلير: `opennextjs-cloudflare preview`
- `deploy:cf` — نشر مباشر من الجهاز: `opennextjs-cloudflare deploy`
- `prebuild:cf` — بيتنفذ تلقائياً قبل `build:cf` (في npm وbun) وبيقوم برقعة canvas المذكورة فوق

### اعتمادية جديدة في devDependencies

- `@opennextjs/cloudflare@1.20.18` — الأداة الرسمية اللي بتحول مشروع Next.js لـ Worker

---

## 2) خطوات النشر من لوحة كلاود فلير (أول مرة)

1. ادخل على **Cloudflare Dashboard**.
2. من القائمة الجانبية اختار **Workers & Pages**.
3. اضغط **Create** ثم اختار **Workers**.
4. اختار **Connect to Git** (وتأكد إن حسابك على كلاود فلير متوصل بحساب GitHub/GitLab).
5. اختار **المستودع** بتاع المنصة من القائمة.
6. في إعدادات البناء اكتب:
   - **Build command:** `npm run build:cf`
   - **Deploy command:** `npx opennextjs-cloudflare deploy`
7. اضغط **Save and Deploy** وأول بناء هياخد شوية دقايق.

> ملحوظة: بناء كلاود فلير بيستخدم npm، وملف `.npmrc` الموجود في الجذر بيضمن إن تثبيت الاعتماديات ما يفشلش بسبب الـ peer deps.

---

## 3) متغيرات البيئة المطلوبة

بعد إنشاء الـ Worker:

1. روح على **Workers → (الـ Worker بتاعك) → Settings → Variables and Secrets**.
2. ضيف المتغيرين دول:

| المتغير | القيمة |
|---|---|
| `TURSO_DATABASE_URL` | رابط قاعدة البيانات (URL) من **لوحة Turso الخاصة بالمنصة دي نفسها** |
| `TURSO_AUTH_TOKEN` | التوكن بتاع قاعدة البيانات دي — من نفس لوحة Turso (اضغط Create Token) |

> **مهم:** القاعدة دي هي قاعدة المنصة الحالية نفسها (Turso/libsql) — **مش** قاعدة "زيكولا" ولا أي قاعدة تانية.

3. بعد إضافة المتغيرات اعمل **Redeploy** عشان القيم الجديدة تتحمّل في الـ Worker.

---

## 4) الدومين المخصص

1. من **Workers → (الـ Worker) → Settings → Domains & Routes**.
2. اضغط **Add Custom Domain**.
3. اكتب الدومين بتاعك (مثلاً `mathgenius.example.com`) وكلاود فلير هيعمل DNS والشهادة (SSL) تلقائياً لو الدومين على نفس حساب كلاود فلير.

---

## 5) تنبيه مهم بخصوص قص الرسمات على السيرفر ⚠️

ميزة قص الرسمات (استخراج رسمة سؤال أو اختيار من صفحة PDF) على السيرفر بتستخدم مكتبة **`@napi-rs/canvas` الأصلية** (ملف `.node` binary مكتوب بلغة النظام).

- المكتبة دي **ما بتشتغلش** داخل Workers runtime بتاع كلاود فلير، لأن الـ runtime مش بيدعم تحميل ملفات `.node` الأصلية.
- **البناء بيعدي عادي** (البناء نجح EXIT=0)، بس **الميزة دي ممكن تتأثر وقت التشغيل على كلاود فلير** — يعني المسارات اللي بتعتمد على القص السيرفري (زي `/api/crop-figures` و `/api/ai-extract` و `/api/page-image` وقت معالجة PDF) ممكن ترجّع خطأ على كلاود فلير، ودي حاجة متوقعة ومسجلة هنا عشان ماحدش يتفاجئ.
- على البيئات اللي بتشغّل Node عادي (زي فيرسل أو السيرفر بتاعك) الميزة شغالة زي ما هي.

> سكربت `scripts/patch-canvas-cf.cjs` اللي بيشتغل قبل البناء هو اللي بيخلي البناء يعدي: بيسيب كود تحميل canvas يتفضّل للـ runtime بدل ما يقع في الباندل.

---

## 6) خطوة التحقق بعد النشر ✅

1. افتح **الصفحة الرئيسية** للدومين (أو رابط `workers.dev`) وتأكد إنها بتفتح من غير خطأ 500.
2. جرّب **تسجيل دخول أدمن** وتأكد إنه شغال والمحتوى بيتحمّل (يعني اتصال قاعدة Turso تمام).
3. لو الاتنين اشتغوا — النشر تمام 🎉

---

## 7) أوامر سريعة للمراجعة

```bash
bun install               # تثبيت الاعتماديات
bun run build:cf          # بناء كامل للـ Worker (لو نجح هتلاقي: Worker saved in .open-next/worker.js)
bun run preview:cf        # تشغيل الـ Worker محلياً بنفس بيئة كلاود فلير
bun run deploy:cf         # نشر مباشر (محتاج login: bunx wrangler login)
```

## أهم نقطة: أمر البناء المخصص (إجباري لمنصة Math Genius)

> المنصة دي فيها محرك صور WASM (mupdf + jsquash) مسبق الترجمة — لازم أمر البناء
> يكون `npm run build:cf` بالحرف. الأمر التلقائي اللي كلاود بيكشفه
> (`opennextjs-cloudflare build`) بيبني بتوربوباك وبيفشل مع الـ wasm.

**في مكانها**: Workers & Pages → مشروعك → Settings → Build & Deploy →
**Build command** → غيّرها إلى:
```
npm run build:cf
```
(الـ Deploy command يفضل زي ما هو: `npx opennextjs-cloudflare deploy`)

## ملخص الخطوات الفعلية (زي ما اللوج بيأكد)

1. Cloudflare Dashboard → Workers & Pages → Create → Workers → Connect to Git → اختار المستودع
2. أول بناء هيجري تلقائيًا (bun install) — غيّر Build command لـ `npm run build:cf` من Settings
3. Settings → Variables and Secrets → ضيف TURSO_DATABASE_URL و TURSO_AUTH_TOKEN (من لوحة Turso بتاعة المنصة دي نفسها — مش قاعدة زيكولا)
4. كل push جديد على main = بناء ونشر تلقائي
5. Settings → Domains & Routes → Add Custom Domain للدومين بتاعك

## القص السيرفري (محدّث وN16)

- القص دلوقتي شغال على كلاود فلير بالكامل: رندر PDF عبر mupdf WASM مسبق الترجمة
  وفك/ترميز الصور عبر jsquash WASM — من غير أي مكتبة native.
- ملفات الـ .cf.js اللي بتتعمل تلقائيًا وقت البناء هي اللي بتخلي الـ wasm
  يتحول لموديولات مسبقة الترجمة (كلاود بيمنع الترجمة الديناميكية).
- متغير التشخيص FF_IMAGE_DEBUG=1 في Variables يطبع تفاصيل محرك الصور في اللوج لو حصلت مشكلة.
