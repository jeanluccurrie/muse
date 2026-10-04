import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { verifyAuth } from '../_lib/auth'
import { getLLMConfig } from '../settings'

const USER_ID = 'muse-user'
const PATH_ID = 'history-of-music'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { albumId } = req.query
  if (!albumId || typeof albumId !== 'string') {
    return res.status(400).json({ error: 'albumId is required' })
  }

  const sql = neon(process.env.DATABASE_URL!)

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, listen_number, raw_content, cleaned_content, created_at, updated_at
      FROM journal_entries
      WHERE user_id = ${USER_ID}
        AND path_id = ${PATH_ID}
        AND album_id = ${albumId}
      ORDER BY listen_number
    `
    return res.status(200).json(rows)
  }

  if (req.method === 'POST') {
    const { listen_number, raw_content } = req.body as {
      listen_number?: number
      raw_content?: string
    }

    if (listen_number === undefined || listen_number === null || typeof raw_content !== 'string') {
      return res.status(400).json({ error: 'listen_number and raw_content are required' })
    }

    const rows = await sql`
      INSERT INTO journal_entries
        (user_id, path_id, album_id, listen_number, raw_content, updated_at)
      VALUES
        (${USER_ID}, ${PATH_ID}, ${albumId}, ${listen_number}, ${raw_content}, NOW())
      ON CONFLICT (user_id, path_id, album_id, listen_number)
      DO UPDATE SET raw_content = EXCLUDED.raw_content, updated_at = NOW()
      RETURNING id, listen_number, raw_content, created_at, updated_at
    `
    return res.status(200).json(rows[0])
  }

  if (req.method === 'PATCH') {
    const { listen_number } = req.body as { listen_number?: number }
    if (listen_number === undefined || listen_number === null) {
      return res.status(400).json({ error: 'listen_number is required' })
    }

    const config = await getLLMConfig()
    if (!config) return res.status(400).json({ error: 'LLM not configured' })

    const rows = await sql`
      SELECT id, raw_content, cleaned_content
      FROM journal_entries
      WHERE user_id = ${USER_ID}
        AND path_id = ${PATH_ID}
        AND album_id = ${albumId}
        AND listen_number = ${listen_number}
    `
    if (!rows.length) return res.status(404).json({ error: 'Journal entry not found' })
    const entry = rows[0] as { id: number; raw_content: string; cleaned_content: string | null }
    if (entry.cleaned_content) {
      // Already cleaned — return existing
      const full = await sql`
        SELECT id, listen_number, raw_content, cleaned_content, created_at, updated_at
        FROM journal_entries WHERE id = ${entry.id}
      `
      return res.status(200).json(full[0])
    }

    const prompt = `You are editing a personal music listening journal. Clean up the text below — fix obvious typos, awkward phrasing, and run-on sentences — while preserving the writer's voice, perspective, and every specific observation they made. Do not add new ideas or expand the content. Return only the cleaned text, nothing else.\n\n${entry.raw_content}`

    let cleaned = ''
    if (config.provider === 'anthropic') {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await resp.json() as { content?: Array<{ text: string }> }
      cleaned = data.content?.[0]?.text ?? entry.raw_content
    } else {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await resp.json() as { choices?: Array<{ message: { content: string } }> }
      cleaned = data.choices?.[0]?.message?.content ?? entry.raw_content
    }

    const updated = await sql`
      UPDATE journal_entries
      SET cleaned_content = ${cleaned}, updated_at = NOW()
      WHERE id = ${entry.id}
      RETURNING id, listen_number, raw_content, cleaned_content, created_at, updated_at
    `
    return res.status(200).json(updated[0])
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
