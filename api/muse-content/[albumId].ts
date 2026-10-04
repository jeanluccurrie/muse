import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { verifyAuth } from '../_lib/auth'
import { callLLM } from '../_lib/llm'
import { buildSystemPrompt, buildPreListenPrompt } from '../_lib/muse-prompt'
import { getLLMConfig } from '../settings'
import historyOfMusic from '../../paths/history-of-music.json'

const PATH_ID = 'history-of-music'

type PathData = typeof historyOfMusic

function findAlbumAndEra(albumId: string, pathData: PathData) {
  for (const era of pathData.eras) {
    const album = era.required_albums.find((a) => a.id === albumId)
    if (album) return { era, album }
  }
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' })

  const { albumId } = req.query
  if (!albumId || typeof albumId !== 'string') {
    return res.status(400).json({ error: 'albumId is required' })
  }

  const sql = neon(process.env.DATABASE_URL!)

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT pre_listen_context, album_essay, generated_at
      FROM muse_content
      WHERE album_id = ${albumId} AND path_id = ${PATH_ID}
    `
    if (rows.length === 0) {
      return res.status(200).json({ pre_listen_context: null, album_essay: null })
    }
    return res.status(200).json(rows[0])
  }

  if (req.method === 'POST') {
    try {
      const config = await getLLMConfig()
      if (!config) {
        return res.status(400).json({ error: 'LLM not configured' })
      }

      const found = findAlbumAndEra(albumId, historyOfMusic as PathData)
      if (!found) {
        return res.status(404).json({ error: `Album '${albumId}' not found in path` })
      }
      const { era, album } = found

      const systemPrompt = buildSystemPrompt(era, album, albumId, [])
      const userPrompt = buildPreListenPrompt(era, album)

      const preListenContext = await callLLM(
        config.provider,
        config.apiKey,
        systemPrompt,
        [{ role: 'user', content: userPrompt }],
        512,
      )

      await sql`
        INSERT INTO muse_content (album_id, path_id, pre_listen_context, generated_at)
        VALUES (${albumId}, ${PATH_ID}, ${preListenContext}, NOW())
        ON CONFLICT (album_id, path_id)
        DO UPDATE SET pre_listen_context = EXCLUDED.pre_listen_context, generated_at = NOW()
      `

      return res.status(200).json({ pre_listen_context: preListenContext, album_essay: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return res.status(500).json({ error: message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
