'use client'

// ============================================================
// VideoProtectionSettings — لوحة المستر للتحكم في حماية الفيديوهات
// ============================================================
// - الووترمارك الذكي: تشغيل/إيقاف + وضوح + سرعة اللف حوالين الأركان
//   (الووترمارك بيلف على الأركان والحواف — عمره ما بيغطي المحتوى،
//   وبيبان على أي خلفية لأنه بيبادّل أبيض/أسود، وبيفضل ظاهر في ملء الشاشة)
// - ملخص منظومة الحماية (تذاكر + تشويش الـ ID + منع الفحص)
// ============================================================
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

function useConfig(key: string, defaultValue: string) {
  var st = useState<string>(defaultValue)
  var value = st[0]
  var setValue = st[1]
  useEffect(function () {
    fetch('/api/site-config').then(function (r) { return r.json() }).then(function (cfgs) {
      var arr = Array.isArray(cfgs) ? cfgs : []
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].key === key && arr[i].value !== '') setValue(arr[i].value)
      }
    }).catch(function () {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return [value, setValue] as const
}

export function VideoProtectionSettings() {
  var wmEnabledC = useConfig('wm_enabled', '1')
  var wmEnabled = wmEnabledC[0]
  var setWmEnabled = wmEnabledC[1]
  var opacityC = useConfig('wm_opacity', '55')
  var wmOpacity = opacityC[0]
  var setWmOpacity = opacityC[1]
  var intervalC = useConfig('wm_interval', '14')
  var wmInterval = intervalC[0]
  var setWmInterval = intervalC[1]
  var ls = useState(false)
  var loading = ls[0]
  var setLoading = ls[1]

  var save = async function (key: string, value: string) {
    setLoading(true)
    try {
      var res = await fetch('/api/site-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key, value: value }) })
      if (!res.ok) throw new Error()
    } catch {
      toast.error('خطأ في حفظ الإعداد')
    }
    setLoading(false)
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          حماية الفيديوهات
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* الووترمارك الذكي */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">الوترمارك الذكي (رقم الطالب)</p>
            <p className="text-xs text-muted-foreground mt-0.5">رقم الطالب بارز + تيل شفاف بيلف على الأركان — مبيغطيش المحتوى وبيبان في أي تسجيل شاشة</p>
          </div>
          <Switch
            checked={wmEnabled === '1'}
            onCheckedChange={function (on) {
              var v = on ? '1' : '0'
              setWmEnabled(v)
              save('wm_enabled', v)
              toast.success(on ? 'الوترمارك شغال ✅' : 'الوترمارك متقفل — الفيديو هيظهر بدون اسم الطالب')
            }}
          />
        </div>

        <div className={wmEnabled === '1' ? 'space-y-5' : 'space-y-5 opacity-50 pointer-events-none'}>
          {/* وضوح الووترمارك */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">وضوح الووترمارك</p>
              <span className="text-xs font-bold text-primary">{wmOpacity}%</span>
            </div>
            <Slider
              value={[parseInt(wmOpacity) || 55]}
              min={15}
              max={95}
              step={5}
              onValueChange={function (vals) { setWmOpacity(String(vals[0])) }}
              onValueCommit={function (vals) { save('wm_opacity', String(vals[0])) }}
            />
            <p className="text-[10px] text-muted-foreground mt-1">قليل = أقل غطاء على الشرح · كتير = أوضح في تسجيلات الشاشة</p>
          </div>

          {/* سرعة اللف */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">تغيير مكان الووترمارك كل</p>
              <span className="text-xs font-bold text-primary">{wmInterval} ثانية</span>
            </div>
            <Slider
              value={[parseInt(wmInterval) || 14]}
              min={4}
              max={60}
              step={1}
              onValueChange={function (vals) { setWmInterval(String(vals[0])) }}
              onValueCommit={function (vals) { save('wm_interval', String(vals[0])) }}
            />
            <p className="text-[10px] text-muted-foreground mt-1">الووترمارك بيلف بين 6 أماكن (أركان + منتصفات الحواف) فمستحيل يغطي جزء ثابت من الشرح</p>
          </div>
        </div>

        {/* ملخص المنظومة */}
        <div className="rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground space-y-1">
          <p className="font-bold text-foreground text-xs">🛡️ منظومة الحماية الشغالة:</p>
          <p>• معرف اليوتيوب مش بيظهر خالص للطالب — التشغيل بتم عن طريق تذكرة سرية واحدة الاستخدام (صفحة المشغل المحمية بس اللي بتشوف الـ ID مشفّر)</p>
          <p>• الصور المصغرة بتتحمل من السيرفر — مفيش لينكات يوتيوب في مصدر الصفحة</p>
          <p>• كليك يمين + F12 + Ctrl+Shift+I/J/C + Ctrl+U مقفولين بتنبيه لطيف، ولو أدوات المطور اتفتحت الفيديو بيوقف مؤقتًا</p>
          <p>• ملء الشاشة بيحصل جوه المشغل المحمي — الووترمارك يفضل ظاهر دايمًا</p>
          <p>• ملفات الفيديو المرفوعة بتتخدم بتوكن موقّع مرتبط بالطالب وصلاحية قصيرة</p>
          <p className="text-amber-600 dark:text-amber-400">• ملاحظة صادقة: تسجيل الشاشة الخارجي مش بيتمنع 100% في أي منصة — الووترمارك برقم الطالب هو الردع الأقوى لأن أي تسجيل يطلع فيه اسمه ورقمه</p>
        </div>
      </CardContent>
    </Card>
  )
}
