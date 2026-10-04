export interface AudioFile {
  id: number
  album_id: string
  blob_url: string
  filename: string
  track_number: number | null
  track_name: string | null
  duration_seconds: number | null
  format: string | null
}
