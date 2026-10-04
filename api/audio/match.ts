import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { verifyAuth } from '../_lib/auth'
import historyOfMusic from '../../paths/history-of-music.json'

const USER_ID = 'muse-user'

// Validate that the given albumId exists in any era of the path
function isValidAlbumId(albumId: string): boolean {
  for (const era of historyOfMusic.eras) {
    if (era.required_albums.some((a) => a.id === albumId)) return true
    if (era.go_deeper_albums.some((a) => a.id === albumId)) return true
  }
  return false
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!verifyAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const body = req.body as {
    albumId?: string
    blobUrl?: string
    filename?: string
    trackNumber?: number | null
    trackName?: string | null
    durationSeconds?: number | null
    format?: string | null
    type?: string
  }

  if (!body.albumId || !body.blobUrl) {
    return res.status(400).json({ error: 'albumId and blobUrl are required' })
  }

  if (!isValidAlbumId(body.albumId)) {
    return res.status(400).json({ error: `Unknown album: ${body.albumId}` })
  }

  try {
    const sql = neon(process.env.DATABASE_URL!)

    // Album artwork upload
    if (body.type === 'art') {
      await sql`
        INSERT INTO album_artwork (album_id, blob_url)
        VALUES (${body.albumId}, ${body.blobUrl})
        ON CONFLICT (album_id) DO UPDATE SET blob_url = EXCLUDED.blob_url, uploaded_at = NOW()
      `
      return res.status(200).json({ ok: true })
    }

    // Audio track upload (default)
    if (!body.filename) {
      return res.status(400).json({ error: 'filename is required for audio tracks' })
    }

    const rows = await sql`
      INSERT INTO audio_files (
        user_id, album_id, blob_url, filename,
        track_number, track_name, duration_seconds, format
      )
      VALUES (
        ${USER_ID},
        ${body.albumId},
        ${body.blobUrl},
        ${body.filename},
        ${body.trackNumber ?? null},
        ${body.trackName ?? null},
        ${body.durationSeconds ?? null},
        ${body.format ?? null}
      )
      RETURNING id
    `

    const row = rows[0] as { id: number }
    return res.status(200).json({ ok: true, id: row.id })
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to save',
    })
  }
}
