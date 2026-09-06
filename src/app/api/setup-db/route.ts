import { NextResponse } from 'next/server'
import { makeLibsqlClient, ensureSchema } from '@/lib/ensure-schema'

export async function GET() {
  try {
    var client = makeLibsqlClient()
    if (!client) return NextResponse.json({ ok: false, error: 'DATABASE_URL not set' }, { status: 500 })

    var outcome = await ensureSchema(client, { force: true })

    try { await client.close() } catch (e) {}
    return NextResponse.json({ ok: true, missing: outcome.missing, results: outcome.results })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || String(error) }, { status: 500 })
  }
}

export async function POST() { return GET() }
