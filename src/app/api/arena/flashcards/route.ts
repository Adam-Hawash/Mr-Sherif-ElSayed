// @ts-nocheck
// ============================================================
// FILE: src/app/api/arena/flashcards/route.ts
// PURPOSE: (2026-و66) تحدي الفلاش كاردز السريعة:
//   GET ?mode=round  → 10 بطاقات سريعة — (2026-و68) المدة بيتحددها
//                      الأدمن (SiteConfig: flashcard_seconds — الافتراضي 15 ث)
//   GET ?mode=board  → لوحة شرف الفلاش كاردز (أعلى 30)
//   GET ?mode=settings → (أدمن) المدة الحالية
//   POST {action:'submit', ...} → حفظ نتيجة الجولة
//   POST {action:'setTime', seconds} → (أدمن) تحديد المدة (5-90 ث)
//   الدرجة = دقة + سرعة (بتتحسب على العميل من الوقت المتبقي —
//   نفس صيغة ساحة التحدي: 60 قاعدة + 40 سرعة + 15 ستريك كل 3 صح)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { ensureArenaTables } from '@/lib/arena'
import { generateFlashcards, FLASHCARD_DEFAULT_SEC } from '@/lib/question-gen'

export const runtime = 'nodejs'

/* قراءة المدة المحفوظة من الأدمن (بثواني) — 15 افتراضي */
async function readFlashcardSeconds(): Promise<number> {
  try {
    var rows = await db.$queryRawUnsafe("SELECT value FROM SiteConfig WHERE key = 'flashcard_seconds' LIMIT 1")
    var v = Number((rows && rows[0] && rows[0].value) || 0)
    if (v >= 5 && v <= 90) return Math.round(v)
  } catch (e) {}
  return FLASHCARD_DEFAULT_SEC
}

