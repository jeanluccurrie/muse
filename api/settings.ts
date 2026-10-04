import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { verifyAuth } from './_lib/auth'
import { encrypt, decrypt } from './_lib/crypto'

const USER_ID = 'muse-user'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' })

  const sql = neon(process.env.DATABASE_URL!)

  if (req.method === 'GET') {
    // Data export
    if (req.query.action === 'export') {
      const empty: unknown[] = []
      const [progress, journals, conversations, messages] = await Promise.all([
        sql`SELECT * FROM user_paths WHERE user_id = ${USER_ID}`.catch(() => empty),
        sql`SELECT id, album_id, listen_number, raw_content, cleaned_content, created_at FROM journal_entries WHERE user_id = ${USER_ID} ORDER BY album_id, listen_number`.catch(() => empty),
        sql`SELECT id, scope, album_id, created_at FROM muse_conversations WHERE user_id = ${USER_ID} ORDER BY created_at`.catch(() => empty),
        sql`SELECT conversation_id, role, content, created_at FROM muse_messages WHERE conversation_id IN (SELECT id FROM muse_conversations WHERE user_id = ${USER_ID}) ORDER BY created_at`.catch(() => empty),
      ])
      return res.status(200).json({
        exported_at: new Date().toISOString(),
        progress,
        journals,
        conversations,
        messages,
      })
    }

    const rows = await sql`
      SELECT settings_json FROM users WHERE id = ${USER_ID}
    `
    const settings = (rows[0]?.settings_json ?? {}) as Record<string, string>
    return res.status(200).json({
      llm_provider: settings.llm_provider ?? null,
      llm_api_key_set: !!settings.llm_api_key_encrypted,
    })
  }

  if (req.method === 'POST') {
    const { llm_provider, llm_api_key } = req.body as {
      llm_provider?: string
      llm_api_key?: string
    }

    if (!llm_provider) return res.status(400).json({ error: 'llm_provider is required' })

    const rows = await sql`
      SELECT settings_json FROM users WHERE id = ${USER_ID}
    `
    const existing = (rows[0]?.settings_json ?? {}) as Record<string, string>

    const updated: Record<string, string> = { ...existing, llm_provider }

    // Only re-encrypt if a new key was provided
    if (llm_api_key) {
      updated.llm_api_key_encrypted = encrypt(llm_api_key)
    }

    await sql`
      UPDATE users SET settings_json = ${JSON.stringify(updated)}::jsonb WHERE id = ${USER_ID}
    `

    return res.status(200).json({
      llm_provider: updated.llm_provider,
      llm_api_key_set: !!updated.llm_api_key_encrypted,
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// Exported for use by other API handlers that need the decrypted key
export async function getLLMConfig(): Promise<{ provider: string; apiKey: string } | null> {
  const sql = neon(process.env.DATABASE_URL!)
  const rows = await sql`SELECT settings_json FROM users WHERE id = ${USER_ID}`
  const settings = (rows[0]?.settings_json ?? {}) as Record<string, string>
  if (!settings.llm_provider || !settings.llm_api_key_encrypted) return null
  try {
    return {
      provider: settings.llm_provider,
      apiKey: decrypt(settings.llm_api_key_encrypted),
    }
  } catch {
    return null
  }
}
