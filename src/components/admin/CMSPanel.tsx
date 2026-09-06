'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Settings, Save, Upload, Loader2, Image as ImageIcon, Trash2, Link2, Type, Layout, GraduationCap, Compass, Lightbulb, BookOpen, Smartphone, Globe, CalendarClock } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { SiteConfig } from '@/stores/app-store'
import { chunkedUpload } from '@/lib/chunked-upload'

interface FieldDef {
  key: string
  label: string
  type: 'text' | 'textarea'
}

interface SectionDef {
  id: string
  title: string
  titleEn: string
  icon: React.ElementType
  fields: FieldDef[]
}

var TEXT_SECTIONS: SectionDef[] = [
  {
    id: 'navbar',
    title: 'شريط التنقل',
    titleEn: 'Navbar',
    icon: Layout,
    fields: [
      { key: 'navbar_brand', label: 'اسم الموقع في النافبار', type: 'text' },
      { key: 'navbar_subtitle', label: 'العنوان الفرعي في النافبار', type: 'text' },
    ],
  },
  {
    id: 'hero',
    title: 'القسم الرئيسي',
    titleEn: 'Hero Section',
    icon: GraduationCap,
    fields: [
      { key: 'hero_badge', label: 'شارة البطل | Hero Badge', type: 'text' },
      { key: 'hero_title_line1', label: 'عنوان البطل سطر 1', type: 'text' },
      { key: 'hero_title_line2', label: 'عنوان البطل سطر 2', type: 'text' },
      { key: 'hero_subtitle', label: 'نص البطل | Hero Subtitle', type: 'textarea' },
      { key: 'hero_stat1_value', label: 'إحصائية 1 القيمة', type: 'text' },
      { key: 'hero_stat1_label', label: 'إحصائية 1 التسمية', type: 'text' },
      { key: 'hero_stat2_value', label: 'إحصائية 2 القيمة', type: 'text' },
      { key: 'hero_stat2_label', label: 'إحصائية 2 التسمية', type: 'text' },
      { key: 'hero_stat3_value', label: 'إحصائية 3 القيمة', type: 'text' },
      { key: 'hero_stat3_label', label: 'إحصائية 3 التسمية', type: 'text' },
      { key: 'instructor_name', label: 'اسم المعلم | Instructor Name', type: 'text' },
      { key: 'instructor_title', label: 'لقب المعلم | Instructor Title', type: 'text' },
      { key: 'hero_developer_url', label: 'رابط Hero Developer Portfolio', type: 'text' },
      { key: 'hero_developer_label', label: 'كلمة Hero Developer (النص الظاهر)', type: 'text' },
      { key: 'footer_made_by_label', label: 'كلمة Made by ... (النص الظاهر في الفوتر)', type: 'text' },
    ],
  },
  {
    id: 'features',
    title: 'قسم المميزات',
    titleEn: 'Features Section',
    icon: BookOpen,
    fields: [
      { key: 'features_title', label: 'عنوان القسم', type: 'text' },
      { key: 'features_subtitle', label: 'وصف القسم', type: 'textarea' },
      { key: 'feature1_title', label: 'ميزة 1 العنوان', type: 'text' },
      { key: 'feature1_desc', label: 'ميزة 1 الوصف', type: 'textarea' },
      { key: 'feature2_title', label: 'ميزة 2 العنوان', type: 'text' },
      { key: 'feature2_desc', label: 'ميزة 2 الوصف', type: 'textarea' },
      { key: 'feature3_title', label: 'ميزة 3 العنوان', type: 'text' },
      { key: 'feature3_desc', label: 'ميزة 3 الوصف', type: 'textarea' },
      { key: 'feature4_title', label: 'ميزة 4 العنوان', type: 'text' },
      { key: 'feature4_desc', label: 'ميزة 4 الوصف', type: 'textarea' },
    ],
  },
  {
    id: 'grades',
    title: 'السنوات الدراسية',
    titleEn: 'Grades Section',
    icon: BookOpen,
    fields: [
      { key: 'grades_title', label: 'عنوان القسم', type: 'text' },
      { key: 'grades_subtitle', label: 'وصف القسم', type: 'textarea' },
    ],
  },
  {
    id: 'schedule',
    title: 'مواعيد السنتر',
    titleEn: 'Schedule Page',
    icon: CalendarClock,
    fields: [
      { key: 'schedule_title', label: 'عنوان الصفحة', type: 'text' },
      { key: 'schedule_badge', label: 'شارة الصفحة', type: 'text' },
      { key: 'schedule_subtitle', label: 'وصف الصفحة', type: 'textarea' },
      { key: 'schedule_brand', label: 'اسم البراند تحت العنوان', type: 'text' },
      { key: 'schedule_footer_note', label: 'ملاحظة الفوتر', type: 'textarea' },
      { key: 'schedule_data', label: 'بيانات المواعيد (JSON) - اتركه فارغ لاستخدام المواعيد الافتراضية', type: 'textarea' },
    ],
  },
  {
    id: 'tips',
    title: 'نصائح الأستاذ',
    titleEn: 'Tips Section',
    icon: Lightbulb,
    fields: [
      { key: 'tips_badge', label: 'شارة القسم', type: 'text' },
      { key: 'tips_title', label: 'عنوان القسم', type: 'text' },
      { key: 'tips_subtitle', label: 'وصف القسم', type: 'textarea' },
      { key: 'tips_card1_title', label: 'نصيحة 1 - العنوان عربي', type: 'text' },
      { key: 'tips_card1_title_en', label: 'نصيحة 1 - العنوان إنجليزي', type: 'text' },
      { key: 'tips_card1_desc', label: 'نصيحة 1 - الوصف', type: 'textarea' },
      { key: 'tips_card2_title', label: 'نصيحة 2 - العنوان عربي', type: 'text' },
      { key: 'tips_card2_title_en', label: 'نصيحة 2 - العنوان إنجليزي', type: 'text' },
      { key: 'tips_card2_desc', label: 'نصيحة 2 - الوصف', type: 'textarea' },
      { key: 'tips_card3_title', label: 'نصيحة 3 - العنوان عربي', type: 'text' },
      { key: 'tips_card3_title_en', label: 'نصيحة 3 - العنوان إنجليزي', type: 'text' },
      { key: 'tips_card3_desc', label: 'نصيحة 3 - الوصف', type: 'textarea' },
      { key: 'tips_card4_title', label: 'نصيحة 4 - العنوان عربي', type: 'text' },
      { key: 'tips_card4_title_en', label: 'نصيحة 4 - العنوان إنجليزي', type: 'text' },
      { key: 'tips_card4_desc', label: 'نصيحة 4 - الوصف', type: 'textarea' },
    ],
  },
  {
    id: 'guide',
    title: 'دليل الاستخدام',
    titleEn: 'Guide Section',
    icon: Compass,
    fields: [
      { key: 'guide_badge', label: 'شارة القسم', type: 'text' },
      { key: 'guide_title', label: 'عنوان القسم', type: 'text' },
      { key: 'guide_subtitle', label: 'وصف القسم', type: 'textarea' },
      { key: 'guide_card1_title', label: 'خطوة 1 - العنوان عربي', type: 'text' },
      { key: 'guide_card1_title_en', label: 'خطوة 1 - العنوان إنجليزي', type: 'text' },
      { key: 'guide_card1_desc', label: 'خطوة 1 - الوصف', type: 'textarea' },
      { key: 'guide_card2_title', label: 'خطوة 2 - العنوان عربي', type: 'text' },
      { key: 'guide_card2_title_en', label: 'خطوة 2 - العنوان إنجليزي', type: 'text' },
      { key: 'guide_card2_desc', label: 'خطوة 2 - الوصف', type: 'textarea' },
      { key: 'guide_card3_title', label: 'خطوة 3 - العنوان عربي', type: 'text' },
      { key: 'guide_card3_title_en', label: 'خطوة 3 - العنوان إنجليزي', type: 'text' },
      { key: 'guide_card3_desc', label: 'خطوة 3 - الوصف', type: 'textarea' },
      { key: 'guide_card4_title', label: 'خطوة 4 - العنوان عربي', type: 'text' },
      { key: 'guide_card4_title_en', label: 'خطوة 4 - العنوان إنجليزي', type: 'text' },
      { key: 'guide_card4_desc', label: 'خطوة 4 - الوصف', type: 'textarea' },
      { key: 'guide_card5_title', label: 'خطوة 5 - العنوان عربي', type: 'text' },
      { key: 'guide_card5_title_en', label: 'خطوة 5 - العنوان إنجليزي', type: 'text' },
      { key: 'guide_card5_desc', label: 'خطوة 5 - الوصف', type: 'textarea' },
      { key: 'guide_card6_title', label: 'خطوة 6 - العنوان عربي', type: 'text' },
      { key: 'guide_card6_title_en', label: 'خطوة 6 - العنوان إنجليزي', type: 'text' },
      { key: 'guide_card6_desc', label: 'خطوة 6 - الوصف', type: 'textarea' },
    ],
  },
  {
    id: 'gallery',
    title: 'معرض الصور',
    titleEn: 'Gallery Section',
    icon: ImageIcon,
    fields: [
      { key: 'gallery_title', label: 'عنوان معرض الصور', type: 'text' },
      { key: 'gallery_subtitle', label: 'وصف معرض الصور', type: 'textarea' },
    ],
  },
  {
    id: 'contact',
    title: 'التواصل والفوتر',
    titleEn: 'Contact & Footer',
    icon: Globe,
    fields: [
      { key: 'whatsapp_number', label: 'رقم واتساب (بدون +)', type: 'text' },
      { key: 'social_facebook', label: 'رابط فيسبوك', type: 'text' },
      { key: 'social_whatsapp_channel', label: 'رابط قناة واتساب', type: 'text' },
      { key: 'social_instagram', label: 'رابط انستجرام', type: 'text' },
      { key: 'social_youtube', label: 'رابط يوتيوب', type: 'text' },
      { key: 'footer_brand', label: 'اسم الموقع في الفوتر', type: 'text' },
      { key: 'footer_copyright', label: 'نص حقوق الملكية', type: 'text' },
      { key: 'hero_developer_url', label: 'رابط Hero Developer Portfolio', type: 'text' },
      { key: 'hero_developer_label', label: 'كلمة Hero Developer (النص الظاهر)', type: 'text' },
      { key: 'footer_made_by_label', label: 'كلمة Made by ... (النص الظاهر في الفوتر)', type: 'text' },
    ],
  },
]

