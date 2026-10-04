import { useRef, useState, useEffect } from 'react'
import { apiGet, apiPatch } from '../../lib/api'
import type { PathData, JournalEntry } from '../../types/path'
import type { AudioFile } from '../../types/audio'
import MusePanel from '../muse/MusePanel'

interface AlbumDetailProps {
  albumId: string
  pathData: PathData
  isLocked?: boolean
  onBack: () => void
}

interface MuseContent {
  pre_listen_context: string | null
  album_essay: string | null
}

interface SynthesisData {
  what_album_does?: string
  standout_tracks?: string
  vocabulary?: string
  context_significance?: string
  similar_next_steps?: string
}

const LISTEN_NAMES: Record<number, string> = {
  1: 'Passive',
  2: 'Focused',
  3: 'Context',
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '--:--'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function sortTracks(tracks: AudioFile[]): AudioFile[] {
  return [...tracks].sort((a, b) => {
    if (a.track_number != null && b.track_number != null) return a.track_number - b.track_number
    if (a.track_number != null) return -1
    if (b.track_number != null) return 1
    return a.filename.localeCompare(b.filename)
  })
}

export default function AlbumDetail({ albumId, pathData, isLocked = false, onBack }: AlbumDetailProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [tracks, setTracks] = useState<AudioFile[] | null>(null)
  const [journals, setJournals] = useState<JournalEntry[] | null>(null)
  const [museContent, setMuseContent] = useState<MuseContent | null>(null)
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null)
  const [isMuse, setIsMuse] = useState(false)
  const [nowPlaying, setNowPlaying] = useState<AudioFile | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [journalOpen, setJournalOpen] = useState<Record<number, boolean>>({})
  const [cleaningUp, setCleaningUp] = useState<Record<number, boolean>>({})

  // Find album and era from path data
  let foundAlbum: import('../../types/path').RequiredAlbum | null = null
  let foundEra: import('../../types/path').Era | null = null
  for (const era of pathData.eras) {
    const a = era.required_albums.find((x) => x.id === albumId)
    if (a) {
      foundAlbum = a
      foundEra = era
      break
    }
  }

  useEffect(() => {
    Promise.all([
      apiGet<AudioFile[]>(`/api/audio/${albumId}`).catch(() => []),
      apiGet<JournalEntry[]>(`/api/journals/${albumId}`).catch(() => []),
      apiGet<MuseContent>(`/api/muse-content/${albumId}`).catch(() => null),
      apiGet<{ artwork_url: string | null }>(`/api/audio/${albumId}?artwork=1`).catch(() => null),
    ]).then(([a, j, m, art]) => {
      setTracks(a)
      setJournals(j)
      setMuseContent(m)
      setArtworkUrl(art?.artwork_url ?? null)
    })
  }, [albumId])

  function playTrack(track: AudioFile) {
    const audio = audioRef.current
    if (!audio) return
    if (nowPlaying?.id === track.id && isPlaying) {
      audio.pause()
      return
    }
    setNowPlaying(track)
    audio.src = track.blob_url
    audio.load()
    audio.play().catch(() => setIsPlaying(false))
    // Update lock screen metadata
    if ('mediaSession' in navigator && foundAlbum) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.track_name ?? track.filename,
        artist: foundAlbum.artist,
        album: foundAlbum.title,
        artwork: artworkUrl ? [{ src: artworkUrl, sizes: '512x512' }] : [],
      })
      navigator.mediaSession.setActionHandler('play', () => audio.play().catch(() => {}))
      navigator.mediaSession.setActionHandler('pause', () => audio.pause())
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        const idx = sortedTracks.findIndex((t) => t.id === track.id)
        if (idx !== -1 && idx < sortedTracks.length - 1) playTrack(sortedTracks[idx + 1])
      })
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        const idx = sortedTracks.findIndex((t) => t.id === track.id)
        if (idx > 0) playTrack(sortedTracks[idx - 1])
      })
    }
  }

  async function handleCleanup(entry: JournalEntry) {
    if (cleaningUp[entry.listen_number]) return
    setCleaningUp((prev) => ({ ...prev, [entry.listen_number]: true }))
    try {
      const updated = await apiPatch<JournalEntry>(`/api/journals/${albumId}`, {
        listen_number: entry.listen_number,
      })
      setJournals((prev) =>
        (prev ?? []).map((j) => (j.listen_number === entry.listen_number ? updated : j))
      )
    } catch {
      // silently ignore — user can retry
    } finally {
      setCleaningUp((prev) => ({ ...prev, [entry.listen_number]: false }))
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = parseFloat(e.target.value)
  }

  const sortedTracks = tracks ? sortTracks(tracks) : []
  const regularJournals = (journals ?? []).filter((j) => j.listen_number >= 1)
  const synthEntry = (journals ?? []).find((j) => j.listen_number === 0)
  const synthData: SynthesisData | null = synthEntry
    ? (() => { try { return JSON.parse(synthEntry.raw_content) } catch { return null } })()
    : null

  if (!foundAlbum || !foundEra) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-[#999999] text-sm">Album not found in path data.</p>
      </div>
    )
  }

  if (isLocked) {
    return (
      <div className="min-h-screen bg-white text-[#111111] flex flex-col max-w-lg mx-auto">
        <header className="flex items-center justify-between px-8 pt-8 pb-2 flex-shrink-0">
          <span className="font-serif tracking-[0.3em] text-base text-[#111111]">MUSE</span>
          <button
            onClick={onBack}
            className="text-[#cccccc] hover:text-[#666666] transition-colors text-xs tracking-[0.2em] uppercase"
          >
            ← Return to Path
          </button>
        </header>
        <div className="px-8 pt-8 pb-8">
          <p className="text-[#bbbbbb] text-xs tracking-[0.25em] uppercase mb-1">
            Era {foundEra.number} · {foundEra.name}
          </p>
          <p className="text-[#888888] text-xs tracking-[0.2em] uppercase mb-1">
            {foundAlbum.artist}
          </p>
          <h1 className="font-serif text-[#111111] text-2xl leading-tight mb-2">
            {foundAlbum.title}
          </h1>
          <p className="text-[#666666] text-sm mb-8">
            {foundAlbum.performer && (
              <>
                {foundAlbum.performer}
                <span className="mx-2 text-[#cccccc]">·</span>
              </>
            )}
            {foundAlbum.year}
          </p>
          <p className="text-[#cccccc] text-xs tracking-[0.15em] uppercase">
            Complete album sessions to unlock.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false)
          // Auto-advance to next track
          if (nowPlaying && sortedTracks.length > 0) {
            const idx = sortedTracks.findIndex((t) => t.id === nowPlaying.id)
            if (idx !== -1 && idx < sortedTracks.length - 1) {
              playTrack(sortedTracks[idx + 1])
            }
          }
        }}
        onError={() => setIsPlaying(false)}
      />

      <div
        className="min-h-screen bg-white text-[#111111] flex flex-col max-w-lg mx-auto"
        style={{ paddingBottom: nowPlaying ? '88px' : 0 }}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-8 pt-8 pb-2 flex-shrink-0">
          <span className="font-serif tracking-[0.3em] text-base text-[#111111]">MUSE</span>
          <button
            onClick={onBack}
            className="text-[#cccccc] hover:text-[#666666] transition-colors text-xs tracking-[0.2em] uppercase"
          >
            ← Return to Path
          </button>
        </header>

        {/* Album Art */}
        {artworkUrl && (
          <div className="px-8 pt-8 pb-0">
            <img
              src={artworkUrl}
              alt={`${foundAlbum.title} cover`}
              className="w-full aspect-square object-cover"
            />
          </div>
        )}

        {/* Album Info */}
        <div className={`px-8 ${artworkUrl ? 'pt-6' : 'pt-8'} pb-8 border-b border-[#e8e8e0]`}>
          <p className="text-[#bbbbbb] text-xs tracking-[0.25em] uppercase mb-1">
            Era {foundEra.number} · {foundEra.name}
          </p>
          <p className="text-[#888888] text-xs tracking-[0.2em] uppercase mb-1">
            {foundAlbum.artist}
          </p>
          <h1 className="font-serif text-[#111111] text-2xl leading-tight mb-2">
            {foundAlbum.title}
          </h1>
          <p className="text-[#666666] text-sm">
            {foundAlbum.performer && (
              <>
                {foundAlbum.performer}
                <span className="mx-2 text-[#cccccc]">·</span>
              </>
            )}
            {foundAlbum.year}
          </p>
        </div>

        {/* MUSE button */}
        <div className="px-8 pt-8 pb-8 border-b border-[#e8e8e0]">
          <button
            onClick={() => setIsMuse(true)}
            className="w-full py-3 border border-[#e8e8e0] text-[#666666] hover:border-[#111111] hover:text-[#888888] transition-colors text-xs tracking-[0.3em] uppercase"
          >
            Ask MUSE About This Album
          </button>
        </div>

        {/* Tracklist */}
        {tracks === null ? (
          <div className="px-8 py-5">
            <p className="text-[#cccccc] text-xs tracking-[0.15em]">Loading tracks…</p>
          </div>
        ) : sortedTracks.length > 0 ? (
          <div className="px-8 pt-8 pb-8 border-b border-[#e8e8e0]">
            <p className="text-[#bbbbbb] text-xs tracking-[0.25em] uppercase mb-3">Tracks</p>
            <div className="border border-[#e8e8e0] divide-y divide-[#e8e8e0]">
              {sortedTracks.map((track, i) => {
                const isActive = nowPlaying?.id === track.id
                return (
                  <button
                    key={track.id}
                    onClick={() => playTrack(track)}
                    className={[
                      'w-full px-4 py-3 flex items-center gap-3 text-left transition-colors',
                      isActive ? 'bg-[#f5f5f0]' : 'hover:bg-[#f5f5f0]',
                    ].join(' ')}
                  >
                    <span className="text-[#cccccc] text-xs w-5 flex-shrink-0 text-right">
                      {isActive && isPlaying ? '▶' : i + 1}
                    </span>
                    <span
                      className={[
                        'text-xs flex-1 truncate font-serif',
                        isActive ? 'text-[#111111]' : 'text-[#888888]',
                      ].join(' ')}
                    >
                      {track.track_name ?? track.filename}
                    </span>
                    {track.duration_seconds != null && (
                      <span className="text-[#cccccc] text-xs flex-shrink-0">
                        {formatTime(track.duration_seconds)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="px-8 py-5 border-b border-[#e8e8e0]">
            <p className="text-[#e8e8e0] text-xs tracking-[0.15em]">No audio uploaded for this album.</p>
          </div>
        )}

        {/* MUSE Essay */}
        {museContent?.album_essay && (
          <div className="px-8 pt-8 pb-8 border-b border-[#e8e8e0]">
            <p className="text-[#bbbbbb] text-xs tracking-[0.25em] uppercase mb-3">MUSE Essay</p>
            <p className="text-[#111111] text-sm leading-relaxed font-serif">
              {museContent.album_essay}
            </p>
          </div>
        )}

        {/* Journal Entries */}
        {regularJournals.length > 0 && (
          <div className="px-8 pt-8 pb-8 border-b border-[#e8e8e0]">
            <p className="text-[#bbbbbb] text-xs tracking-[0.25em] uppercase mb-3">Your Journal</p>
            <div className="space-y-2">
              {regularJournals.map((entry) => {
                const isOpen = journalOpen[entry.listen_number] ?? false
                const label = LISTEN_NAMES[entry.listen_number] ?? `Listen ${entry.listen_number}`
                return (
                  <div key={entry.id} className="border border-[#e8e8e0]">
                    <button
                      onClick={() =>
                        setJournalOpen((prev) => ({
                          ...prev,
                          [entry.listen_number]: !prev[entry.listen_number],
                        }))
                      }
                      className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#f5f5f0] transition-colors"
                    >
                      <span className="text-[#666666] text-xs tracking-[0.2em] uppercase">
                        Listen {entry.listen_number} — {label}
                      </span>
                      <span className="text-[#cccccc] text-xs">{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4">
                        <p className="text-[#888888] text-sm leading-relaxed font-serif whitespace-pre-wrap">
                          {entry.cleaned_content ?? entry.raw_content}
                        </p>
                        {entry.cleaned_content && (
                          <p className="text-[#cccccc] text-xs mt-2 tracking-[0.1em] uppercase">
                            AI-cleaned · original preserved
                          </p>
                        )}
                        {!entry.cleaned_content && (
                          <button
                            onClick={() => handleCleanup(entry)}
                            disabled={!!cleaningUp[entry.listen_number]}
                            className="mt-3 text-[#cccccc] hover:text-[#666666] text-xs tracking-[0.2em] uppercase transition-colors disabled:opacity-50"
                          >
                            {cleaningUp[entry.listen_number] ? 'Cleaning up…' : 'Clean up with AI'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Synthesis */}
        {synthData && (
          <div className="px-8 pt-8 pb-8 border-b border-[#e8e8e0]">
            <p className="text-[#bbbbbb] text-xs tracking-[0.25em] uppercase mb-3">
              Post-Listen Synthesis
            </p>
            <div className="space-y-4">
              {synthData.what_album_does && (
                <div>
                  <p className="text-[#cccccc] text-xs tracking-[0.15em] uppercase mb-1">
                    What this album does
                  </p>
                  <p className="text-[#888888] text-sm leading-relaxed font-serif">
                    {synthData.what_album_does}
                  </p>
                </div>
              )}
              {synthData.standout_tracks && (
                <div>
                  <p className="text-[#cccccc] text-xs tracking-[0.15em] uppercase mb-1">
                    Standout tracks
                  </p>
                  <p className="text-[#888888] text-sm leading-relaxed font-serif">
                    {synthData.standout_tracks}
                  </p>
                </div>
              )}
              {synthData.vocabulary && (
                <div>
                  <p className="text-[#cccccc] text-xs tracking-[0.15em] uppercase mb-1">
                    Vocabulary noticed
                  </p>
                  <p className="text-[#888888] text-sm leading-relaxed font-serif">
                    {synthData.vocabulary}
                  </p>
                </div>
              )}
              {synthData.context_significance && (
                <div>
                  <p className="text-[#cccccc] text-xs tracking-[0.15em] uppercase mb-1">
                    Context &amp; significance
                  </p>
                  <p className="text-[#888888] text-sm leading-relaxed font-serif">
                    {synthData.context_significance}
                  </p>
                </div>
              )}
              {synthData.similar_next_steps && (
                <div>
                  <p className="text-[#cccccc] text-xs tracking-[0.15em] uppercase mb-1">
                    If I liked this, try…
                  </p>
                  <p className="text-[#888888] text-sm leading-relaxed font-serif">
                    {synthData.similar_next_steps}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="pb-8" />
      </div>

      {/* Sticky player bar */}
      {nowPlaying && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#f0f0ea] border-t border-[#e8e8e0] px-8 py-3 max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => {
                const audio = audioRef.current
                if (!audio) return
                if (isPlaying) audio.pause()
                else audio.play().catch(() => {})
              }}
              className="text-[#111111] text-xs tracking-[0.2em] uppercase w-12 flex-shrink-0"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <p className="text-[#888888] text-xs font-serif truncate flex-1">
              {nowPlaying.track_name ?? nowPlaying.filename}
            </p>
            <span className="text-[#cccccc] text-xs flex-shrink-0">
              {formatTime(currentTime)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.5}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-px appearance-none bg-[#e8e8e0] cursor-pointer"
            style={{ accentColor: '#111111' }}
          />
        </div>
      )}

      {isMuse && (
        <MusePanel albumId={albumId} onClose={() => setIsMuse(false)} />
      )}
    </>
  )
}
