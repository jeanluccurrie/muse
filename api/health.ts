import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'

export default async function handler(
  _req: VercelRequest,
  res: VercelResponse
) {
  const result: {
    ok: boolean
    db?: string
    timestamp?: string
    error?: string
  } = { ok: true }

  try {
    const sql = neon(process.env.DATABASE_URL!)
    const rows = await sql`SELECT NOW() AS timestamp`
    const row = rows[0] as { timestamp: string }
    result.db = 'connected'
    result.timestamp = row.timestamp
  } catch (err) {
    result.ok = false
    result.db = 'error'
    result.error = err instanceof Error ? err.message : 'Unknown database error'
  }

  return res.status(result.ok ? 200 : 503).json(result)
}