interface ImageSlot {
  configKey: string
  label: string
  labelEn: string
  shape: 'circle' | 'wide' | 'square'
}

var IMAGE_SLOTS: ImageSlot[] = [
  { configKey: 'hero_bg_image', label: 'صورة البانر (الخلفية)', labelEn: 'Hero Banner Image', shape: 'wide' },
  { configKey: 'instructor_photo', label: 'صورة المعلم', labelEn: 'Instructor Photo', shape: 'circle' },
  { configKey: 'site_logo', label: 'شعار الموقع', labelEn: 'Site Logo', shape: 'wide' },
  { configKey: 'tip1_image', label: 'صورة نصيحة 1', labelEn: 'Tip 1 Image', shape: 'square' },
  { configKey: 'tip2_image', label: 'صورة نصيحة 2', labelEn: 'Tip 2 Image', shape: 'square' },
  { configKey: 'tips_bg_image', label: 'صورة خلفية قسم النصائح', labelEn: 'Tips Section Background', shape: 'wide' },
  { configKey: 'tips_section_image', label: 'صورة قسم النصائح (الوسط)', labelEn: 'Tips Section Image (Center)', shape: 'wide' },
  { configKey: 'tip3_image', label: 'صورة نصيحة 3', labelEn: 'Tip 3', shape: 'square' },
  { configKey: 'favicon_url', label: 'أيقونة التبويب (Favicon)', labelEn: 'Browser Tab Icon', shape: 'square' },
]

