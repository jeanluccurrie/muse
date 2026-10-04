import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../../lib/api'
import { applyEraTheme } from '../../lib/themes'
import type { PathData, Progress } from '../../types/path'
import type { AudioFile } from '../../types/audio'
import Player from '../player/Player'
import Journal from '../journal/Journal'
import MusePanel from '../muse/MusePanel'
import Synthesis, { type SynthesisData } from '../synthesis/Synthesis'
import BridgeInterstitial from '../bridge/BridgeInterstitial'

interface SessionViewProps {
  pathData: PathData
  progress: Progress
  onLogout: () => void
}

const LISTEN_NAMES: Record<number, string> = {
  1: 'Passive',
  2: 'Focused',
  3: 'Context',
}

interface MuseContent {
  pre_listen_context: string | null
  album_essay: string | null
}

export default function SessionView({ pathData, progress: initialProgress, onLogout }: SessionViewProps) {
  const navigate = useNavigate()
  const [progress, setProgress] = useState<Progress>(initialProgress)
  const [audioFiles, setAudioFiles] = useState<AudioFile[] | null>(null)
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isJournaling, setIsJournaling] = useState(false)
  const [completedListen, setCompletedListen] = useState<number>(1)
  const [isMuse, setIsMuse] = useState(false)

  // Completion flow states
  const [isSynthesis, setIsSynthesis] = useState(initialProgress.current_listen > 3)
  const [eraForked, setEraForked] = useState(initialProgress.current_listen === 0)
  const [goDeeper, setGoDeeper] = useState(false)
  const [isBridge, setIsBridge] = useState(false)

  // Playback resume position — hybrid: DB is authoritative on load; localStorage used within-session
  function resumeKey(albumId: string, listenNumber: number) {
    return `muse-resume:${albumId}:${listenNumber}`
  }

  // On mount, sync DB position into localStorage so any device that refreshes
  // sees the latest position rather than a stale local entry.
  useEffect(() => {
    if (initialProgress.current_track_index != null) {
      localStorage.setItem(
        resumeKey(initialProgress.current_album_id, initialProgress.current_listen),
        JSON.stringify({
          trackIndex: initialProgress.current_track_index,
          time: initialProgress.current_time_seconds ?? 0,
        })
      )
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function getResumePosition(albumId: string, listenNumber: number): { trackIndex: number; time: number } | null {
    const local = localStorage.getItem(resumeKey(albumId, listenNumber))
    if (local) return JSON.parse(local) as { trackIndex: number; time: number }
    return null
  }
  function saveResumePosition(albumId: string, listenNumber: number, trackIndex: number, time: number) {
    localStorage.setItem(resumeKey(albumId, listenNumber), JSON.stringify({ trackIndex, time }))
    apiPost('/api/progress', {
      current_era: progress.current_era,
      current_album_id: progress.current_album_id,
      current_listen: listenNumber,
      current_track_index: trackIndex,
      current_time_seconds: time,
    }).catch(() => {})
  }
  function clearResumePosition(albumId: string, listenNumber: number) {
    localStorage.removeItem(resumeKey(albumId, listenNumber))
    apiPost('/api/progress', {
      current_era: progress.current_era,
      current_album_id: progress.current_album_id,
      current_listen: listenNumber,
      current_track_index: null,
      current_time_seconds: null,
    }).catch(() => {})
  }
  // MUSE content state
  const [museContent, setMuseContent] = useState<MuseContent | null>(null)
  const [museLoading, setMuseLoading] = useState(false)
  const [museError, setMuseError] = useState<string | null>(null)

  const currentEra = pathData.eras.find((e) => e.number === progress.current_era)

  const currentAlbum =
    currentEra?.required_albums.find((a) => a.id === progress.current_album_id) ??
    currentEra?.required_albums[0]

  const nextEra = pathData.eras.find((e) => e.number === (progress.current_era ?? 1) + 1)

  useEffect(() => {
    if (!currentAlbum) return
    setAudioFiles(null)
    setArtworkUrl(null)
    apiGet<AudioFile[]>(`/api/audio/${currentAlbum.id}`)
      .then(setAudioFiles)
      .catch(() => setAudioFiles([]))
    apiGet<{ artwork_url: string | null }>(`/api/audio/${currentAlbum.id}?artwork=1`)
      .then((d) => setArtworkUrl(d.artwork_url))
      .catch(() => {})
  }, [currentAlbum?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load or generate MUSE pre-listen content for the current album
  useEffect(() => {
    if (!currentAlbum) return
    setMuseContent(null)
    setMuseError(null)
    setMuseLoading(true)

    apiGet<MuseContent>(`/api/muse-content/${currentAlbum.id}`)
      .then((data) => {
        if (data.pre_listen_context) {
          setMuseContent(data)
          setMuseLoading(false)
        } else {
          return apiPost<MuseContent>(`/api/muse-content/${currentAlbum.id}`, {})
            .then((generated) => {
              setMuseContent(generated)
              setMuseLoading(false)
            })
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err)
              if (msg.includes('LLM not configured')) {
                setMuseError('configure')
              } else {
                setMuseError(msg)
              }
              setMuseLoading(false)
            })
        }
      })
      .catch(() => {
        setMuseError('failed')
        setMuseLoading(false)
      })
  }, [currentAlbum?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAlbumComplete(synthesisData: SynthesisData | null) {
    if (!currentAlbum || !currentEra) return

    if (synthesisData) {
      try {
        await apiPost(`/api/journals/${currentAlbum.id}`, {
          listen_number: 0,
          raw_content: JSON.stringify(synthesisData),
        })
      } catch {
        // Synthesis save failed — don't block completion
      }
    }

    const completedAlbumId = currentAlbum.id
    const albumIdx = currentEra.required_albums.findIndex((a) => a.id === currentAlbum.id)
    const nextAlbum = currentEra.required_albums[albumIdx + 1]

    if (nextAlbum) {
      const newProgress: Progress = {
        ...progress,
        current_album_id: nextAlbum.id,
        current_listen: 1,
      }
      try {
        await apiPost('/api/progress', {
          current_era: newProgress.current_era,
          current_album_id: newProgress.current_album_id,
          current_listen: 1,
          completed_album_id: completedAlbumId,
        })
      } catch {
        // Progress save failed — keep local state consistent
      }
      setProgress(newProgress)
      setIsSynthesis(false)
    } else {
      // All required albums in this era are done
      try {
        await apiPost('/api/progress', {
          current_era: progress.current_era,
          current_album_id: progress.current_album_id,
          current_listen: 0,
          completed_album_id: completedAlbumId,
        })
      } catch {
        // Progress save failed
      }
      setProgress((prev) => ({ ...prev, current_listen: 0 }))
      setIsSynthesis(false)
      setEraForked(true)
    }
  }

  async function handleEraAdvance() {
    if (!nextEra) return
    const firstAlbum = nextEra.required_albums[0]
    const newProgress: Progress = {
      ...progress,
      current_era: nextEra.number,
      current_album_id: firstAlbum.id,
      current_listen: 1,
    }
    try {
      await apiPost('/api/progress', {
        current_era: newProgress.current_era,
        current_album_id: newProgress.current_album_id,
        current_listen: 1,
      })
    } catch {
      // Progress save failed
    }
    setProgress(newProgress)
    applyEraTheme(newProgress.current_era)
    setIsBridge(false)
    setEraForked(false)
    setGoDeeper(false)
  }

  if (!currentEra || !currentAlbum) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-[#999999] text-sm">Era not found in path data.</p>
      </div>
    )
  }

  // ── Player: full-screen while listening ─────────────────────────────────────
  if (isListening && audioFiles && audioFiles.length > 0) {
    const resumePos = getResumePosition(currentAlbum.id, progress.current_listen)
    return (
      <>
        <Player
          tracks={audioFiles}
          albumTitle={currentAlbum.title}
          albumArtist={currentAlbum.artist}
          artworkUrl={artworkUrl ?? undefined}
          listenNumber={progress.current_listen}
          initialTrackIndex={resumePos?.trackIndex}
          initialTime={resumePos?.time}
          onComplete={() => {
            clearResumePosition(currentAlbum.id, progress.current_listen)
            setIsListening(false)
            setCompletedListen(progress.current_listen)
            setIsJournaling(true)
          }}
          onExit={(trackIndex, time) => {
            saveResumePosition(currentAlbum.id, progress.current_listen, trackIndex, time)
            setIsListening(false)
          }}
          onAutoSave={(trackIndex, time) => {
            saveResumePosition(currentAlbum.id, progress.current_listen, trackIndex, time)
          }}
          onOpenMuse={() => setIsMuse(true)}
        />
        {isMuse && (
          <MusePanel albumId={currentAlbum.id} onClose={() => setIsMuse(false)} />
        )}
      </>
    )
  }

  // ── Journal: full-screen after a listen completes ───────────────────────────
  if (isJournaling) {
    return (
      <Journal
        albumId={currentAlbum.id}
        albumTitle={currentAlbum.title}
        albumArtist={currentAlbum.artist}
        listenNumber={completedListen}
        onSubmit={async () => {
          const nextListen = completedListen + 1
          const newProgress: Progress = { ...progress, current_listen: nextListen }
          try {
            await apiPost('/api/progress', {
              current_era: newProgress.current_era,
              current_album_id: newProgress.current_album_id,
              current_listen: newProgress.current_listen,
            })
          } catch {
            // Progress update failed — keep local state consistent anyway
          }
          setProgress(newProgress)
          setIsJournaling(false)
          if (completedListen === 3) {
            setIsSynthesis(true)
          }
        }}
        onExit={() => setIsJournaling(false)}
      />
    )
  }

  // ── Synthesis: full-screen after listen 3 journal ───────────────────────────
  if (isSynthesis) {
    return (
      <Synthesis
        albumTitle={currentAlbum.title}
        albumArtist={currentAlbum.artist}
        onComplete={handleAlbumComplete}
      />
    )
  }

  // ── Bridge Interstitial: full-screen between eras ───────────────────────────
  if (isBridge && nextEra) {
    return (
      <BridgeInterstitial
        currentEraName={currentEra.name}
        currentEraNumber={currentEra.number}
        nextEraName={nextEra.name}
        nextEraNumber={nextEra.number}
        bridgeText={currentEra.era_bridge_to_next ?? ''}
        onContinue={handleEraAdvance}
      />
    )
  }

  // ── Main Path view ──────────────────────────────────────────────────────────
  const listenName = LISTEN_NAMES[progress.current_listen] ?? 'Passive'
  const hasAudio = audioFiles !== null && audioFiles.length > 0
  const audioLoading = audioFiles === null
  const canListen = progress.current_listen >= 1 && progress.current_listen <= 3

  // ── Era Complete Fork ───────────────────────────────────────────────────────
  if (eraForked) {
    return (
      <div className="min-h-screen bg-white text-[#111111] flex flex-col max-w-lg mx-auto">

        <header className="flex items-center justify-between px-8 pt-8 pb-2">
          <span className="font-sans font-bold tracking-[0.15em] text-sm text-[#111111] uppercase">MUSE</span>
          <span className="text-[#888888] text-xs tracking-[0.25em] uppercase">
            Era {currentEra.number}
          </span>
        </header>

        <div className="px-8 pt-8 pb-8 border-b border-[#e8e8e0]">
          <p className="text-[#888888] text-xs tracking-[0.25em] uppercase mb-1">
            Era {currentEra.number} Complete
          </p>
          <p className="font-serif text-lg leading-tight" style={{ color: 'var(--era-accent)' }}>{currentEra.name}</p>
          <p className="text-[#666666] text-sm leading-relaxed mt-3">
            You've completed all three required albums. What's next?
          </p>
        </div>

        {goDeeper ? (
          // Go Deeper album list
          <div className="flex-1 overflow-y-auto px-8 pt-8 pb-8">
            <p className="text-[#666666] text-xs tracking-[0.25em] uppercase mb-4">
              Go Deeper — Era {currentEra.number}: {currentEra.name}
            </p>
            <p className="text-[#5a4a30] text-sm leading-relaxed mb-6">
              These albums extend your time in {currentEra.name}. Listen to as many as you like.
              Return when you're ready to move on.
            </p>
            <div className="space-y-4 mb-8">
              {currentEra.go_deeper_albums.map((album) => (
                <div key={album.id} className="border border-[#e8e8e0] p-4">
                  <p className="text-[#888888] text-xs tracking-[0.2em] uppercase mb-1">{album.artist}</p>
                  <p className="font-serif text-[#111111] text-sm mb-1">{album.title}</p>
                  {album.performer && (
                    <p className="text-[#bbbbbb] text-xs mb-2">{album.performer}</p>
                  )}
                  {album.note && (
                    <p className="text-[#666666] text-xs leading-relaxed italic">{album.note}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setGoDeeper(false)
                  setIsBridge(true)
                }}
                className="w-full py-4 border border-[#111111] text-[#111111] hover:border-[#555555] transition-colors text-xs tracking-[0.35em] uppercase cursor-pointer"
              >
                Continue Journey →
              </button>
              <button
                onClick={() => setGoDeeper(false)}
                className="w-full py-3 text-[#cccccc] hover:text-[#666666] transition-colors text-xs tracking-[0.2em] uppercase"
              >
                ← Back
              </button>
            </div>
          </div>
        ) : (
          // Fork choice
          <div className="flex-1 px-8 pt-8 pb-8 flex flex-col gap-4">
            <button
              onClick={() => setIsBridge(true)}
              className="w-full py-6 border border-[#111111] text-[#111111] hover:border-[#555555] transition-colors text-xs tracking-[0.35em] uppercase cursor-pointer"
            >
              Continue Journey
              {nextEra && (
                <span className="block text-[#666666] text-xs tracking-[0.15em] normal-case mt-2 font-sans">
                  Proceed to Era {nextEra.number}: {nextEra.name}
                </span>
              )}
            </button>
            <button
              onClick={() => setGoDeeper(true)}
              className="w-full py-6 border border-[#e8e8e0] text-[#888888] hover:border-[#111111] transition-colors text-xs tracking-[0.35em] uppercase cursor-pointer"
            >
              Go Deeper
              <span className="block text-[#bbbbbb] text-xs tracking-[0.15em] normal-case mt-2 font-sans">
                Explore more albums from {currentEra.name}
              </span>
            </button>
          </div>
        )}

        {/* ── Bottom Nav ───────────────────────────────────────────────────────── */}
        <div className="mt-auto px-8 py-5 flex justify-between items-center border-t border-[#e8e8e0]">
          <button
            onClick={() => navigate('/settings')}
            className="text-[#cccccc] hover:text-[#888888] transition-colors text-xs tracking-[0.2em] uppercase"
          >
            Settings
          </button>
          <button
            onClick={onLogout}
            className="text-[#cccccc] hover:text-[#888888] transition-colors text-xs tracking-[0.2em] uppercase"
          >
            Log Out
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-white text-[#111111] flex flex-col max-w-lg mx-auto">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between px-8 pt-8 pb-2">
          <span className="font-sans font-bold tracking-[0.15em] text-sm text-[#111111] uppercase">MUSE</span>
          <span className="text-[#888888] text-xs tracking-[0.25em] uppercase">
            Era {currentEra.number}
          </span>
        </header>

        {/* ── Album Art ────────────────────────────────────────────────────────── */}
        <div className="px-8 pt-8 pb-6">
          {artworkUrl ? (
            <img
              src={artworkUrl}
              alt={`${currentAlbum.title} cover`}
              className="w-full aspect-square object-cover"
            />
          ) : (
            <div className="w-full aspect-square bg-[#f5f5f0] flex items-center justify-center">
              <div className="text-center px-8">
                <p className="text-[#bbbbbb] text-xs tracking-[0.2em] uppercase">{currentAlbum.artist}</p>
                <p className="text-[#999999] font-serif text-sm mt-2">{currentAlbum.title}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Album Info ───────────────────────────────────────────────────────── */}
        <div className="px-8 pb-6">
          <p className="text-[#888888] text-xs tracking-[0.2em] uppercase mb-2">
            {currentAlbum.artist}
          </p>
          <h1 className="font-serif text-[#111111] text-3xl leading-tight mb-3">
            {currentAlbum.title}
          </h1>
          <p className="text-[#888888] text-sm">
            {currentAlbum.performer && (
              <>
                {currentAlbum.performer}
                <span className="mx-2 text-[#dddddd]">·</span>
              </>
            )}
            {currentAlbum.year}
          </p>
        </div>

        {/* ── Divider ─────────────────────────────────────────────────────────── */}
        <div className="px-8 pb-6">
          <div className="h-px bg-[#111111]" />
        </div>

        {/* ── Listen + MUSE Context ────────────────────────────────────────────── */}
        <div className="px-8 pb-8">
          {canListen && (
            <p className="font-sans font-bold text-xs tracking-[0.25em] uppercase text-[#111111] mb-4">
              Listen {Math.min(progress.current_listen, 3)} — {listenName}
            </p>
          )}

          {museLoading && (
            <p className="text-[#cccccc] text-sm leading-relaxed">Preparing context…</p>
          )}
          {museError === 'configure' && (
            <p className="text-[#999999] text-sm leading-relaxed">
              Configure your AI provider in{' '}
              <button
                onClick={() => navigate('/settings')}
                className="underline hover:text-[#666666] transition-colors"
              >
                settings
              </button>{' '}
              to get MUSE's introduction to this album before you listen.
            </p>
          )}
          {museError && museError !== 'configure' && (
            <p className="text-[#999999] text-sm leading-relaxed">{museError}</p>
          )}
          {museContent?.pre_listen_context && (
            <div>
              <p className="text-[#444444] text-sm leading-relaxed">
                {museContent.pre_listen_context}
              </p>
              <button
                onClick={() => setIsMuse(true)}
                className="mt-3 text-[#999999] hover:text-[#555555] transition-colors text-xs tracking-[0.2em] uppercase"
              >
                Ask MUSE →
              </button>
            </div>
          )}
        </div>

        {/* ── Primary Action ───────────────────────────────────────────────────── */}
        <div className="px-8 pb-8">
          <button
            onClick={() => setIsListening(true)}
            disabled={!hasAudio || !canListen}
            className={[
              'w-full py-5 text-xs tracking-[0.35em] uppercase font-bold transition-colors',
              hasAudio && canListen
                ? 'bg-[#111111] text-white hover:bg-[#333333] cursor-pointer'
                : 'bg-[#f0f0ec] text-[#cccccc] cursor-not-allowed',
            ].join(' ')}
          >
            Begin
          </button>
          {!hasAudio && (
            <p className="text-center text-[#cccccc] text-xs tracking-[0.1em] mt-3">
              {audioLoading
                ? 'Checking for audio…'
                : (
                  <>
                    No audio uploaded —{' '}
                    <button
                      onClick={() => navigate('/settings')}
                      className="underline hover:text-[#999999] transition-colors"
                    >
                      go to settings
                    </button>
                  </>
                )
              }
            </p>
          )}
        </div>

        {/* ── Bottom Nav ───────────────────────────────────────────────────────── */}
        <div className="mt-auto px-8 py-5 grid grid-cols-3 items-center border-t border-[#e8e8e0]">
          <button
            onClick={() => navigate('/settings')}
            className="justify-self-start text-[#cccccc] hover:text-[#888888] transition-colors text-xs tracking-[0.2em] uppercase"
          >
            Settings
          </button>
          <button
            onClick={() => navigate('/path')}
            className="justify-self-center text-[#cccccc] hover:text-[#888888] transition-colors text-xs tracking-[0.2em] uppercase"
          >
            The Path
          </button>
          <button
            onClick={onLogout}
            className="justify-self-end text-[#cccccc] hover:text-[#888888] transition-colors text-xs tracking-[0.2em] uppercase"
          >
            Log Out
          </button>
        </div>
      </div>

      {/* ── MUSE Panel (overlay) ─────────────────────────────────────────────── */}
      {isMuse && (
        <MusePanel albumId={currentAlbum.id} onClose={() => setIsMuse(false)} />
      )}
    </>
  )
}
