import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { verifyAuth } from './_lib/auth'

const USER_ID = 'muse-user'
const PATH_ID = 'history-of-music'

const DEFAULT_PROGRESS = {
  path_id: PATH_ID,
  current_era: 1,
  current_album_id: 'corelli-concerti-grossi-op-6',
  current_listen: 1,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const sql = neon(process.env.DATABASE_URL!)

  // ── GET: return current progress ────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const [rows, completedRows] = await Promise.all([
        sql`
          SELECT path_id, current_era, current_album_id, current_listen,
                 current_track_index, current_time_seconds
          FROM user_paths
          WHERE user_id = ${USER_ID} AND path_id = ${PATH_ID}
        `,
        sql`
          SELECT album_id FROM album_completion
          WHERE user_id = ${USER_ID} AND path_id = ${PATH_ID}
          ORDER BY completed_at ASC
        `.catch(() => [] as { album_id: string }[]),
      ])

      const completed_albums = (completedRows as { album_id: string }[]).map(
        (r) => r.album_id
      )

      if (rows.length === 0) {
        return res.status(200).json({ ...DEFAULT_PROGRESS, completed_albums })
      }

      const row = rows[0] as {
        path_id: string
        current_era: number
        current_album_id: string
        current_listen: number
        current_track_index: number | null
        current_time_seconds: number | null
      }

      return res.status(200).json({
        path_id: row.path_id,
        current_era: row.current_era,
        current_album_id: row.current_album_id,
        current_listen: row.current_listen,
        current_track_index: row.current_track_index ?? null,
        current_time_seconds: row.current_time_seconds ?? null,
        completed_albums,
      })
    } catch {
      return res.status(200).json({ ...DEFAULT_PROGRESS, completed_albums: [] })
    }
  }

  // ── POST: upsert progress ────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body as {
      current_era?: number
      current_album_id?: string
      current_listen?: number
      completed_album_id?: string
      current_track_index?: number | null
      current_time_seconds?: number | null
    }

    const newEra = body.current_era ?? DEFAULT_PROGRESS.current_era
    const newAlbumId = body.current_album_id ?? DEFAULT_PROGRESS.current_album_id
    const newListen = body.current_listen ?? DEFAULT_PROGRESS.current_listen
    // Only update playback position when explicitly provided — omitting them preserves the saved position
    const hasPosition = 'current_track_index' in body

    try {
      if (hasPosition) {
        const newTrackIndex = body.current_track_index ?? null
        const newTimeSeconds = body.current_time_seconds ?? null
        await sql`
          INSERT INTO user_paths (user_id, path_id, current_era, current_album_id, current_listen,
                                  current_track_index, current_time_seconds)
          VALUES (${USER_ID}, ${PATH_ID}, ${newEra}, ${newAlbumId}, ${newListen},
                  ${newTrackIndex}, ${newTimeSeconds})
          ON CONFLICT (user_id, path_id) DO UPDATE SET
            current_era = EXCLUDED.current_era,
            current_album_id = EXCLUDED.current_album_id,
            current_listen = EXCLUDED.current_listen,
            current_track_index = EXCLUDED.current_track_index,
            current_time_seconds = EXCLUDED.current_time_seconds
        `
      } else {
        await sql`
          INSERT INTO user_paths (user_id, path_id, current_era, current_album_id, current_listen)
          VALUES (${USER_ID}, ${PATH_ID}, ${newEra}, ${newAlbumId}, ${newListen})
          ON CONFLICT (user_id, path_id) DO UPDATE SET
            current_era = EXCLUDED.current_era,
            current_album_id = EXCLUDED.current_album_id,
            current_listen = EXCLUDED.current_listen
        `
      }

      if (body.completed_album_id) {
        await sql`
          INSERT INTO album_completion (user_id, path_id, album_id)
          VALUES (${USER_ID}, ${PATH_ID}, ${body.completed_album_id})
          ON CONFLICT (user_id, path_id, album_id) DO NOTHING
        `
      }

      return res.status(200).json({ ok: true })
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to update progress',
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