export async function GET(request: NextRequest) {
  try {
    await ensureArenaTables()
    var url = new URL(request.url)
    var mode = String(url.searchParams.get('mode') || 'round')

    if (mode === 'board') {
      var rows = await db.$queryRawUnsafe('SELECT * FROM FlashcardScore ORDER BY score DESC, createdAt ASC LIMIT 30')
      var board = (rows || []).map(function (r: any, i: number) {
        return {
          rank: i + 1,
          name: String(r.name || 'طالب'),
          score: Number(r.score || 0),
          correctCount: Number(r.correctCount || 0),
          totalCards: Number(r.totalCards || 10),
          createdAt: String(r.createdAt || ''),
        }
      })
      return NextResponse.json({ ok: true, board: board })
    }

    /* (و70-ج) قايمة كروت المستر — للأدمن */
    if (mode === 'deck') {
      var dRows = await db.$queryRawUnsafe('SELECT * FROM FlashcardCard ORDER BY createdAt DESC LIMIT 500')
      var deck = ((dRows || []) as any[]).map(function (r: any) {
        return {
          id: String(r.id),
          fileName: String(r.fileName || ''),
          front: String(r.front || ''),
          back: String(r.back || ''),
          active: Number(r.active || 0) === 1,
        }
      })
      var activeCount = deck.filter(function (c) { return c.active }).length
      return NextResponse.json({ ok: true, cards: deck, activeCount: activeCount })
    }

    /* (2026-و68) إعدادات المدة — للأدمن */
    if (mode === 'settings') {
      var secs = await readFlashcardSeconds()
      return NextResponse.json({ ok: true, seconds: secs })
    }

    // جولة جديدة — (و72) الطالب يقدر يختار العدد والمدة والصعوبة بنفسه
    // (الافتراضي: مدة الأدمن flashcard_seconds و 10 بطاقات — متلمسش)
    var urlCount = Math.max(3, Math.min(Math.round(Number(url.searchParams.get('count')) || 10), 20))
    var urlSeconds = Math.round(Number(url.searchParams.get('seconds')) || 0)
    var urlDifficulty = ['easy', 'medium', 'hard', 'mixed'].indexOf(String(url.searchParams.get('difficulty') || '')) !== -1
      ? String(url.searchParams.get('difficulty'))
      : 'mixed'
    var adminSeconds = await readFlashcardSeconds()
    var seconds = (urlSeconds >= 5 && urlSeconds <= 90) ? urlSeconds : adminSeconds
    var roundCount = urlCount

    /* (و70-ج) الأولوية لكروت المستر المرفوعة — «تحدي على الـ flash cards
       والحاجات اللي احنا بنحطها»: لو فيه كروت نشطة بنتحدي بها بدل المولد.
       الأمام سؤال والظهر إجابة — والاختيارات من ظهور كروت تانية. */
    var deckCards: any[] = []
    try {
      var deckRows = await db.$queryRawUnsafe(
        'SELECT id, front, back FROM FlashcardCard WHERE active = 1 ORDER BY RANDOM() LIMIT ' + Math.max(4, Math.min(roundCount, 30)),
      )
      deckCards = (deckRows || []) as any[]
    } catch (e2) { /* الجدول لسه مش موجود — المولد يتكفل */ }

    var source = 'generated'
    var cards: any[] = []
    if (deckCards.length >= 4) {
      source = 'deck'
      var backs: string[] = deckCards.map(function (c) { return String(c.back || '').trim() })
      var shuffled = deckCards.slice(0)
      for (var i = shuffled.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1))
        var t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t
      }
      cards = shuffled.map(function (c: any) {
        var correct = String(c.back || '').trim()
        var dis: string[] = []
        for (var d = 0; d < backs.length && dis.length < 3; d++) {
          var b = backs[d]
          if (b && b !== correct && dis.indexOf(b) === -1) dis.push(b)
        }
        var options = [correct].concat(dis).slice(0, 4)
        // خلط الاختيارات
        for (var o = options.length - 1; o > 0; o--) {
          var k2 = Math.floor(Math.random() * (o + 1))
          var t2 = options[o]; options[o] = options[k2]; options[k2] = t2
        }
        return {
          id: String(c.id),
          text: String(c.front || '').trim(),
          options: options,
          correctIndex: options.indexOf(correct),
          timeLimitSec: seconds,
        }
      }).filter(function (c: any) { return c.text && c.correctIndex >= 0 })
      if (cards.length < 4) { source = 'generated'; cards = [] }
    }
    if (cards.length === 0) {
      /* (و72) المولد بياخد العدد والمدة والصعوبة من اختيار الطالب */
      cards = generateFlashcards(roundCount, seconds, urlDifficulty)
    }
    return NextResponse.json({
      ok: true,
      seconds: seconds,
      source: source,
      cards: cards.map(function (c: any) {
        return {
          id: c.id,
          text: c.text,
          options: c.options,
          correctIndex: c.correctIndex,
          timeLimitSec: Number(c.timeLimitSec || seconds),
        }
      }),
    })
  } catch (e: any) {
    console.error('[arena/flashcards GET] failed:', String((e && e.message) || e))
    return NextResponse.json({ ok: false, error: 'مشكلة في تجهيز الجولة' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await ensureArenaTables()
    var body = await request.json().catch(function () { return ({} as any) })
    var action = String(body.action || 'submit')

    /* (و70-ج) إدارة كروت المستر (أدمن) */
    if (action === 'addCard') {
      var front = String(body.front || '').trim().slice(0, 400)
      var back = String(body.back || '').trim().slice(0, 400)
      if (!front || !back) return NextResponse.json({ ok: false, error: 'اكتب الأمام والظهر' }, { status: 400 })
      var cid = 'fcd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      await safeWrite(function () {
        return db.$executeRawUnsafe(
          "INSERT INTO FlashcardCard (id, fileName, front, back, active, createdAt) VALUES (?, '', ?, ?, 1, CURRENT_TIMESTAMP)",
          cid, front, back
        )
      })
      return NextResponse.json({ ok: true, id: cid })
    }
    if (action === 'bulkCards') {
      var text = String(body.text || '')
      var lines = text.split('\n')
      var added = 0
      for (var li = 0; li < lines.length; li++) {
        var ln = lines[li].trim()
        if (!ln) continue
        var parts = ln.split('|')
        if (parts.length < 2) continue
        var f2 = parts[0].trim().slice(0, 400)
        var b2 = parts.slice(1).join(' | ').trim().slice(0, 400)
        if (!f2 || !b2) continue
        var bid = 'fcd_' + Date.now().toString(36) + li.toString(36) + Math.random().toString(36).slice(2, 6)
        await safeWrite(function () {
          return db.$executeRawUnsafe(
            "INSERT INTO FlashcardCard (id, fileName, front, back, active, createdAt) VALUES (?, '', ?, ?, 1, CURRENT_TIMESTAMP)",
            bid, f2, b2
          )
        })
        added++
      }
      return NextResponse.json({ ok: true, added: added })
    }
    if (action === 'toggleCard') {
      await safeWrite(function () {
        return db.$executeRawUnsafe('UPDATE FlashcardCard SET active = ? WHERE id = ?', body.active ? 1 : 0, String(body.id || ''))
      })
      return NextResponse.json({ ok: true })
    }
    if (action === 'deleteCard') {
      await safeWrite(function () {
        return db.$executeRawUnsafe('DELETE FROM FlashcardCard WHERE id = ?', String(body.id || ''))
      })
      return NextResponse.json({ ok: true })
    }
    if (action === 'clearDeck') {
      await safeWrite(function () {
        return db.$executeRawUnsafe('DELETE FROM FlashcardCard')
      })
      return NextResponse.json({ ok: true })
    }

    /* (2026-و68) setTime — الأدمن بيحدد مدة البطاقة (5-90 ثانية) */
    if (action === 'setTime') {
      var secs = Math.max(5, Math.min(Math.round(Number(body.seconds) || FLASHCARD_DEFAULT_SEC), 90))
      var upd = await safeWrite(function () {
        return db.$executeRawUnsafe("UPDATE SiteConfig SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE key = 'flashcard_seconds'", String(secs))
      })
      if (!upd || upd.count === 0) {
        await safeWrite(function () {
          return db.$executeRawUnsafe(
            "INSERT INTO SiteConfig (id, key, value, updatedAt) VALUES ('cfg_flashcard_seconds', 'flashcard_seconds', ?, CURRENT_TIMESTAMP)",
            String(secs)
          )
        })
      }
      return NextResponse.json({ ok: true, seconds: secs })
    }

    var name = String(body.name || '').trim().slice(0, 40)
    var studentId = String(body.studentId || '')
    var score = Math.max(0, Math.min(Number(body.score) || 0, 100000))
    var correctCount = Math.max(0, Math.min(Number(body.correctCount) || 0, 100))
    var totalCards = Math.max(1, Math.min(Number(body.totalCards) || 10, 50))
    if (!name) return NextResponse.json({ ok: false, error: 'اكتب اسمك الأول' }, { status: 400 })

    var id = 'fc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    await safeWrite(function () {
      return db.$executeRawUnsafe(
        'INSERT INTO FlashcardScore (id, studentId, name, score, correctCount, totalCards, createdAt) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        id, studentId, name, score, correctCount, totalCards
      )
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[arena/flashcards POST] failed:', String((e && e.message) || e))
    return NextResponse.json({ ok: false, error: 'مشكلة في حفظ النتيجة' }, { status: 500 })
  }
}
