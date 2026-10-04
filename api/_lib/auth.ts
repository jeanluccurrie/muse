import jwt from 'jsonwebtoken'
import type { VercelRequest } from '@vercel/node'

export function verifyAuth(req: VercelRequest): boolean {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return false

  const token = authHeader.slice(7)
  const secret = process.env.MUSE_AUTH_PASSWORD
  if (!secret) return false

  try {
    jwt.verify(token, secret)
    return true
  } catch {
    return false
  }
}
