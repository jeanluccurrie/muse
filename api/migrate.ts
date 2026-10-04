import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { verifyAuth } from './_lib/auth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!verifyAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const sql = neon(process.env.DATABASE_URL!)

    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        settings_json JSONB NOT NULL DEFAULT '{}'
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS user_paths (
        user_id TEXT NOT NULL REFERENCES users(id),
        path_id TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        current_era INTEGER NOT NULL DEFAULT 1,
        current_album_id TEXT NOT NULL DEFAULT 'corelli-concerti-grossi-op-6',
        current_listen INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, path_id)
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        path_id TEXT NOT NULL,
        album_id TEXT NOT NULL,
        listen_number INTEGER NOT NULL,
        raw_content TEXT,
        cleaned_content TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS audio_files (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        album_id TEXT NOT NULL,
        blob_url TEXT NOT NULL,
        filename TEXT NOT NULL,
        track_number INTEGER,
        track_name TEXT,
        duration_seconds REAL,
        format TEXT,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `

    // Add track_name column if it doesn't exist (existing installs before chunk 3)
    await sql`
      ALTER TABLE audio_files ADD COLUMN IF NOT EXISTS track_name TEXT
    `

    // Add unique constraint on journal_entries so upserts work
    try {
      await sql`
        ALTER TABLE journal_entries
        ADD CONSTRAINT journal_entries_unique_listen
        UNIQUE (user_id, path_id, album_id, listen_number)
      `
    } catch {
      // Constraint already exists — safe to ignore
    }

    await sql`
      CREATE TABLE IF NOT EXISTS muse_content (
        album_id TEXT NOT NULL,
        path_id TEXT NOT NULL,
        pre_listen_context TEXT,
        album_essay TEXT,
        listening_prompts_json JSONB,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (album_id, path_id)
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS muse_conversations (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        scope TEXT NOT NULL DEFAULT 'album',
        album_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS muse_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES muse_conversations(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS album_completion (
        user_id TEXT NOT NULL,
        path_id TEXT NOT NULL,
        album_id TEXT NOT NULL,
        completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, path_id, album_id)
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS album_artwork (
        album_id TEXT PRIMARY KEY,
        blob_url TEXT NOT NULL,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `

    // Add playback position columns for cross-device resume (added post-chunk-3)
    await sql`
      ALTER TABLE user_paths ADD COLUMN IF NOT EXISTS current_track_index INTEGER
    `
    await sql`
      ALTER TABLE user_paths ADD COLUMN IF NOT EXISTS current_time_seconds FLOAT
    `

    // Ensure the default user exists
    await sql`
      INSERT INTO users (id)
      VALUES ('muse-user')
      ON CONFLICT (id) DO NOTHING
    `

    return res.status(200).json({ ok: true, message: 'Migration complete — all tables created.' })
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Migration failed',
    })
  }
}
