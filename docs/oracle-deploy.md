# دليل النشر على سيرفر أوراكل كلاود — منصة Math Genius (مستر شريف)

الخطوات دي مكتوبة بالحرف زي ما هتشوفها في لوحة أوراكل — مش هتلاقي فرق بين الكلام هنا والشاشة.

**ليه أوراكل أحسن لنا؟**
- سيرفر كامل Node.js حقيقي: القص والرسومات وPDF بتشتغل native على المعالج من غير أي قيود Workers ولا رقعات كلاود فلير.
- الخطة المجانية **Always Free**: حتى 4 معالجات ARM + 24 جيجا رام + 200 جيجا قرص — السيرفر بتاعنا (2 معالج + 12 جيجا) بييجي منه بفلوس صفر.
- فيزا/ماستركارد بتتسجل **للتحقق بس** — ما دام الحساب Always Free ومش بتضغط Upgrade، مش هيتسحب أي مبلغ.
- كلاود فلير بيفضل شغال فوق أوراكل كـ DNS + حماية + كاش (أحسن اتنين مع بعض).

**متطلبات:** فيزا للتحقق + ملف المفتاح اللي هينزل عندك + الدومين المتصل بكلاود فلير (اختياري بس مستحسن).

---

## الخطوة 1 — إنشاء حساب أوراكل (مرة واحدة في العمر)
1. افتح **cloud.oracle.com** واضغط **Start for free**.
2. اكتب البلد والإيميل، وAccount name (أي اسم).
3. **Home Region**: اختار **UAE East (Dubai)** أو **Saudi West (Jeddah)** — الأقرب لمصر. دي بتتحدد مرة واحدة ومينفعش تتغير بعدين.
4. سجّل الفيزا للتحقق، وتأكد إن نوع الحساب **Always Free**.
5. استنى إيميل التفعيل (دقايق) وادخل على الـ Console.

## الخطوة 2 — إنشاء السيرفر (Instance)
1. من قائمة الجنب: **Compute → Instances → Create instance**.
2. **Name**: `math-genius`
3. **Image**: اختار **Ubuntu 24.04** (من Change image → Canonical Ubuntu).
4. **Shape**: اضغط Change shape → **Ampere** → **VM.Standard.A1.Flex** → OCPU = **2** و Memory = **12 GB**.
5. **Add SSH keys**: اختار **Generate a key pair** → نزّل المفتاح الخاص (Private Key) واحتفظ بيه في مكان آمن — ده هو مفتاح دخولك للسيرفر.
6. اضغط **Create** وانتظر الحالة تبقى **RUNNING**.
7. انسخ الـ **Public IP address** اللي ظهر في الصفحة — ده عنوان سيرفرك على النت.

## الخطوة 3 — فتح البورتات من لوحة أوراكل
1. من صفحة الـ Instance → دوس على لينك الـ **Subnet** → **Security Lists** → افتح الـ Default Security List.
2. **Add Ingress Rules** وأضف قاعدتين:
   - Source CIDR: `0.0.0.0/0` — IP Protocol: `TCP` — Destination Port Range: `80`
   - نفس القاعدة تاني بـ Destination Port Range: `443`

## الخطوة 4 — الاتصال بالسيرفر وتسطيب الأساسات (أمر واحد)
من جهازك (اللي فيه ملف المفتاح اللي نزلته):
```bash
chmod 400 ssh-key-*.key
ssh -i ssh-key-*.key ubuntu@[الـPublic-IP]
```
جوّه السيرفر:
```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/Adam-Hawash/Mr-Sherif-ElSayed.git
cd Mr-Sherif-ElSayed
sudo bash scripts/oracle-setup.sh
```
السكربت هيُسطّب تلقائي: **Node 22 + PM2 + Caddy + فتح الفايروول (ufw وiptables بتوع أوراكل)** — دي أشهر نقطة بتعطل الناس، والسكربت مغطيها.

## الخطوة 5 — متغيرات البيئة (.env)
اعمل ملف `.env` جوه مجلد المشروع بنفس القيم اللي موجودة دلوقتي على كلاود فلير/فيرسل:
```env
TURSO_DATABASE_URL=libsql://[اسم-قاعدة-شريف].aws.turso.io
TURSO_AUTH_TOKEN=[توكن-القاعدة]
```
(لو لسه معملتش القاعدة: نزّل تطبيق Turso أو من الموقع → db create → وانسخ الـ URL والتوكن.)

## الخطوة 6 — البناء والتشغيل الدائم
```bash
npm install
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```
- في `pm2 startup` هيطبّعلك سطر — انسخه ونفّذه عشان المنصة ترجع لوحدها لو السيرفر اتعملله restart.
- المنصة شغالة دلوقتي داخليًا على البورت **3001**.

## الخطوة 7 — الدومين + شهادة SSL تلقائية
1. عدّل ملف `/etc/caddy/Caddyfile` (بـ `sudo nano /etc/caddy/Caddyfile`) وحط:
```
math.[دومينك].com {
    reverse_proxy 127.0.0.1:3001
}
```
2. `sudo systemctl reload caddy`
3. في كلاود فلير: **DNS → Records → Add record** → Type: `A` — Name: `math` — IPv4: الـPublic IP بتاع أوراكل — Proxy status: **ON** (السحابة البرتقالية).
4. استنى دقيقة وافتح `https://math.[دومينك].com` — Caddy بيجيب شهادة SSL لوحده.

## الخطوة 8 — تحقق أخير
- الموقع بيفتح https بلا تحذير ✓
- سجل دخول الأدمن وافتح امتحان وجرّب القص والرسومات وPDF ✓ (على أوراكل شغالة native من غير أي حيلة)
- `pm2 status` تورّي **online** ✓ — ولو مشكلة: `pm2 logs --lines 50`

## التحديثات الجاية (أي تعديل جديد)
```bash
cd ~/Mr-Sherif-ElSayed
git pull
npm install && npm run build
pm2 restart math-genius
```

## ملاحظات مهمة
- **Out of capacity?** لو إنشاء الـ Instance اترفض بنقص موارد ARM: جرب تاني بعد ساعة أو قلل OCPU لـ 1 — دي مشكلة مؤقتة معروفة في الخطة المجانية وبتتحل بالمحاولة.
- **الفلوس**: ما تدخلش أي خدمة Paid ومتضغطش Upgrade لحسابك — ساعتها بس هيتسحب مبلغ. Always Free كفاية ومكفيانة.
- **الخمول**: أوراكل ممكن تعيد السيرفرات اللي شبه واقفة (CPU أقل من 20% لفترات طويلة) — المنصة شغالة دايمًا يعني استخدام طبيعي، وأوراكل بتبعت إيميل تحذير قبل أي حاجة.
- **الباك أب**: القاعدة على تورسو (سحابية عندهم) — مش محتاجة باك أب من السيرفر.
- لو دايق من كلاود فلير خالص: شيل الـ Proxy (سحابة رمادية DNS only) وCaddy هيجيب الشهادة مباشر — بس التوصيل بيفضل بالبرتقالي أحسن.
