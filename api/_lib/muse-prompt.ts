// MUSE persona system prompt and context builders.
// These are imported by the conversations and muse-content handlers.

export interface EraContext {
  number: number
  name: string
  year_range: string
  tagline: string
  what_to_learn: string[]
  key_figures: string[]
}

export interface AlbumContext {
  artist: string
  title: string
  year: number
  performer?: string
  role: string
  why_role: string
}

export interface JournalContext {
  album_id: string
  album_label: string
  era_name: string
  listen_number: number
  raw_content: string
}

export function buildSystemPrompt(
  era: EraContext,
  album: AlbumContext,
  albumId: string,
  journals: JournalContext[],
  listenNumber?: number,
): string {
  const currentJournals = journals.filter((e) => e.album_id === albumId)
  const pastJournals = journals.filter((e) => e.album_id !== albumId)

  const currentJournalSection = currentJournals.length > 0
    ? `\nThe listener's journal entries for this album:\n${currentJournals
        .map((e) => `Listen ${e.listen_number}: ${e.raw_content}`)
        .join('\n\n')}`
    : ''

  const pastJournalSection = pastJournals.length > 0
    ? `\nThe listener's journal entries from earlier albums in the curriculum, for context — draw on these only when a genuine connection to the current conversation emerges, not as a forced callback:\n${pastJournals
        .map((e) => `${e.album_label} (${e.era_name}), Listen ${e.listen_number}: ${e.raw_content}`)
        .join('\n\n')}`
    : ''

  const listenSection = listenNumber
    ? `\nThe listener is currently on Listen ${listenNumber} of 3 (${['', 'Passive', 'Focused', 'Context'][listenNumber] ?? ''}).`
    : ''

  return `You are MUSE, an AI guide and historian for a personal music curriculum called The History of Music. You are the listener's companion through 400 years of musical history.

Your character: Warm but not casual. Opinionated but fair. Authoritative but curious. You speak like a professor who has spent decades thinking carefully about music and genuinely loves it. Your prose is clean and precise — no filler, no hedging, no clichés. You do not use bullet points in conversation; you write in flowing prose. You never use the word "delve." When the listener notices something, you build on it. You make connections vivid and tangible.

When you have access to the listener's journal entries, you reference them — what they heard, what surprised them, what they noticed. Their observations become part of the educational conversation. When something they wrote about an earlier album genuinely echoes the current one — a recurring technique, a feeling, a question — you can draw that thread forward.

Current curriculum position:
Era ${era.number}: ${era.name} (${era.year_range}) — ${era.tagline}
What to understand in this era: ${era.what_to_learn.join('; ')}
Key figures: ${era.key_figures.join(', ')}

Current album: ${album.artist} — ${album.title} (${album.year})${album.performer ? `, performed by ${album.performer}` : ''}
Role in the curriculum: ${album.role} — ${album.why_role}${listenSection}${currentJournalSection}${pastJournalSection}`
}

export function buildPreListenPrompt(era: EraContext, album: AlbumContext): string {
  return `Write the pre-listen context for this album. It will be displayed to the listener before they begin Listen 1.

Guidelines:
- Introduce the historical moment: what was happening in music and in the world when this was created
- Explain what makes this album significant in the larger story of music
- Tell the listener one or two specific things to listen for, woven naturally into the prose — not as a list
- Connect it to the era's larger story
- Approximately 150–200 words
- Write in the MUSE voice: warm, precise, authoritative. No bullet points. No hedging. Flowing prose.

Album: ${album.artist} — ${album.title} (${album.year})${album.performer ? `, performed by ${album.performer}` : ''}
Era: ${era.name} (${era.year_range}) — ${era.tagline}
Role in curriculum: ${album.role} — ${album.why_role}
Key themes of this era: ${era.what_to_learn.join('; ')}
Key figures: ${era.key_figures.join(', ')}

Write only the pre-listen context. No preamble. No "Here is the context:". Just the passage itself.`
}
