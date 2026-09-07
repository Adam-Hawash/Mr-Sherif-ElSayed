// @ts-nocheck
import { NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'

var DEFAULTS = {
  // === Navbar ===
  navbar_brand: 'منصة مستر شريف السيد',
  navbar_subtitle: 'الرياضيات بقت أسهل',

  // === Hero Section ===
  hero_badge: '🎓 تعلّم الرياضيات بطريقة عامة وممتعة!',
  hero_title_line1: 'مستر شريف السيد',
  hero_title_line2: 'منصة الرياضيات المتكاملة',
  hero_subtitle: 'مدرس رياضيات، بشرحلك الماث بطريقة هتفهمها من أول مرة ✨ شرح سهل، أفكار ذكية، وواجبات وامتحانات على طول — كل ده خطوة بخطوة لحد ما توصل لأعلى مجموع إن شاء الله.',
  hero_stat1_value: '5',
  hero_stat1_label: 'صفوف دراسية',
  hero_stat2_value: '100+',
  hero_stat2_label: 'درس فيديو',
  hero_stat3_value: '24/7',
  hero_stat3_label: 'متابعة مستمرة',
  hero_developer_url: 'https://prime-developer-portfolio-11.vercel.app',
  hero_developer_label: 'Hero Developer',
  footer_made_by_label: 'Made by Adam Hawash',
  prime_developer_url: 'https://prime-developer-portfolio-11.vercel.app',

  // === Schedule Page ===
  schedule_title: 'مواعيد السنتر',
  schedule_subtitle: 'جدول مواعيد الحصص الأسبوعية لكل الصفوف — اختار اليوم اللي يناسبك واعرف موعد حصتك',
  schedule_badge: 'جدول الحصص الأسبوعي',
  schedule_footer_note: 'كل المواعيد بتوقيت القاهرة. لو عندك أي استفسار عن موعد حصتك كلمنا على واتساب.',
  schedule_brand: 'منصة مستر شريف السيد',
  schedule_data: '',

  // === Instructor ===
  instructor_name: 'مستر شريف السيد',
  instructor_name_en: 'MR. Sherif ElSayed',
  instructor_title: 'مدرس رياضيات | Math Teacher',
  instructor_photo: '',
  profile_photo: '',

  // === Features Section ===
  features_title: 'ليه تختارنا؟',
  features_subtitle: 'تجربة تعليمية مختلفة تجمع بين الشرح السهل والتطبيق العملي — Algebra و Geometry وغيرهم',
  feature1_title: 'شرح بيسهّللك الماث',
  feature1_desc: 'شرح واضح وسهل لكل درس بطريقة هتفهمها من أول مرة، من غير لخبطة ولا تعقيد.',
  feature2_title: 'فهم مش حفظ',
  feature2_desc: 'بنركّز إنك تفهم الفكرة من جواها مش تحفظها بس — كده هتعرف تحل أي مسألة مهما كانت صعبة.',
  feature3_title: 'حل خطوة بخطوة',
  feature3_desc: 'بنحل المسائل الصعبة خطوة بخطوة، ومعاها ملخصات وسايبات ذكية تسهّل المراجعة.',
  feature4_title: 'واجبات وامتحانات باستمرار',
  feature4_desc: 'واجبات أسبوعية وامتحانات دورية عشان تعرف مستواك دايماً وتكون جاهز للاختبارات.',

  // === Grades Section ===
  grades_title: 'الصفوف الدراسية',
  grades_subtitle: 'اختار صفك وهتلاقي كل المحتوى اللي يخصك — دروس وواجبات وامتحانات',

  // === Tips Section ===
  tips_badge: 'نصايح للتفوّق',
  tips_title: 'نصايح المستر',
  tips_subtitle: 'نصايح ذهبية من مستر شريف عشان تتفوّق في الرياضيات',
  tips_card1_title: 'خصص وقت للمراجعة كل يوم',
  tips_card1_title_en: 'Set Daily Review Time',
  tips_card1_desc: 'اتفرّغ 20-30 دقيقة كل يوم لمراجعة اللي أخدته. الاستمرارية هي سر التفوّق في الماث.',
  tips_card2_title: 'افهم مش احفظ',
  tips_card2_title_en: 'Focus on Understanding',
  tips_card2_desc: 'حاول تفهم ليه مش بس إزاي. الفهم بيثبّت المعلومة في دماغك ويساعدك تحل مسائل جديدة.',
  tips_card3_title: 'حل مسائل زيادة كل يوم',
  tips_card3_title_en: 'Solve Extra Problems Daily',
  tips_card3_desc: 'متكتفيش بالواجب بس — حل مسائل زيادة من الكتاب وهتلاقي نفسك بتحسن بسرعة.',
  tips_card4_title: 'متتكسفش تسأل',
  tips_card4_title_en: 'Never Hesitate to Ask',
  tips_card4_desc: 'لو مش فاهم حاجة اسأل على طول. السؤال الذكي هو أول خطوة في الفهم.',

  // === Guide Section ===
  guide_badge: 'دليلك على المنصة',
  guide_title: 'بتستخدم المنصة إزاي؟',
  guide_subtitle: 'ست خطوات بسيطة تبدأ بيهم رحلتك معانا',
  guide_card1_title: 'اعمل حسابك',
  guide_card1_title_en: 'Register',
  guide_card1_desc: 'سجّل بياناتك في دقيقة واختار صفك الدراسي وابدأ على طول.',
  guide_card2_title: 'شوف الدروس',
  guide_card2_title_en: 'Watch Lessons',
  guide_card2_desc: 'تابع الشروحات المرتبة لكل درس بأسلوب سهل يخليك تفهم بسرعة.',
  guide_card3_title: 'حل الواجبات',
  guide_card3_title_en: 'Homework',
  guide_card3_desc: 'حوّل واجباتك الأسبوعية عشان تثبّت اللي فهمته وتعرف مستواك.',
  guide_card4_title: 'ادخل الامتحانات',
  guide_card4_title_en: 'Take Exams',
  guide_card4_desc: 'امتحانات دورية بتقيس مستواك وبتخليك جاهز للاختبارات الكبيرة.',
  guide_card5_title: 'بطاقات مراجعة',
  guide_card5_title_en: 'Flashcards',
  guide_card5_desc: 'استخدم البطاقات التعليمية لمراجعة القوانين والمصطلحات بسرعة.',
  guide_card6_title: 'تحديات ومسابقات',
  guide_card6_title_en: 'Challenges',
  guide_card6_desc: 'نافس زمايلك في تحديات رياضيات ممتعة واكسب مراكز متقدمة.',

  // === Gallery ===
  gallery_title: 'صور طلابي الأعزاء',
  gallery_subtitle: 'لحظات مميزة من رحلتنا مع بعض',

  // === Social Links ===
  social_facebook: '',
  social_whatsapp_channel: '',
  social_instagram: '',
  social_youtube: '',

  // === WhatsApp Button ===
  whatsapp_number: '201017201680',

  // === Footer ===
  footer_brand: 'منصة مستر شريف السيد',
  footer_copyright: 'جميع الحقوق محفوظة لمنصة مستر شريف السيد',

  // === Favicon ===
  favicon_url: '',

  // === Tips Section Background ===
  tips_bg_image: '',

  // === Tips Section Center Image ===
  tips_section_image: '',

  // === API Keys ===
  resend_api_key: '',

  // === Payment Numbers (shown to students) ===
  payment_vodafone_cash: '',
  payment_instapay: '',
  payment_fawry: '',
}

export async function GET() {
  try {
    var configs = await db.siteConfig.findMany()
    var map = Object.assign({}, DEFAULTS)
    for (var i = 0; i < configs.length; i++) {
      var c = configs[i]
      map[c.key] = c.value
    }
    return NextResponse.json(map)
  } catch (error) {
    console.error('Config fetch error:', error)
    // CRITICAL FIX: Return flat DEFAULTS so frontend never crashes
    return NextResponse.json(Object.assign({}, DEFAULTS))
  }
}

export async function PUT(request) {
  try {
    var body = await request.json()
    var keys = Object.keys(body)

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i]
      var value = body[key]
      // Skip non-config keys that might come from error responses
      if (key === 'error' || key === 'defaults') continue
      await safeWrite(function(k, v) {
        return function() {
          return db.siteConfig.upsert({
            where: { key: k },
            update: { value: v, updatedAt: new Date() },
            create: { key: k, value: v },
          })
        }
      }(key, value))
    }

    return NextResponse.json({ message: 'Config updated' })
  } catch (error) {
    console.error('Config update error:', error)
    return NextResponse.json({ error: 'Failed to update config', detail: error.message, code: error.code }, { status: 500 })
  }
}
