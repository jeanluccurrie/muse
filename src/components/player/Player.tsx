import { useRef, useState, useEffect } from 'react'
import type { AudioFile } from '../../types/audio'

interface PlayerProps {
  tracks: AudioFile[]
  albumTitle: string
  albumArtist: string
  artworkUrl?: string
  listenNumber: number
  initialTrackIndex?: number | null
  initialTime?: number | null
  onComplete: () => void
  onExit: (trackIndex: number, time: number) => void
  onAutoSave: (trackIndex: number, time: number) => void
  onOpenMuse: () => void
}

const LISTEN_NAMES: Record<number, string> = {
  1: 'Passive',
  2: 'Focused',
  3: 'Context',
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Split a track name into its work/act group and the movement within it.
// Handles "Concerto No.1 in D major: I. Largo", "Concerto No.1 - I. Largo",
// "Concerto No.1, BWV 1046: 1. Allegro", "Concerto No.1, BWV 1046 I. Allegro",
// and "Act I - ..." / "Act II - ..." / "Act III - ..." patterns.
type TrackNameSplit = { group: string; movement: string }

function splitNumbered(name: string): TrackNameSplit | null {
  const act = name.match(/^(Act\s+[IVX]+)\s+[-–—]\s+(.+)$/)
  if (act) return { group: act[1], movement: act[2].trim() }
  // Separator followed by a numbered movement ("I. Largo", "2. Adagio")
  const sep = name.match(/^(.+?)(?:\s*:\s*|\s+[-–—]\s+)((?:[IVX]+|\d{1,2})(?:[.\s].*|$))/)
  if (sep) return { group: sep[1].trim(), movement: sep[2].trim() }
  // No separator (or just a comma) before a Roman-numeral movement
  const bare = name.match(/^(.+?),?\s+([IVX]+\.(?:\s.*|$))/)
  return bare ? { group: bare[1].trim(), movement: bare[2].trim() } : null
}

// Unnumbered movements ("Concerto No.1, BWV 1046: [Allegro]") — only trusted
// as a grouping when another track shares the same prefix.
function splitAtColon(name: string): TrackNameSplit | null {
  const m = name.match(/^(.+?)\s*:\s+(.+)$/)
  return m ? { group: m[1].trim(), movement: m[2].trim() } : null
}

type TrackGroup = {
  label: string
  tracks: { track: AudioFile; originalIndex: number; movement: string | null }[]
}

function groupTracks(tracks: AudioFile[]): TrackGroup[] | null {
  const names = tracks.map((t) => t.track_name)
  const numbered = names.map((name) => (name ? splitNumbered(name) : null))
  const loose = names.map((name, i) => (name && !numbered[i] ? splitAtColon(name) : null))

  const counts = new Map<string, number>()
  ;[...numbered, ...loose].forEach((s) => {
    if (s) counts.set(s.group, (counts.get(s.group) ?? 0) + 1)
  })
  const splits = names.map((_, i) => {
    const l = loose[i]
    return numbered[i] ?? (l && (counts.get(l.group) ?? 0) > 1 ? l : null)
  })
  if (!splits.some((s) => s !== null)) return null

  const groups: TrackGroup[] = []
  let currentGroup: TrackGroup | null = null

  tracks.forEach((track, i) => {
    const split = splits[i]
    const entry = { track, originalIndex: i, movement: split?.movement ?? null }
    if (split && currentGroup?.label === split.group) {
      currentGroup.tracks.push(entry)
    } else {
      currentGroup = { label: split?.group ?? '', tracks: [entry] }
      groups.push(currentGroup)
    }
  })

  return groups
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// Sort tracks by track_number, falling back to alphabetical filename
function sortTracks(tracks: AudioFile[]): AudioFile[] {
  return [...tracks].sort((a, b) => {
    if (a.track_number != null && b.track_number != null) {
      return a.track_number - b.track_number
    }
    if (a.track_number != null) return -1
    if (b.track_number != null) return 1
    return a.filename.localeCompare(b.filename)
  })
}

function TrackRow({
  track,
  index,
  isActive,
  indented = false,
  movement,
}: {
  track: AudioFile
  index: number
  isActive: boolean
  indented?: boolean
  movement?: string | null
}) {
  // Show just the movement when indented under a group header. Movements with
  // no tempo marking are often tagged with empty brackets ("I. []") — drop them.
  const name = (indented && movement) || (track.track_name ?? track.filename)
  const label = name.replace(/\s*[[(]\s*[\])]\s*$/, '') || name

  return (
    <div
      className={[
        'py-2 flex items-center gap-3',
        indented ? 'pl-6 pr-4' : 'px-4',
        isActive ? 'bg-[#f5f5f0]' : '',
      ].join(' ')}
    >
      <span className="text-[#cccccc] text-xs w-5 flex-shrink-0 text-right">{index + 1}</span>
      <span
        className={['text-xs flex-1 truncate', isActive ? 'text-[#111111]' : 'text-[#999999]'].join(' ')}
      >
        {label}
      </span>
      {track.duration_seconds != null && (
        <span className="text-[#cccccc] text-xs flex-shrink-0">{formatTime(track.duration_seconds)}</span>
      )}
    </div>
  )
}

export default function Player({
  tracks,
  albumTitle,
  albumArtist,
  artworkUrl,
  listenNumber,
  initialTrackIndex,
  initialTime,
  onComplete,
  onExit,
  onAutoSave,
  onOpenMuse,
}: PlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const sortedTracks = sortTracks(tracks)

  const [currentTrackIndex, setCurrentTrackIndex] = useState(initialTrackIndex ?? 0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const pendingSeekRef = useRef<number | null>(initialTime ?? null)

  const [scrolledDown, setScrolledDown] = useState(false)

  const currentTrack = sortedTracks[currentTrackIndex]
  const listenName = LISTEN_NAMES[listenNumber] ?? 'Passive'

  // Load and (optionally) play the new track whenever the index changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return
    audio.src = currentTrack.blob_url
    audio.load()
    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false))
    }
    // Update lock screen / Bluetooth "now playing" metadata
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.track_name ?? currentTrack.filename,
        artist: albumArtist,
        album: albumTitle,
        artwork: artworkUrl ? [{ src: artworkUrl, sizes: '512x512' }] : [],
      })
    }
    // isPlaying intentionally excluded — we only want to re-run when the track changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrackIndex, currentTrack?.blob_url])

  // Auto-save position every 30s while playing
  useEffect(() => {
    const id = setInterval(() => {
      if (isPlaying) {
        onAutoSave(currentTrackIndex, audioRef.current?.currentTime ?? 0)
      }
    }, 30_000)
    return () => clearInterval(id)
  }, [isPlaying, currentTrackIndex, onAutoSave])

  // After metadata loads the file is seekable — apply any pending resume position
  function handleLoadedMetadata() {
    const audio = audioRef.current
    if (!audio || pendingSeekRef.current === null) return
    audio.currentTime = pendingSeekRef.current
    pendingSeekRef.current = null
  }

  function handlePlayPause() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch(() => setIsPlaying(false))
    }
  }

  // Sync MediaSession play/pause handlers with the audio element
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', () => {
      audioRef.current?.play().catch(() => {})
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      audioRef.current?.pause()
    })
    return () => {
      if (!('mediaSession' in navigator)) return
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
    }
  }, [])

  function handleEnded() {
    if (currentTrackIndex < sortedTracks.length - 1) {
      setCurrentTrackIndex((i) => i + 1)
      setIsPlaying(true)
    } else {
      setIsPlaying(false)
      onComplete()
    }
  }

  useEffect(() => {
    function onScroll() {
      setScrolledDown(window.scrollY > 120)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="min-h-screen bg-white text-[#111111] flex flex-col max-w-lg mx-auto">

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={(e) => console.error('Audio error:', (e.target as HTMLAudioElement).error)}
      />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-8 pt-8 pb-2">
        <span className="font-serif tracking-[0.3em] text-base text-[#111111]">MUSE</span>
        <div className="flex items-center gap-4">
          {!scrolledDown && (
            <button
              onClick={onOpenMuse}
              className="text-[#cccccc] hover:text-[#666666] transition-colors text-xs tracking-[0.2em] uppercase"
            >
              MUSE
            </button>
          )}
          <button
            onClick={() => onExit(currentTrackIndex, audioRef.current?.currentTime ?? 0)}
            className="text-[#dddddd] hover:text-[#999999] transition-colors text-xs tracking-[0.2em] uppercase"
          >
            pause &amp; exit
          </button>
        </div>
      </header>

      {/* ── Listen Indicator ──────────────────────────────────────────────── */}
      <div className="px-8 pt-8 pb-2">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[#e8e8e0]" />
          <p className="text-[#888888] text-xs tracking-[0.25em] uppercase whitespace-nowrap">
            Listen {listenNumber} of 3 — {listenName}
          </p>
          <div className="h-px flex-1 bg-[#e8e8e0]" />
        </div>
      </div>

      {/* ── Album Art ─────────────────────────────────────────────────────── */}
      <div className="px-8 pt-4 pb-4">
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt={`${albumTitle} cover`}
            className="w-full aspect-square object-cover"
          />
        ) : (
          <div className="w-full aspect-square bg-[#f5f5f0] border border-[#e8e8e0] flex items-center justify-center">
            <div className="text-center px-8">
              <p className="text-[#888888] text-xs tracking-[0.2em] uppercase">{albumArtist}</p>
              <p className="text-[#666666] font-serif text-sm mt-2">{albumTitle}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Track Info ────────────────────────────────────────────────────── */}
      <div className="px-8 pb-4">
        <p className="text-[#666666] text-xs tracking-[0.15em] uppercase mb-1">
          Track {currentTrackIndex + 1} of {sortedTracks.length}
        </p>
        <p className="text-[#111111] font-serif text-lg leading-tight">
          {currentTrack?.track_name ?? currentTrack?.filename ?? '—'}
        </p>
      </div>

      {/* ── Progress Bar (view-only during required listens) ──────────────── */}
      <div className="px-8 pb-8">
        <div className="h-px bg-[#e8e8e0] w-full relative overflow-hidden">
          <div
            className="h-px bg-[#111111] absolute top-0 left-0"
            style={{ width: `${progress}%`, transition: 'width 1s linear' }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[#cccccc] text-xs">{formatTime(currentTime)}</span>
          <span className="text-[#cccccc] text-xs">{duration > 0 ? formatTime(duration) : '--:--'}</span>
        </div>
      </div>

      {/* ── Play / Pause ──────────────────────────────────────────────────── */}
      <div className="px-8 pb-8 flex justify-center">
        <button
          onClick={handlePlayPause}
          className="w-20 h-20 border border-[#e8e8e0] flex items-center justify-center hover:border-[#555555] transition-colors"
        >
          <span className="text-[#111111] text-xs tracking-[0.2em] uppercase">
            {isPlaying ? 'Pause' : 'Play'}
          </span>
        </button>
      </div>

      {/* ── Track List (view-only) ─────────────────────────────────────────── */}
      <div className="px-8" style={{ paddingBottom: 'max(5rem, calc(env(safe-area-inset-bottom, 0px) + 5rem))' }}>
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-[#bbbbbb] text-xs tracking-[0.2em] uppercase">Tracks</p>
          {(() => {
            const total = sortedTracks.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0)
            const label = formatDuration(total)
            return label ? (
              <p className="text-[#cccccc] text-xs">{label}</p>
            ) : null
          })()}
        </div>
        {(() => {
          const groups = groupTracks(sortedTracks)
          if (!groups) {
            // Flat list — no grouping detected
            return (
              <div className="border border-[#e8e8e0] divide-y divide-[#e8e8e0]">
                {sortedTracks.map((track, i) => (
                  <TrackRow key={track.id} track={track} index={i} isActive={i === currentTrackIndex} />
                ))}
              </div>
            )
          }
          // Grouped list — concerto headers with movements
          return (
            <div className="border border-[#e8e8e0]">
              {groups.map((group, groupIndex) => (
                <div key={groupIndex} className="divide-y divide-[#e8e8e0]">
                  {group.label && (
                    <div className="px-4 py-2 bg-[#fafafa9a]">
                      <p className="text-[#aaaaaa] text-xs tracking-[0.15em] uppercase truncate">
                        {group.label}
                      </p>
                    </div>
                  )}
                  {group.tracks.map(({ track, originalIndex, movement }) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      index={originalIndex}
                      isActive={originalIndex === currentTrackIndex}
                      indented={!!group.label}
                      movement={movement}
                    />
                  ))}
                </div>
              ))}
            </div>
          )
        })()}
      </div>

      {/* ── Floating MUSE button (only when scrolled past header) ────────── */}
      <div
        className={`fixed bottom-0 left-0 right-0 flex justify-center pointer-events-none transition-opacity duration-200 ${scrolledDown ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}
      >
        <div className="max-w-lg w-full px-12 flex justify-end pointer-events-none">
          <button
            onClick={onOpenMuse}
            className="pointer-events-auto bg-white/60 border border-[#e8e8e0]/60 shadow-sm px-6 py-3.5 text-xs tracking-[0.2em] uppercase text-[#bbbbbb] hover:text-[#666666] hover:border-[#cccccc] transition-colors backdrop-blur-sm"
          >
            MUSE
          </button>
        </div>
      </div>
    </div>
  )
}