export function CMSPanel() {
  var [config, setConfig] = useState<SiteConfig>({})
  var [loading, setLoading] = useState(true)
  var [saving, setSaving] = useState(false)
  var [uploading, setUploading] = useState<string | null>(null)
  var fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  var [previews, setPreviews] = useState<Record<string, string>>({})
  var [activeSection, setActiveSection] = useState('navbar')

  var loadConfig = async function() {
    setLoading(true)
    try {
      var res = await fetch('/api/config')
      if (!res.ok) {
        var errText = ''
        try { errText = await res.text() } catch(x) {}
        toast.error('خطأ في تحميل الإعدادات: ' + res.status + ' ' + errText.substring(0, 100))
        setLoading(false)
        return
      }
      var data = await res.json()
      // FIXED: defensive unwrap — if config API returns error shape, strip it
      if (data && data.error && data.defaults) {
        console.warn('CMSPanel: config API returned error shape, using defaults')
        data = data.defaults || {}
      }
      setConfig(data)
      var pvs: Record<string, string> = {}
      IMAGE_SLOTS.forEach(function(slot) { pvs[slot.configKey] = data[slot.configKey] || '' })
      setPreviews(pvs)
    } catch(e) { toast.error('خطأ في تحميل الإعدادات') }
    setLoading(false)
  }

  useEffect(function() { loadConfig() }, [])

  var handleSave = async function() {
    setSaving(true)
    try {
      // FIXED: filter out junk keys before saving
      var cleanConfig: Record<string, string> = {}
      var keys = Object.keys(config)
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i]
        if (key === 'error' || key === 'defaults') continue
        cleanConfig[key] = config[key]
      }
      var res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanConfig),
      })
      if (res.ok) {
        toast.success('تم حفظ الإعدادات بنجاح | Settings saved')
        var storeState = await (await import('@/stores/app-store')).useAppStore.getState()
        storeState.setSiteConfig(cleanConfig)
      } else {
        var errText = ''
        try { errText = await res.text() } catch(x) {}
        toast.error('خطأ في الحفظ: ' + res.status + ' ' + errText.substring(0, 150))
      }
    } catch(e) { toast.error('خطأ في الاتصال') }
    setSaving(false)
  }

  var handleUpload = async function(file: File, configKey: string) {
    setUploading(configKey)
    try {
      var data = await chunkedUpload(file, 'photos')
      var newConfig = Object.assign({}, config)
      newConfig[configKey] = data.filePath
      setConfig(newConfig)
      setPreviews(function(prev) { var n = Object.assign({}, prev); n[configKey] = data.filePath; return n })
      toast.success('تم رفع الصورة بنجاح')
    } catch(err: any) { toast.error(err.message || 'خطأ في رفع الصورة') }
    setUploading(null)
  }

  var handleRemove = function(configKey: string) {
    var newConfig = Object.assign({}, config)
    newConfig[configKey] = ''
    setConfig(newConfig)
    setPreviews(function(prev) { var n = Object.assign({}, prev); n[configKey] = ''; return n })
    toast.success('تم إزالة الصورة')
  }

  var handleSetUrl = function(configKey: string, url: string) {
    var newConfig = Object.assign({}, config)
    newConfig[configKey] = url
    setConfig(newConfig)
    setPreviews(function(prev) { var n = Object.assign({}, prev); n[configKey] = url; return n })
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  return (
    <div className="space-y-6">
      {/* Image Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2"><ImageIcon className="h-5 w-5" />إدارة الصور | Image Management</span>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'جاري الحفظ...' : 'حفظ الكل'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {IMAGE_SLOTS.map(function(slot) {
              var preview = previews[slot.configKey] || ''
              var isUploading = uploading === slot.configKey
              return (
                <div key={slot.configKey} className="flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed hover:border-primary/30 transition-colors">
                  <div className={"overflow-hidden border-2 border-primary/20 shrink-0 bg-muted " + (slot.shape === 'circle' ? 'w-24 h-24 rounded-full' : slot.shape === 'wide' ? 'w-full h-24 rounded-lg' : 'w-full h-20 rounded-lg')}>
                    {preview ? (
                      <img src={preview} alt={slot.label} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        {slot.shape === 'circle' ? <span className="text-2xl">👤</span> : <ImageIcon className="h-6 w-6" />}
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium text-center">{slot.label} | {slot.labelEn}</p>
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={function(el) { fileRefs.current[slot.configKey] = el }}
                      type="file" accept="image/*" className="hidden"
                      onChange={function(e) { var f = e.target.files?.[0]; if (f) handleUpload(f, slot.configKey) }}
                    />
                    <Button variant="outline" size="sm" onClick={function() { fileRefs.current[slot.configKey]?.click() }} disabled={isUploading} className="h-8">
                      {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      <span className="text-[10px] mr-1">رفع</span>
                    </Button>
                    {preview && (
                      <Button variant="ghost" size="sm" onClick={function() { handleRemove(slot.configKey) }} className="h-8">
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 w-full">
                    <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="أو أدخل رابط صورة..."
                      value={config[slot.configKey] && !config[slot.configKey].startsWith('/uploads/') ? config[slot.configKey] : ''}
                      onChange={function(e) { handleSetUrl(slot.configKey, e.target.value) }}
                      dir="ltr" className="h-7 text-[10px]"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Section Tabs */}
      <div className="flex flex-wrap gap-2">
        {TEXT_SECTIONS.map(function(section) {
          var IconComp = section.icon
          var isActive = activeSection === section.id
          return (
            <Button
              key={section.id}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={function() { setActiveSection(section.id) }}
              className="text-xs"
            >
              <IconComp className="h-3.5 w-3.5 mr-1.5" />
              {section.title}
            </Button>
          )
        })}
      </div>

      {/* Active Section Fields */}
      {TEXT_SECTIONS.map(function(section) {
        if (section.id !== activeSection) return null
        var IconComp = section.icon
        return (
          <Card key={section.id}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <IconComp className="h-5 w-5" />{section.title} | {section.titleEn}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-5 sm:grid-cols-2">
                {section.fields.map(function(field) {
                  return (
                    <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
                      <Label className="text-xs mb-1 block">{field.label}</Label>
                      {field.type === 'textarea' ? (
                        <Textarea
                          value={config[field.key] || ''}
                          onChange={function(e) { var n = Object.assign({}, config); n[field.key] = e.target.value; setConfig(n) }}
                          rows={3}
                        />
                      ) : (
                        <Input
                          value={config[field.key] || ''}
                          onChange={function(e) { var n = Object.assign({}, config); n[field.key] = e.target.value; setConfig(n) }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Save className="h-4 w-4 ml-1" />}
                  {saving ? 'جاري الحفظ...' : 'حفظ | Save'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
