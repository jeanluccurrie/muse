import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { verifyAuth } from '../_lib/auth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth check: the client sends the JWT in the Authorization header
  if (!verifyAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,

      onBeforeGenerateToken: async (
        pathname: string,
        _clientPayload: string | null,
        _multipart: boolean
      ) => {
        console.log('Generating client token for:', pathname)
        return {
          // No allowedContentTypes restriction — browsers report M4A/FLAC/etc
          // with inconsistent MIME types; auth is handled at the API layer
          maximumSizeInBytes: 800 * 1024 * 1024, // 800 MB
        }
      },

      onUploadCompleted: async ({ blob }: { blob: { url: string } }) => {
        console.log('Blob upload completed:', blob.url)
      },
    })

    return res.status(200).json(jsonResponse)
  } catch (err) {
    console.error('handleUpload error:', err)
    return res.status(400).json({
      error: err instanceof Error ? err.message : 'Upload failed',
    })
  }
}
