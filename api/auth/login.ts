import type { VercelRequest, VercelResponse } from '@vercel/node'
import jwt from 'jsonwebtoken'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authPassword = process.env.MUSE_AUTH_PASSWORD
  if (!authPassword) {
    return res
      .status(500)
      .json({ error: 'Server misconfigured: MUSE_AUTH_PASSWORD not set' })
  }

  const body = req.body as { password?: string }
  if (!body?.password || body.password !== authPassword) {
    return res.status(401).json({ error: 'Incorrect password' })
  }

  const token = jwt.sign(
    { sub: 'muse-user' },
    authPassword,
    { expiresIn: '365d' }
  )

  return res.status(200).json({ token })
}
