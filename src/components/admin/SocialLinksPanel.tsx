'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Facebook, MessageCircle, Instagram, Save, Loader2, Link2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'

export function SocialLinksPanel() {
  const [links, setLinks] = useState({ social_facebook: '', social_whatsapp_channel: '', social_instagram: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadLinks = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/social-links')
      const data = await res.json()
      setLinks({
        social_facebook: data.social_facebook || '',
        social_whatsapp_channel: data.social_whatsapp_channel || '',
        social_instagram: data.social_instagram || '',
      })
    } catch { toast.error('خطأ في تحميل الروابط') }
    setLoading(false)
  }

  useEffect(() => { loadLinks() }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/social-links', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(links),
      })
      if (res.ok) {
        toast.success('تم حفظ الروابط بنجاح | Social links saved')
        // Update store
        const store = await import('@/stores/app-store')
        store.useAppStore.getState().setSocialLinks(links as any)
        // Also update siteConfig
        const cfg = store.useAppStore.getState().siteConfig
        store.useAppStore.getState().setSiteConfig({ ...cfg, ...links })
      } else { toast.error('خطأ في الحفظ') }
    } catch { toast.error('خطأ في الاتصال') }
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2"><Link2 className="h-5 w-5" />الروابط الاجتماعية | Social Links</span>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'جاري الحفظ...' : 'حفظ | Save'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">أدخل روابط حساباتك الرسمية وستظهر تلقائياً في الموقع | Enter your official account links and they will appear on the site</p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><Facebook className="h-3.5 w-3.5" />Facebook</Label>
            <Input
              value={links.social_facebook}
              onChange={(e) => setLinks({ ...links, social_facebook: e.target.value })}
              placeholder="https://facebook.com/..."
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" />WhatsApp Channel</Label>
            <Input
              value={links.social_whatsapp_channel}
              onChange={(e) => setLinks({ ...links, social_whatsapp_channel: e.target.value })}
              placeholder="https://whatsapp.com/channel/..."
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><Instagram className="h-3.5 w-3.5" />Instagram</Label>
            <Input
              value={links.social_instagram}
              onChange={(e) => setLinks({ ...links, social_instagram: e.target.value })}
              placeholder="https://instagram.com/..."
              dir="ltr"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
