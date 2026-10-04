import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { verifyAuth } from './_lib/auth'
import { callLLM } from './_lib/llm'
import { buildSystemPrompt } from './_lib/muse-prompt'
import { getLLMConfig } from './settings'
import historyOfMusic from '../paths/history-of-music.json'

const USER_ID = 'muse-user'
const PATH_ID = 'history-of-music'

type PathData = typeof historyOfMusic

function findAlbumAndEra(albumId: string, pathData: PathData) {
  for (const era of pathData.eras) {
    const album = era.required_albums.find((a) => a.id === albumId)
    if (album) return { era, album }
  }
  return null
}

function buildAlbumLookup(pathData: PathData) {
  const lookup = new Map<string, { album_label: string; era_name: string }>()
  for (const era of pathData.eras) {
    for (const album of era.required_albums) {
      lookup.set(album.id, { album_label: `${album.artist} — ${album.title}`, era_name: era.name })
    }
  }
  return lookup
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findOrCreateConversation(sql: any, albumId: string) {
  const rows = await sql`
    SELECT id FROM muse_conversations
    WHERE user_id = ${USER_ID} AND scope = 'album' AND album_id = ${albumId}
    ORDER BY created_at DESC
    LIMIT 1
  `
  if (rows.length > 0) return rows[0].id as number

  const newConv = await sql`
    INSERT INTO muse_conversations (user_id, scope, album_id)
    VALUES (${USER_ID}, 'album', ${albumId})
    RETURNING id
  `
  return newConv[0].id as number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' })

  const { album_id } = req.query
  if (!album_id || typeof album_id !== 'string') {
    return res.status(400).json({ error: 'album_id is required' })
  }

  const sql = neon(process.env.DATABASE_URL!)

  // GET — find or create the conversation for this album, return with messages
  if (req.method === 'GET') {
    const conversationId = await findOrCreateConversation(sql, album_id)
    const messages = await sql`
      SELECT id, role, content, created_at
      FROM muse_messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
    `
    return res.status(200).json({ id: conversationId, album_id, messages })
  }

  // POST — send a message and get an AI response
  if (req.method === 'POST') {
    const { content } = req.body as { content?: string }
    if (!content?.trim()) return res.status(400).json({ error: 'content is required' })

    const config = await getLLMConfig()
    if (!config) return res.status(400).json({ error: 'LLM not configured' })

    const found = findAlbumAndEra(album_id, historyOfMusic as PathData)
    if (!found) return res.status(404).json({ error: `Album '${album_id}' not found in path` })
    const { era, album } = found

    const conversationId = await findOrCreateConversation(sql, album_id)

    // Load journal entries (across the whole Path, so MUSE can connect observations
    // across albums) and prior conversation for context
    const [journalRows, priorMessages] = await Promise.all([
      sql`
        SELECT album_id, listen_number, raw_content
        FROM journal_entries
        WHERE user_id = ${USER_ID} AND path_id = ${PATH_ID}
        ORDER BY created_at
      `,
      sql`
        SELECT role, content FROM muse_messages
        WHERE conversation_id = ${conversationId}
        ORDER BY created_at ASC
      `,
    ])

    const albumLookup = buildAlbumLookup(historyOfMusic as PathData)
    const journals = journalRows.map((r) => {
      const meta = albumLookup.get(r.album_id as string)
      return {
        album_id: r.album_id as string,
        album_label: meta?.album_label ?? (r.album_id as string),
        era_name: meta?.era_name ?? '',
        listen_number: r.listen_number as number,
        raw_content: r.raw_content as string,
      }
    })
    const history = priorMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as string,
    }))

    const systemPrompt = buildSystemPrompt(era, album, album_id, journals)
    const messages = [...history, { role: 'user' as const, content: content.trim() }]

    const aiResponse = await callLLM(config.provider, config.apiKey, systemPrompt, messages, 1024)

    await sql`
      INSERT INTO muse_messages (conversation_id, role, content)
      VALUES
        (${conversationId}, 'user', ${content.trim()}),
        (${conversationId}, 'assistant', ${aiResponse})
    `
    await sql`UPDATE muse_conversations SET updated_at = NOW() WHERE id = ${conversationId}`

    return res.status(200).json({ role: 'assistant', content: aiResponse })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
