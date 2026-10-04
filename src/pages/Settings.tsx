import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { upload } from '@vercel/blob/client'
import { apiGet, apiPost, apiPatch } from '../lib/api'
import { getToken } from '../lib/auth' // used for Blob upload Authorization header
import type { PathData } from '../types/path'
import type { AudioFile } from '../types/audio'

interface LLMSettings {
  llm_provider: string | null
  llm_api_key_set: boolean
}

function getAudioDuration(src: File | string): Promise<number | null> {
  return new Promise((resolve) => {
    const url = src instanceof File ? URL.createObjectURL(src) : src
    const isBlob = src instanceof File
    const audio = new Audio(url)
    audio.addEventListener('loadedmetadata', () => {
      if (isBlob) URL.revokeObjectURL(url)
      resolve(isFinite(audio.duration) ? Math.round(audio.duration) : null)
    })
    audio.addEventListener('error', () => {
      if (isBlob) URL.revokeObjectURL(url)
      resolve(null)
    })
  })
}

interface AlbumOption {
  id: string
  artist: string
  title: string
  eraName: string
}

type FileStatus = 'pending' | 'uploading' | 'done' | 'error'

interface FileEntry {
  file: File
  trackName: string
  trackNumber: number | null
  format: string
  status: FileStatus
  errorMsg?: string
}

// Extract a clean track name and number from a filename.
// Handles common patterns: "01 - Title.flac", "1. Title.mp3", "Track 01.mp3", "Title.flac"
// Future improvement: replace filename parsing with embedded tag reading (e.g. music-metadata-browser) so upload works regardless of filename convention.
function parseFilename(filename: string): { trackName: string; trackNumber: number | null } {
  const base = filename.replace(/\.[^/.]+$/, '') // strip extension

  // "1-01 - Title", "2-07 - Title" (disc-track format → disc * 100 + track)
  const discTrack = base.match(/^(\d)-(\d{2})\s*-\s+(.+)/)
  if (discTrack) {
    const trackNumber = parseInt(discTrack[1], 10) * 100 + parseInt(discTrack[2], 10)
    return { trackNumber, trackName: discTrack[3].trim() }
  }

  // "01 - Title", "01. Title", "1 - Title", "1. Title"
  const numbered = base.match(/^(\d{1,3})\s*[-.]?\s+(.+)/)
  if (numbered) {
    return { trackNumber: parseInt(numbered[1], 10), trackName: numbered[2].trim() }
  }

  // "Track 01", "Track 1"
  const trackPrefix = base.match(/^[Tt]rack\s+(\d+)\s*(.*)/)
  if (trackPrefix) {
    return {
      trackNumber: parseInt(trackPrefix[1], 10),
      trackName: trackPrefix[2].trim() || base,
    }
  }

  return { trackName: base, trackNumber: null }
}

