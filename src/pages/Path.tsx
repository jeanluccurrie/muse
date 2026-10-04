import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../lib/api'
import type { PathData, Progress } from '../types/path'
import NetworkMap from '../components/path/NetworkMap'
import AlbumDetail from '../components/path/AlbumDetail'

export default function PathPage() {
  const navigate = useNavigate()
  const [pathData, setPathData] = useState<PathData | null>(null)
  const [completedAlbums, setCompletedAlbums] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      apiGet<PathData>('/api/paths/history-of-music'),
      apiGet<Progress>('/api/progress'),
    ])
      .then(([path, prog]) => {
        setPathData(path)
        setCompletedAlbums(prog.completed_albums ?? [])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-[#dddddd] text-xs tracking-[0.3em] uppercase">Loading…</p>
      </div>
    )
  }

  if (!pathData) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-[#999999] text-sm">Unable to load library.</p>
      </div>
    )
  }

  if (selectedAlbumId) {
    return (
      <AlbumDetail
        albumId={selectedAlbumId}
        pathData={pathData}
        isLocked={!completedAlbums.includes(selectedAlbumId)}
        onBack={() => setSelectedAlbumId(null)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-white text-[#111111] flex flex-col max-w-lg mx-auto">

      {/* Header */}
      <header className="flex items-center justify-between px-8 pt-8 pb-2 flex-shrink-0">
        <span className="font-sans font-bold tracking-[0.15em] text-sm text-[#111111] uppercase">MUSE</span>
        <button
          onClick={() => navigate('/')}
          className="text-[#cccccc] hover:text-[#666666] transition-colors text-xs tracking-[0.2em] uppercase"
        >
          Return to Session →
        </button>
      </header>

      {/* Title */}
      <div className="px-8 pt-8 pb-8 border-b border-[#e8e8e0]">
        <p className="text-[#bbbbbb] text-xs tracking-[0.25em] uppercase mb-1">The Path</p>
        <p className="text-[#666666] text-sm leading-relaxed">
          {completedAlbums.length === 0
            ? 'Your journey through music history, waiting to begin.'
            : `${completedAlbums.length} album${completedAlbums.length === 1 ? '' : 's'} completed. Tap a filled node to revisit.`}
        </p>
      </div>

      {/* Network map */}
      <div className="px-8 pt-8 pb-8 overflow-y-auto">
        <NetworkMap
          pathData={pathData}
          completedAlbums={completedAlbums}
          onAlbumClick={setSelectedAlbumId}
        />
      </div>
    </div>
  )
}
