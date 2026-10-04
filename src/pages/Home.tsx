import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { clearToken } from '../lib/auth'
import { applyEraTheme } from '../lib/themes'
import SessionView from '../components/session/SessionView'
import type { PathData, Progress } from '../types/path'

export default function Home() {
  const navigate = useNavigate()
  const [pathData, setPathData] = useState<PathData | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const [path, prog] = await Promise.all([
          apiGet<PathData>('/api/paths/history-of-music'),
          apiGet<Progress>('/api/progress'),
        ])
        setPathData(path)
        setProgress(prog)
        applyEraTheme(prog.current_era)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-[#cccccc] text-xs tracking-[0.3em] uppercase">Loading…</p>
      </div>
    )
  }

  if (error || !pathData || !progress) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 gap-6">
        <h1 className="font-serif text-[#111111] text-5xl tracking-[0.2em]">MUSE</h1>
        <p className="text-[#888888] text-sm">{error ?? 'Unable to load path data.'}</p>
        <p className="text-[#bbbbbb] text-xs max-w-xs text-center leading-relaxed">
          If this is your first time, run the database migration by visiting{' '}
          <code className="text-[#999999]">/api/migrate</code> in a REST client, then refresh.
        </p>
        <button
          onClick={handleLogout}
          className="text-[#cccccc] text-xs tracking-[0.2em] uppercase hover:text-[#888888] transition-colors mt-4"
        >
          log out
        </button>
      </div>
    )
  }

  return <SessionView pathData={pathData} progress={progress} onLogout={handleLogout} />
}
