import { useState, useEffect, useRef } from 'react'
import { apiGet, apiPost } from '../../lib/api'
import type { JournalEntry } from '../../types/path'

interface JournalProps {
  albumId: string
  albumTitle: string
  albumArtist: string
  listenNumber: number
  onSubmit: () => void
  onExit: () => void
}

const LISTEN_PROMPTS: Record<number, string> = {
  1: "What did you notice? Write freely — first impressions, moments that caught your attention, feelings or images that came to mind. There's no wrong answer.",
  2: "You've heard it once. What do you notice on a second listen? Track the structure, the instruments, the recurring motifs. What emerges when you listen with intention?",
  3: "You've heard it twice and now you've heard from MUSE. How does the historical context change what you hear? Where do you sense the era in this music?",
}

const LISTEN_NAMES: Record<number, string> = {
  1: 'Passive',
  2: 'Focused',
  3: 'Context',
}

export default function Journal({
  albumId,
  albumTitle,
  albumArtist,
  listenNumber,
  onSubmit,
  onExit,
}: JournalProps) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const prompt = LISTEN_PROMPTS[listenNumber] ?? LISTEN_PROMPTS[1]
  const listenName = LISTEN_NAMES[listenNumber] ?? 'Passive'

  // Load existing draft on mount
  useEffect(() => {
    apiGet<JournalEntry[]>(`/api/journals/${albumId}`)
      .then((entries) => {
        const existing = entries.find((e) => e.listen_number === listenNumber)
        if (existing?.raw_content) {
          setText(existing.raw_content)
          setSaved(true)
        }
      })
      .catch(() => {})
  }, [albumId, listenNumber])

  async function save(content: string) {
    if (!content.trim()) return
    setSaving(true)
    try {
      await apiPost<JournalEntry>(`/api/journals/${albumId}`, {
        listen_number: listenNumber,
        raw_content: content,
      })
      setSaved(true)
    } catch {
      // Ignore auto-save errors silently
    } finally {
      setSaving(false)
    }
  }

  function handleChange(value: string) {
    setText(value)
    setSaved(false)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) return

    debounceRef.current = setTimeout(() => {
      save(value)
    }, 2000)
  }

  async function handleExit() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (text.trim()) await save(text)
    onExit()
  }

  async function handleSubmit() {
    if (!text.trim() || submitting) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSubmitting(true)
    try {
      await save(text)
      onSubmit()
    } catch {
      setSubmitting(false)
    }
  }

  const canSubmit = text.trim().length > 0 && !submitting

  return (
    <div className="min-h-screen bg-white text-[#111111] flex flex-col max-w-lg mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-8 pt-8 pb-2">
        <span className="font-serif tracking-[0.3em] text-base text-[#111111]">MUSE</span>
        <button
          onClick={handleExit}
          className="text-[#dddddd] hover:text-[#999999] transition-colors text-xs tracking-[0.2em] uppercase"
        >
          save &amp; exit
        </button>
      </header>

      {/* ── Listen Indicator ────────────────────────────────────────────────── */}
      <div className="px-8 pt-8 pb-2">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[#e8e8e0]" />
          <p className="text-[#888888] text-xs tracking-[0.25em] uppercase whitespace-nowrap">
            Listen {listenNumber} of 3 — {listenName}
          </p>
          <div className="h-px flex-1 bg-[#e8e8e0]" />
        </div>
      </div>

      {/* ── Album Info ───────────────────────────────────────────────────────── */}
      <div className="px-8 pt-4 pb-8">
        <p className="text-[#666666] text-xs tracking-[0.2em] uppercase mb-1">{albumArtist}</p>
        <p className="font-serif text-[#111111] text-lg leading-tight">{albumTitle}</p>
      </div>

      {/* ── Prompt ──────────────────────────────────────────────────────────── */}
      <div className="px-8 pb-8">
        <div className="border border-[#e8e8e0] p-5">
          <p className="text-[#666666] text-xs tracking-[0.25em] uppercase mb-3">Reflect</p>
          <p className="text-[#888888] text-sm leading-relaxed">{prompt}</p>
        </div>
      </div>

      {/* ── Writing Area ─────────────────────────────────────────────────────── */}
      <div className="px-8 pb-2 flex-1">
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Begin writing…"
          autoFocus
          className="w-full h-48 bg-white border border-[#e8e8e0] focus:border-[#e8e8e0] outline-none resize-none text-[#333333] text-base leading-relaxed p-4 placeholder-[#cccccc] font-serif"
        />
        <p className="text-[#e8e8e0] text-xs mt-2 tracking-[0.1em] h-4">
          {saving ? 'Saving…' : saved ? 'Saved' : ''}
        </p>
      </div>

      {/* ── Continue ─────────────────────────────────────────────────────────── */}
      <div className="px-8 pb-8">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={[
            'w-full py-4 border text-xs tracking-[0.35em] uppercase transition-colors',
            canSubmit
              ? 'bg-[#111111] border-[#111111] text-white hover:bg-[#333333] cursor-pointer'
              : 'border-[#e8e8e0] text-[#cccccc] cursor-not-allowed',
          ].join(' ')}
        >
          {submitting ? 'Saving…' : 'Continue'}
        </button>
        {!text.trim() && (
          <p className="text-center text-[#cccccc] text-xs tracking-[0.1em] mt-3">
            Write something to continue.
          </p>
        )}
      </div>
    </div>
  )
}
