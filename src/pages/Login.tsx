import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAuthenticated, setToken } from '../lib/auth'

export default function Login() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/', { replace: true })
    }
  }, [navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (!res.ok) {
        setError('Incorrect password.')
        setPassword('')
        return
      }

      const data = await res.json() as { token: string }
      setToken(data.token)
      navigate('/', { replace: true })
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-xs">

        {/* Wordmark */}
        <div className="text-center mb-20">
          <h1 className="text-7xl font-serif text-[#111111] tracking-[0.25em] mb-4">
            MUSE
          </h1>
          <p className="text-[#999999] text-xs tracking-[0.3em] uppercase">
            A journey through music history
          </p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="password"
            autoFocus
            autoComplete="current-password"
            className={[
              'w-full bg-transparent border-b py-3',
              'text-[#111111] placeholder-[#cccccc]',
              'text-center text-sm tracking-[0.2em]',
              'transition-colors duration-300',
              error
                ? 'border-[#cc4444]'
                : 'border-[#e8e8e0] focus:border-[#555555]',
            ].join(' ')}
          />

          {error && (
            <p className="text-[#6b3030] text-xs text-center tracking-wider">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className={[
              'w-full py-3 text-xs tracking-[0.3em] uppercase',
              'border transition-colors duration-300',
              'disabled:opacity-25 disabled:cursor-not-allowed',
              loading || !password
                ? 'border-[#e8e8e0] text-[#3d3428]'
                : 'bg-[#111111] border-[#111111] text-white hover:bg-[#333333]',
            ].join(' ')}
          >
            {loading ? 'entering…' : 'enter'}
          </button>
        </form>

      </div>
    </div>
  )
}
