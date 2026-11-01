// @ts-nocheck
// GET /api/health — production database diagnostic + AUTO-REPAIR.
// Tells EXACTLY why APIs would 500: which env vars are visible (names only,
// never values) + a live DB query test.
// NEW: if the connected database is missing core tables (e.g. the teacher
// swapped DATABASE_URL in Vercel to a fresh Turso database), the health check
// creates the full schema automatically — no more "every API 500s after I
// changed the database" outages. Just open /api/health once and it heals.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { makeLibsqlClient, ensureSchema, CORE_TABLES } from '@/lib/ensure-schema'

export async function GET() {
  var env = {
    TURSO_DATABASE_URL: !!process.env.TURSO_DATABASE_URL,
    DATABASE_URL_set: !!process.env.DATABASE_URL,
    DATABASE_URL_is_libsql: String(process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || '').indexOf('libsql://') === 0,
    TURSO_AUTH_TOKEN: !!process.env.TURSO_AUTH_TOKEN,
    DATABASE_AUTH_TOKEN: !!process.env.DATABASE_AUTH_TOKEN,
  }

  var database = 'ok'
  var dbError = ''
  var counts = {}
  var autoFixed = false
  var repairedTables: string[] = []
  try {
    await db.$queryRawUnsafe('SELECT 1')

    // ---- AUTO-REPAIR: create missing core tables on a fresh/empty database ----
    try {
      var client = makeLibsqlClient()
      if (client) {
        var outcome = await ensureSchema(client)
        if (outcome.repaired) {
          autoFixed = true
          repairedTables = outcome.missing
        }
        try { await client.close() } catch (e) {}
      }
    } catch (e) {}

    try { counts.students = await db.student.count() } catch (e) { counts.students = 'n/a' }
    try { counts.videos = await db.video.count() } catch (e) { counts.videos = 'n/a' }
    try { counts.admins = await db.admin.count() } catch (e) { counts.admins = 'n/a' }
  } catch (e) {
    database = 'fail'
    dbError = String(e && e.message ? e.message : e).substring(0, 300)
  }

  return NextResponse.json({
    status: database === 'ok' ? 'healthy' : 'unhealthy',
    env,
    database,
    autoFixed,
    repairedTables,
    coreTables: CORE_TABLES.length,
    dbError,
    counts,
    time: new Date().toISOString(),
  })
}
