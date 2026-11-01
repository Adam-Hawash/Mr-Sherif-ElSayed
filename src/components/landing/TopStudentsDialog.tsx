'use client'

// ============================================================
// TopStudentsDialog — (2026-و29) «أوائل الطلبة» في النافبار — طلب المستر:
//   «عاوزك تحطلي واحدة جنبها اللي هي الأوائل الطلبة... دوس على أوائل
//    الطلبة هيظهر لي الأوائل في أول تلات طلاب» + إزالة قسم الأوائل من
//   الصفحة الرئيسية. دايلوج بسيط بيقرأ /api/leaderboard (أول 3 بس).
// ============================================================

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Trophy } from 'lucide-react'

type LeaderRow = { name: string; grade: string; totalPoints: number }

var MEDALS = ['🥇', '🥈', '🥉']

function pointsLabel(n: number): string {
  var v = Math.round(Number(n) || 0)
  if (v === 1) return 'نقطة واحدة'
  if (v === 2) return 'نقطتان'
  return v + ' نقطة'
}

export function TopStudentsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  var [rows, setRows] = useState<LeaderRow[]>([])
  var [loading, setLoading] = useState(false)

  useEffect(function () {
    if (!open) return
    setLoading(true)
    var alive = true
    ;(async function () {
      try {
        var res = await fetch('/api/leaderboard')
        var data = await res.json()
        if (alive && data && Array.isArray(data.leaderboard)) {
          setRows(data.leaderboard.slice(0, 3))
        }
      } catch (e) { /* حالة فاضية رشيقة */ }
      if (alive) setLoading(false)
    })()
    return function () { alive = false }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center justify-center gap-2">
            <Trophy className="h-5 w-5 text-[#C49A38] dark:text-[#E5BE5A]" />
            أوائل الطلبة — أفضل 3
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(function (i) {
                return (
                  <Card key={i} className="border-border/50">
                    <CardContent className="p-3 flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-3.5 w-2/3" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">لسه مفيش ترتيب — أول ما الطلاب يجمعوا نقاط من الواجبات والامتحانات هيتظاهروا هنا 🏆</p>
          ) : (
            <div className="space-y-2">
              {rows.map(function (r, i) {
                return (
                  <Card key={i} className={'border-border/50 ' + (i === 0 ? 'border-[#C49A38]/60' : '')}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <span className="text-2xl shrink-0">{MEDALS[i] || '🏅'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground truncate">{r.name}</p>
                        <p className="text-[11px] text-muted-foreground">{r.grade}</p>
                      </div>
                      <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-[#C49A38]/10 text-[#8A6D22] dark:text-[#E5BE5A] shrink-0">{pointsLabel(r.totalPoints)}</span>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
