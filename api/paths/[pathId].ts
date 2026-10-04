import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from '../_lib/auth'
import historyOfMusic from '../../paths/history-of-music.json'

// Map of known path IDs to their data.
// Adding a new Path = add a new entry here.
const KNOWN_PATHS: Record<string, unknown> = {
  'history-of-music': historyOfMusic,
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!verifyAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const pathId = req.query.pathId as string
  const pathData = KNOWN_PATHS[pathId]

  if (!pathData) {
    return res.status(404).json({ error: `Path '${pathId}' not found` })
  }

  return res.status(200).json(pathData)
}
