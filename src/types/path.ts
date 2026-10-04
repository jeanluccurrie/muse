export interface MetadataMatchHints {
  artist_aliases: string[]
  title_aliases: string[]
}

export interface RequiredAlbum {
  id: string
  role: 'gateway' | 'deep-dive' | 'bridge-forward'
  artist: string
  title: string
  performer?: string
  year: number
  why_role: string
  metadata_match_hints?: MetadataMatchHints
}

export interface GoDeeperAlbum {
  id: string
  artist: string
  title: string
  performer?: string
  note: string
}

export interface Era {
  id: string
  number: number
  name: string
  year_range: string
  tagline: string
  what_to_learn: string[]
  key_figures: string[]
  required_albums: RequiredAlbum[]
  go_deeper_albums: GoDeeperAlbum[]
  era_bridge_to_next: string
}

export interface PathData {
  id: string
  name: string
  description: string
  version: string
  eras: Era[]
  connections: Array<{ from_album_id: string; to_album_id: string; type: string }>
}

export interface Progress {
  path_id: string
  current_era: number
  current_album_id: string
  current_listen: number
  completed_albums: string[]
  current_track_index?: number | null
  current_time_seconds?: number | null
}

export interface JournalEntry {
  id: number
  listen_number: number
  raw_content: string
  cleaned_content: string | null
  created_at: string
  updated_at: string
}
