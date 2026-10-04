import { getToken, clearToken } from './auth'

function getHeaders(): HeadersInit {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

function handleUnauthorized(): never {
  clearToken()
  window.location.href = '/login'
  throw new Error('Unauthorized — redirecting to login')
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    method: 'GET',
    headers: getHeaders(),
  })

  if (res.status === 401) handleUnauthorized()

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `API error: ${res.status}`)
  }

  return res.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })

  if (res.status === 401) handleUnauthorized()

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(errBody.error ?? `API error: ${res.status}`)
  }

  return res.json() as Promise<T>
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })

  if (res.status === 401) handleUnauthorized()

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(errBody.error ?? `API error: ${res.status}`)
  }

  return res.json() as Promise<T>
}
