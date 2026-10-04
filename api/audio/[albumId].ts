import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { verifyAuth } from '../_lib/auth'

const USER_ID = 'muse-user'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!verifyAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const albumId = req.query.albumId as string

  try {
    const sql = neon(process.env.DATABASE_URL!)

    // PATCH: update duration_seconds for a specific track
    if (req.method === 'PATCH') {
      const { id, durationSeconds } = req.body as { id: number; durationSeconds: number }
      if (!id || durationSeconds == null) {
        return res.status(400).json({ error: 'id and durationSeconds are required' })
      }
      await sql`
        UPDATE audio_files
        SET duration_seconds = ${durationSeconds}
        WHERE id = ${id} AND user_id = ${USER_ID}
      `
      return res.status(200).json({ ok: true })
    }

    // Artwork lookup: ?artwork=1
    if (req.query.artwork === '1') {
      const rows = await sql`
        SELECT blob_url FROM album_artwork WHERE album_id = ${albumId}
      `
      return res.status(200).json({ artwork_url: (rows[0] as { blob_url: string } | undefined)?.blob_url ?? null })
    }

    const rows = await sql`
      SELECT id, album_id, blob_url, filename,
             track_number, track_name, duration_seconds, format
      FROM audio_files
      WHERE user_id = ${USER_ID} AND album_id = ${albumId}
      ORDER BY track_number ASC NULLS LAST, filename ASC
    `

    return res.status(200).json(rows)
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load audio files',
    })
  }
}
