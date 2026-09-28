'use client'

// FILE: src/components/landing/LeaderboardSection.tsx
// PURPOSE: (2026-و16) قسم «🏆 أفضل 3 طلاب» في صفحة الهبوط — طلب المستر حرفيًا:
//   «الصفحة الرئيسية خالص… من غير تسجيل دخول — أول 3 طلاب من حيث عدد النقاط».
//   • منصة تتويج poduim: 🥇 الأول / 🥈 التاني / 🥉 التالت + بادج نقاط
//   • بيقرأ /api/leaderboard من المتصفح (مفيش تسجيل دخول) — الرد مفيهوش غير
//     الاسم (كلمتين كحد أقصى) + الصف + النقاط — صفر بيانات خاصة
//   • Skeleton أثناء التحميل + حالة فاضية رشيقة + متوافق مع الموبايل والوضع الليلي

import { useEffect, useState } from 'react'
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

export function LeaderboardSection() {
  var [rows, setRows] = useState<LeaderRow[]>([])
  var [loading, setLoading] = useState(true)

  useEffect(function () {
    var alive = true
    async function load() {
      try {
        var res = await fetch('/api/leaderboard')
        var data = await res.json()
        if (alive && data && Array.isArray(data.leaderboard)) {
          setRows(data.leaderboard.slice(0, 3))
        }
      } catch (e) { /* حالة فاضية رشيقة */ }
      if (alive) setLoading(false)
    }
    load()
    return function () { alive = false }
  }, [])

  return (
    <section className="py-16 sm:py-20 bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center mb-10 sm:mb-12">
          <h2 className="text-2xl font-bold sm:text-3xl flex items-center justify-center gap-2">
            <Trophy className="h-6 w-6 sm:h-7 sm:w-7 text-[#C49A38] dark:text-[#E5BE5A]" />
            أفضل 3 طلاب
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            المنافسة شهرية على النقاط — اجمع نقاطك من الواجبات والامتحانات وادخل المنصة 🏆
          </p>
        </div>

        {/* Skeleton أثناء التحميل */}
        {loading && (
          <div className="flex flex-col sm:flex-row sm:items-end justify-center gap-4">
            {[0, 1, 2].map(function (i) {
              return (
                <Card key={i} className="flex-1 max-w-sm w-full mx-auto sm:mx-0 border-border/50">
                  <CardContent className="p-6 flex items-center gap-4">
                    <Skeleton className="h-14 w-14 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* حالة فاضية رشيقة — من غير أي بيانات وهمية */}
        {!loading && rows.length === 0 && (
          <Card className="max-w-md mx-auto border-dashed border-border/60 bg-card/50">
            <CardContent className="p-8 text-center space-y-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Trophy className="h-7 w-7 text-[#C49A38] dark:text-[#E5BE5A]" />
              </div>
              <p className="font-semibold">الترتيب لسه فاضي</p>
              <p className="text-sm text-muted-foreground">
                أول ما الطلاب يسلّموا واجبات وامتحانات هتظهر النقاط هنا تلقائيًا
              </p>
            </CardContent>
          </Card>
        )}

        {/* المنصة: موبايل = عمودي بالترتيب 1→2→3 | ديسكتوب = 2 + 1 مرتفع + 3 */}
        {!loading && rows.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-end justify-center gap-4 sm:gap-5">
            {rows.map(function (r, idx) {
              var isFirst = idx === 0
              return (
                <Card
                  key={r.name + '-' + idx}
                  className={
                    'relative flex-1 max-w-sm w-full mx-auto sm:mx-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ' +
                    (isFirst
                      ? 'order-1 sm:order-2 border-[#C49A38]/60 dark:border-[#E5BE5A]/50 shadow-md shadow-[#C49A38]/10 dark:shadow-[#E5BE5A]/10 sm:-translate-y-3'
                      : idx === 1
                        ? 'order-2 sm:order-1 border-border/50'
                        : 'order-3 border-border/50')
                  }
                >
                  <CardContent className="p-5 sm:p-6 flex items-center gap-4">
                    <div
                      className={
                        'shrink-0 flex items-center justify-center rounded-full ' +
                        (isFirst
                          ? 'h-16 w-16 text-4xl bg-[#C49A38]/15 dark:bg-[#E5BE5A]/15 ring-2 ring-[#C49A38]/50 dark:ring-[#E5BE5A]/40'
                          : 'h-12 w-12 text-3xl bg-muted')
                      }
                      aria-hidden="true"
                    >
                      {MEDALS[idx] || '🏅'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            'font-bold text-xs px-2 py-0.5 rounded-full shrink-0 ' +
                            (isFirst
                              ? 'bg-[#C49A38] dark:bg-[#C49A38] text-white'
                              : 'bg-muted text-muted-foreground')
                          }
                        >
                          المركز {idx + 1}
                        </span>
                      </div>
                      <p className="mt-1.5 font-semibold text-base leading-snug truncate" dir="auto" title={r.name}>
                        {r.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{r.grade}</p>
                      <div className="mt-2">
                        <span
                          className={
                            'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ' +
                            (isFirst
                              ? 'bg-[#C49A38]/15 dark:bg-[#E5BE5A]/15 text-[#8B6914] dark:text-[#E5BE5A]'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400')
                          }
                        >
                          ⭐ {pointsLabel(r.totalPoints)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
