import { useState } from 'react'

export interface SynthesisData {
  what_album_does: string
  standout_tracks: string
  vocabulary: string
  context_significance: string
  similar_next_steps: string
}

interface SynthesisProps {
  albumTitle: string
  albumArtist: string
  onComplete: (data: SynthesisData | null) => Promise<void>
}

const FIELDS: { key: keyof SynthesisData; label: string; placeholder: string }[] = [
  {
    key: 'what_album_does',
    label: 'What is this album doing?',
    placeholder: "In a sentence or two — what is this album's project?",
  },
  {
    key: 'standout_tracks',
    label: 'Standout tracks',
    placeholder: 'Which tracks stayed with you, and why?',
  },
  {
    key: 'vocabulary',
    label: 'Vocabulary, motifs, techniques noticed',
    placeholder: 'Any musical language or devices you heard…',
  },
  {
    key: 'context_significance',
    label: 'Context and significance',
    placeholder: 'Where does this fit in the larger story?',
  },
  {
    key: 'similar_next_steps',
    label: 'If I liked this, try…',
    placeholder: 'Related works, artists, or directions worth exploring',
  },
]

export default function Synthesis({ albumTitle, albumArtist, onComplete }: SynthesisProps) {
  const [data, setData] = useState<SynthesisData>({
    what_album_does: '',
    standout_tracks: '',
    vocabulary: '',
    context_significance: '',
    similar_next_steps: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const hasAny = Object.values(data).some((v) => v.trim())

  async function handleComplete() {
    setSubmitting(true)
    await onComplete(hasAny ? data : null)
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-white text-[#111111] flex flex-col max-w-lg mx-auto overflow-y-auto">

      {/* Header */}
      <header className="flex items-center justify-between px-8 pt-8 pb-2 flex-shrink-0">
        <span className="font-serif tracking-[0.3em] text-base text-[#111111]">MUSE</span>
      </header>

      {/* Title */}
      <div className="px-8 pt-8 pb-8 border-b border-[#e8e8e0] flex-shrink-0">
        <p className="text-[#888888] text-xs tracking-[0.25em] uppercase mb-1">
          Post-Listen Synthesis
        </p>
        <p className="text-[#888888] text-xs tracking-[0.2em] uppercase mb-1">{albumArtist}</p>
        <h1 className="font-serif text-[#111111] text-xl leading-tight mb-3">{albumTitle}</h1>
        <p className="text-[#666666] text-sm leading-relaxed">
          Three listens complete. These fields are optional — fill in what's useful, skip the rest.
          Your reflections become part of your record.
        </p>
      </div>

      {/* Synthesis fields */}
      <div className="px-8 pt-8 pb-4 flex-1 space-y-6">
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="block text-[#666666] text-xs tracking-[0.2em] uppercase mb-2">
              {label}
            </label>
            <textarea
              value={data[key]}
              onChange={(e) => setData((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={placeholder}
              rows={3}
              className="w-full bg-white border border-[#e8e8e0] focus:border-[#e8e8e0] outline-none resize-none text-[#333333] text-base leading-relaxed px-4 py-3 placeholder-[#cccccc] font-serif"
            />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="px-8 pb-10 pt-4 flex-shrink-0 space-y-3">
        <button
          onClick={handleComplete}
          disabled={submitting}
          className={[
            'w-full py-4 border text-xs tracking-[0.35em] uppercase transition-colors',
            !submitting
              ? 'bg-[#111111] border-[#111111] text-white hover:bg-[#333333] cursor-pointer'
              : 'border-[#e8e8e0] text-[#cccccc] cursor-not-allowed',
          ].join(' ')}
        >
          {submitting ? 'Saving…' : 'Complete Album'}
        </button>
        <p className="text-center text-[#cccccc] text-xs tracking-[0.1em]">
          All fields are optional — click Complete Album at any time
        </p>
      </div>
    </div>
  )
}
