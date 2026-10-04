const TOKEN_KEY = 'muse_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * Checks whether a token exists and hasn't expired.
 * Does NOT verify the signature — that happens on the backend.
 * If the token is structurally invalid or expired, it's cleared.
 */
export function isAuthenticated(): boolean {
  const token = getToken()
  if (!token) return false

  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      clearToken()
      return false
    }
    // Decode payload without signature verification
    const payload = JSON.parse(atob(parts[1]))
    if (payload.exp && payload.exp < Date.now() / 1000) {
      clearToken()
      return false
    }
    return true
  } catch {
    clearToken()
    return false
  }
}
