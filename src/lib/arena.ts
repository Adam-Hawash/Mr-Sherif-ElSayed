// @ts-nocheck
// ============================================================
// FILE: src/lib/arena.ts
// PURPOSE: (2026-و66) أدوات مشتركة لساحة التحدي والخرائط الذهنية:
//   • ensureArenaTables — ضمان جداول الساحة (BattleRoom/BattlePlayer/
//     TeacherChallenge/ChallengeEntry/FlashcardScore/MindMap) على Turso
//     بنفس نمط المشروع (ممنوع db:push — ensureSchema تتحمل كل حاجة)
//   • مولدات كود الغرفة والمعرفات
// كاش مستوى الموديول: الـ DDL مرة واحدة لكل instance (زي باقي المنصة)
// ============================================================

import { ensureSchema, makeLibsqlClient } from '@/lib/ensure-schema'
import { db } from '@/lib/db'

var _arenaReady: Promise<void> | null = null

export function ensureArenaTables(): Promise<void> {
  if (!_arenaReady) {
    _arenaReady = (async function () {
      try {
        var client = makeLibsqlClient()
        if (client) {
          try { await ensureSchema(client) } finally { try { await client.close() } catch (e2) {} }
        }
      } catch (e) {}
    })()
  }
  return _arenaReady
}

/* ترميز أكواد الغرف بدون حروف متشابهة (بدون O/0 و I/1) */
export var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makeRoomCode(): string {
  var s = ''
  for (var i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return s
}

export function makeId(prefix: string): string {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

export function makeToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/* ============================================================
   (2026-و85) sweepArena — تنظيف تلقائي لغرف التحدي
   طلب المستر حرفيًا (و85): «التحدي يتمسح بعديها بيوم عشان الطالب
   لو يقدر يجي يشوف درجته هو وزمايله» — يعني الغرفة تعيش يوم كامل
   بعد خلصها وبعدها تتمسح أوتوماتيك.
   القواعد (تحديث و85 — كانت 30 دقيقة/6 ساعات في و84):
   1) غرف خلصت (ended/finished) من أكتر من 24 ساعة → الغرفة + كل لاعبيها
      (يوم كامل مهلة عشان الطالب يشوف نتيجته هو وزمايله)
   2) غرف مهجورة/عالقة (أي حالة) من أكتر من 24 ساعة → الغرفة + كل لاعبيها
      (lobbies فتحت ونسيان، تحديات اتسابت مفتوحة — «لو طالت»)
   البيانات دي مؤقتة بطبيعتها (أسئلة مولدة + درجات جلسة لعب) — مش درجات
   امتحانات ولا صفوف طلاب، فمسحها آمن تمامًا.
   Throttle: مرة واحدة كل 5 دقائق على الأقل لكل instance — بتتنادى من
   polling الغرفة والإنشاء، فمش هيدفع نداءات كتابة ضاية على Turso.
   ============================================================ */
var _lastArenaSweep = 0

export async function sweepArena(): Promise<void> {
  var now = Date.now()
  if (now - _lastArenaSweep < 5 * 60 * 1000) return
  _lastArenaSweep = now
  try {
    /* يوم كامل (24 ساعة) للمخلّص والمهجور — طلب و85 */
    var cutoffDay = new Date(now - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19)
    var stale = (await db.$queryRawUnsafe(
      "SELECT id FROM BattleRoom WHERE (status IN ('ended', 'finished') AND updatedAt < ?) OR createdAt < ?",
      cutoffDay, cutoffDay
    )) || []
    for (var i = 0; i < stale.length; i++) {
      try { await db.$executeRawUnsafe('DELETE FROM BattlePlayer WHERE roomId = ?', stale[i].id) } catch (e) {}
      try { await db.$executeRawUnsafe('DELETE FROM BattleRoom WHERE id = ?', stale[i].id) } catch (e) {}
    }
  } catch (e) {
    /* التنظيف مش مفروض يبوّظ أي عملية لعب — نسكت */
  }
}
