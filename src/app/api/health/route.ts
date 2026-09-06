// @ts-nocheck
// GET /api/health — production database diagnostic.
// Tells EXACTLY why APIs would 500: which env vars are visible (names only,
// never values) + a live DB query test. Open /api/health in the browser after
// deploying; if "database": "fail", the env vars in Vercel are missing/wrong.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
  try {
    await db.$queryRawUnsafe('SELECT 1')
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
    dbError,
    counts,
    time: new Date().toISOString(),
  })
}