export default function Settings() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [albums, setAlbums] = useState<AlbumOption[]>([])
  const [selectedAlbumId, setSelectedAlbumId] = useState('')
  const [existingTracks, setExistingTracks] = useState<AudioFile[]>([])
  const [files, setFiles] = useState<FileEntry[]>([])
  const [uploading, setUploading] = useState(false)
  const [loadingPath, setLoadingPath] = useState(true)

  // Album art state
  const artInputRef = useRef<HTMLInputElement>(null)
  const [existingArtUrl, setExistingArtUrl] = useState<string | null>(null)
  const [artFile, setArtFile] = useState<File | null>(null)
  const [artPreviewUrl, setArtPreviewUrl] = useState<string | null>(null)
  const [artStatus, setArtStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')

  // LLM settings state
  const [llmSettings, setLLMSettings] = useState<LLMSettings | null>(null)
  const [llmProvider, setLLMProvider] = useState('anthropic')
  const [llmApiKey, setLLMApiKey] = useState('')
  const [llmSaving, setLLMSaving] = useState(false)
  const [llmSaved, setLLMSaved] = useState(false)
  const [llmError, setLLMError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Load LLM settings on mount
  useEffect(() => {
    apiGet<LLMSettings>('/api/settings')
      .then((data) => {
        setLLMSettings(data)
        if (data.llm_provider) setLLMProvider(data.llm_provider)
      })
      .catch(() => {})
  }, [])

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      const data = await apiGet<Record<string, unknown>>('/api/settings?action=export')
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `muse-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silently ignore — user sees no change
    } finally {
      setExporting(false)
    }
  }

  async function handleSaveLLM() {
    if (!llmProvider || llmSaving) return
    setLLMSaving(true)
    setLLMError(null)
    setLLMSaved(false)
    try {
      const body: Record<string, string> = { llm_provider: llmProvider }
      if (llmApiKey) body.llm_api_key = llmApiKey
      const data = await apiPost<LLMSettings>('/api/settings', body)
      setLLMSettings(data)
      setLLMApiKey('')
      setLLMSaved(true)
    } catch {
      setLLMError('Failed to save. Check your connection and try again.')
    } finally {
      setLLMSaving(false)
    }
  }

  // Load path data to populate album list
  useEffect(() => {
    apiGet<PathData>('/api/paths/history-of-music')
      .then((data) => {
        const list: AlbumOption[] = []
        for (const era of data.eras) {
          for (const album of era.required_albums) {
            list.push({ id: album.id, artist: album.artist, title: album.title, eraName: era.name })
          }
          for (const album of era.go_deeper_albums) {
            list.push({ id: album.id, artist: album.artist, title: album.title, eraName: era.name })
          }
        }
        setAlbums(list)
      })
      .catch(() => {/* silently ignore — path not loaded yet */})
      .finally(() => setLoadingPath(false))
  }, [])

  // Load existing tracks and artwork whenever selected album changes
  useEffect(() => {
    if (!selectedAlbumId) {
      setExistingTracks([])
      setExistingArtUrl(null)
      setArtFile(null)
      setArtPreviewUrl(null)
      setArtStatus('idle')
      return
    }
    apiGet<AudioFile[]>(`/api/audio/${selectedAlbumId}`)
      .then(async (tracks) => {
        setExistingTracks(tracks)
        // Backfill duration_seconds for any tracks that are missing it
        const missing = tracks.filter((t) => t.duration_seconds == null)
        if (missing.length === 0) return
        const updated = await Promise.all(
          missing.map(async (t) => {
            const duration = await getAudioDuration(t.blob_url)
            if (duration == null) return null
            await apiPatch(`/api/audio/${selectedAlbumId}`, { id: t.id, durationSeconds: duration }).catch(() => {})
            return { ...t, duration_seconds: duration }
          })
        )
        setExistingTracks((prev) =>
          prev.map((t) => {
            const u = updated.find((u) => u?.id === t.id)
            return u ?? t
          })
        )
      })
      .catch(() => setExistingTracks([]))
    apiGet<{ artwork_url: string | null }>(`/api/audio/${selectedAlbumId}?artwork=1`)
      .then((d) => setExistingArtUrl(d.artwork_url))
      .catch(() => setExistingArtUrl(null))
  }, [selectedAlbumId])

  function handleAlbumChange(albumId: string) {
    setSelectedAlbumId(albumId)
    setFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (artInputRef.current) artInputRef.current.value = ''
    setArtFile(null)
    if (artPreviewUrl) URL.revokeObjectURL(artPreviewUrl)
    setArtPreviewUrl(null)
    setArtStatus('idle')
  }

  function handleArtSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (artPreviewUrl) URL.revokeObjectURL(artPreviewUrl)
    setArtFile(file)
    setArtPreviewUrl(file ? URL.createObjectURL(file) : null)
    setArtStatus('idle')
  }

  async function handleArtUpload() {
    if (!artFile || !selectedAlbumId || artStatus === 'uploading') return
    setArtStatus('uploading')
    const token = getToken()
    try {
      const blob = await upload(
        `artwork/${selectedAlbumId}/${artFile.name}`,
        artFile,
        {
          access: 'public',
          handleUploadUrl: '/api/audio/upload-url',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      )
      await apiPost<{ ok: boolean }>('/api/audio/match', {
        albumId: selectedAlbumId,
        blobUrl: blob.url,
        type: 'art',
      })
      setExistingArtUrl(blob.url)
      setArtFile(null)
      if (artPreviewUrl) URL.revokeObjectURL(artPreviewUrl)
      setArtPreviewUrl(null)
      if (artInputRef.current) artInputRef.current.value = ''
      setArtStatus('done')
    } catch {
      setArtStatus('error')
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    if (!selected.length) return

    const entries: FileEntry[] = selected
      .sort((a, b) => a.name.localeCompare(b.name)) // alphabetical sort as default ordering
      .map((file) => {
        const { trackName, trackNumber } = parseFilename(file.name)
        const format = file.name.split('.').pop()?.toLowerCase() ?? ''
        return { file, trackName, trackNumber, format, status: 'pending' }
      })

    setFiles(entries)
  }

  async function handleUpload() {
    if (!selectedAlbumId || !files.length || uploading) return

    setUploading(true)
    const token = getToken()

    for (let i = 0; i < files.length; i++) {
      const entry = files[i]

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'uploading' } : f))
      )

      try {
        // Upload directly to Vercel Blob (public store)
        const blob = await upload(
          `audio/${selectedAlbumId}/${entry.file.name}`,
          entry.file,
          {
            access: 'public',
            handleUploadUrl: '/api/audio/upload-url',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        )

        // Record the match in the database
        await apiPost<{ ok: boolean }>('/api/audio/match', {
          albumId: selectedAlbumId,
          blobUrl: blob.url,
          filename: entry.file.name,
          trackNumber: entry.trackNumber,
          trackName: entry.trackName,
          durationSeconds: await getAudioDuration(entry.file),
          format: entry.format,
        })

        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: 'done' } : f))
        )
      } catch (err) {
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? { ...f, status: 'error', errorMsg: err instanceof Error ? err.message : 'Upload failed' }
              : f
          )
        )
      }
    }

    // Refresh track list
    apiGet<AudioFile[]>(`/api/audio/${selectedAlbumId}`)
      .then(setExistingTracks)
      .catch(() => {})

    setUploading(false)
  }

  const allDone = files.length > 0 && files.every((f) => f.status === 'done')
  const canUpload =
    !!selectedAlbumId &&
    files.length > 0 &&
    files.every((f) => f.status === 'pending') &&
    !uploading

  const selectedAlbum = albums.find((a) => a.id === selectedAlbumId)

  return (
    <div className="min-h-screen bg-white text-[#111111] flex flex-col max-w-lg mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-8 pt-8 pb-2">
        <button
          onClick={() => navigate('/')}
          className="text-[#666666] text-xs tracking-[0.2em] uppercase hover:text-[#888888] transition-colors"
        >
          Return to Session
        </button>
        <span className="font-sans font-bold tracking-[0.15em] text-sm text-[#111111] uppercase">Settings</span>
        <div className="w-12" />
      </header>

      <div className="px-8 pt-8 pb-16 space-y-10">

        {/* ── AI / MUSE Section ─────────────────────────────────────────────── */}
        <section>
          <p className="text-[#888888] text-xs tracking-[0.25em] uppercase mb-6">AI Provider</p>

          {llmSettings?.llm_api_key_set && (
            <div className="mb-5 border border-[#e8e8e0] p-4">
              <p className="text-[#4a8a4a] text-xs tracking-[0.15em] uppercase">
                Connected — {llmSettings.llm_provider}
              </p>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-[#666666] text-xs tracking-[0.15em] uppercase mb-2">
              Provider
            </label>
            <select
              value={llmProvider}
              onChange={(e) => setLLMProvider(e.target.value)}
              className="w-full bg-[#f5f5f0] border border-[#e8e8e0] text-[#111111] text-sm px-3 py-2"
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (GPT-4o)</option>
            </select>
          </div>

          <div className="mb-5">
            <label className="block text-[#666666] text-xs tracking-[0.15em] uppercase mb-2">
              API Key {llmSettings?.llm_api_key_set && '(leave blank to keep current)'}
            </label>
            <input
              type="password"
              value={llmApiKey}
              onChange={(e) => setLLMApiKey(e.target.value)}
              placeholder={llmSettings?.llm_api_key_set ? '••••••••••••••••' : 'sk-…'}
              className="w-full bg-[#f5f5f0] border border-[#e8e8e0] text-[#111111] text-sm px-3 py-2 outline-none focus:border-[#111111]"
            />
            <p className="text-[#cccccc] text-xs mt-1">
              Your key is encrypted before storage and never sent to the browser.
            </p>
          </div>

          {llmError && (
            <p className="text-[#cc4444] text-xs mb-3">{llmError}</p>
          )}
          {llmSaved && (
            <p className="text-[#4a8a4a] text-xs mb-3 tracking-[0.15em] uppercase">Saved</p>
          )}

          <button
            onClick={handleSaveLLM}
            disabled={llmSaving}
            className={[
              'w-full py-4 border text-xs tracking-[0.35em] uppercase transition-colors',
              !llmSaving
                ? 'bg-[#111111] border-[#111111] text-white hover:bg-[#333333] cursor-pointer'
                : 'border-[#e8e8e0] text-[#cccccc] cursor-not-allowed',
            ].join(' ')}
          >
            {llmSaving ? 'Saving…' : 'Save AI Settings'}
          </button>
        </section>

        {/* ── Audio Upload Section ───────────────────────────────────────────── */}
        <section>
          <p className="text-[#888888] text-xs tracking-[0.25em] uppercase mb-6">Audio</p>

          {/* Album selector */}
          <div className="mb-6">
            <label className="block text-[#666666] text-xs tracking-[0.15em] uppercase mb-2">
              Album
            </label>
            {loadingPath ? (
              <p className="text-[#cccccc] text-xs">Loading albums…</p>
            ) : (
              <select
                value={selectedAlbumId}
                onChange={(e) => handleAlbumChange(e.target.value)}
                className="w-full bg-[#f5f5f0] border border-[#e8e8e0] text-[#111111] text-sm px-3 py-2"
              >
                <option value="" className="text-[#999999]">Select an album…</option>
                {albums.map((a) => (
                  <option key={a.id} value={a.id} className="text-[#111111]">
                    {a.artist} — {a.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Existing uploads */}
          {existingTracks.length > 0 && (
            <div className="mb-6 border border-[#e8e8e0] p-4">
              <p className="text-[#666666] text-xs tracking-[0.15em] uppercase mb-3">
                {existingTracks.length} track{existingTracks.length !== 1 ? 's' : ''} already uploaded
              </p>
              <div className="space-y-1">
                {existingTracks.map((t) => (
                  <p key={t.id} className="text-[#999999] text-xs">
                    {t.track_number != null ? `${t.track_number}. ` : ''}
                    {t.track_name ?? t.filename}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Album art */}
          {selectedAlbumId && (
            <div className="mb-6">
              <p className="text-[#666666] text-xs tracking-[0.15em] uppercase mb-3">Album Art</p>
              {existingArtUrl && (
                <div className="mb-3">
                  <img
                    src={existingArtUrl}
                    alt="Album art"
                    className="w-24 h-24 object-cover border border-[#e8e8e0]"
                  />
                  <p className="text-[#cccccc] text-xs mt-1">Replace by uploading a new image.</p>
                </div>
              )}
              {artPreviewUrl && (
                <div className="mb-3">
                  <img
                    src={artPreviewUrl}
                    alt="Preview"
                    className="w-24 h-24 object-cover border border-[#111111]"
                  />
                </div>
              )}
              <input
                ref={artInputRef}
                type="file"
                accept="image/*"
                onChange={handleArtSelect}
                className="w-full text-[#666666] text-xs
                  file:mr-4 file:py-2 file:px-4
                  file:border file:border-[#e8e8e0]
                  file:bg-transparent file:text-[#666666]
                  file:text-xs file:tracking-[0.15em] file:uppercase
                  file:cursor-pointer file:transition-colors
                  file:hover:border-[#888888]"
              />
              {artFile && artStatus !== 'done' && (
                <button
                  onClick={handleArtUpload}
                  disabled={artStatus === 'uploading'}
                  className={[
                    'w-full mt-3 py-3 border text-xs tracking-[0.35em] uppercase transition-colors',
                    artStatus !== 'uploading'
                      ? 'bg-[#111111] border-[#111111] text-white hover:bg-[#333333] cursor-pointer'
                      : 'border-[#e8e8e0] text-[#cccccc] cursor-not-allowed',
                  ].join(' ')}
                >
                  {artStatus === 'uploading' ? 'Uploading…' : 'Upload Art'}
                </button>
              )}
              {artStatus === 'done' && (
                <p className="text-[#4a8a4a] text-xs tracking-[0.2em] uppercase mt-2">Art saved</p>
              )}
              {artStatus === 'error' && (
                <p className="text-[#cc4444] text-xs mt-2">Upload failed — try again.</p>
              )}
            </div>
          )}

          <div className="h-px bg-[#e8e8e0] mb-6" />

          {/* File picker */}
          {selectedAlbumId && (
            <div className="mb-5">
              <label className="block text-[#666666] text-xs tracking-[0.15em] uppercase mb-2">
                Audio Files
                {selectedAlbum && (
                  <span className="ml-2 text-[#bbbbbb] normal-case tracking-normal">
                    — {selectedAlbum.artist}, {selectedAlbum.title}
                  </span>
                )}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="audio/*,.flac,.mp3,.m4a,.aac,.wav,.aiff"
                onChange={handleFileSelect}
                className="w-full text-[#666666] text-xs
                  file:mr-4 file:py-2 file:px-4
                  file:border file:border-[#e8e8e0]
                  file:bg-transparent file:text-[#666666]
                  file:text-xs file:tracking-[0.15em] file:uppercase
                  file:cursor-pointer file:transition-colors
                  file:hover:border-[#888888]"
              />
              <p className="text-[#cccccc] text-xs mt-1">
                Files are sorted alphabetically. Name them with track numbers for correct ordering.
              </p>
            </div>
          )}

          {/* File list with status */}
          {files.length > 0 && (
            <div className="mb-5 border border-[#e8e8e0] divide-y divide-[#e8e8e0]">
              {files.map((entry, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <span className="text-[#cccccc] text-xs w-5 flex-shrink-0 text-right">
                    {entry.trackNumber ?? i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#888888] text-xs truncate">{entry.trackName}</p>
                    <p className="text-[#cccccc] text-xs truncate">{entry.file.name}</p>
                  </div>
                  <div className="flex-shrink-0 text-xs">
                    {entry.status === 'pending' && (
                      <span className="text-[#bbbbbb]">ready</span>
                    )}
                    {entry.status === 'uploading' && (
                      <span className="text-[#888888]">uploading…</span>
                    )}
                    {entry.status === 'done' && (
                      <span className="text-[#4a8a4a]">✓</span>
                    )}
                    {entry.status === 'error' && (
                      <span className="text-[#cc4444]" title={entry.errorMsg}>error</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Upload button */}
          {files.length > 0 && !allDone && (
            <button
              onClick={handleUpload}
              disabled={!canUpload}
              className={[
                'w-full py-4 border text-xs tracking-[0.35em] uppercase transition-colors',
                canUpload
                  ? 'bg-[#111111] border-[#111111] text-white hover:bg-[#333333] cursor-pointer'
                  : 'border-[#e8e8e0] text-[#cccccc] cursor-not-allowed',
              ].join(' ')}
            >
              {uploading ? 'Uploading…' : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
            </button>
          )}

          {/* Upload complete */}
          {allDone && (
            <div className="text-center space-y-3">
              <p className="text-[#4a8a4a] text-xs tracking-[0.2em] uppercase">Upload complete</p>
              <button
                onClick={() => navigate('/')}
                className="text-[#666666] text-xs tracking-[0.2em] uppercase hover:text-[#888888] transition-colors"
              >
                Return to Session →
              </button>
            </div>
          )}
        </section>

        {/* ── Data Export ───────────────────────────────────────────────────────── */}
        <section>
          <p className="text-[#888888] text-xs tracking-[0.25em] uppercase mb-6">Data</p>
          <p className="text-[#999999] text-xs leading-relaxed mb-5">
            Export all your journals, MUSE conversations, and progress as a JSON file.
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className={[
              'w-full py-4 border text-xs tracking-[0.35em] uppercase transition-colors',
              !exporting
                ? 'bg-[#111111] border-[#111111] text-white hover:bg-[#333333] cursor-pointer'
                : 'border-[#e8e8e0] text-[#cccccc] cursor-not-allowed',
            ].join(' ')}
          >
            {exporting ? 'Exporting…' : 'Export All Data'}
          </button>
        </section>

      </div>
    </div>
  )
}
