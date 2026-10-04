import type { PathData } from '../../types/path'

interface NetworkMapProps {
  pathData: PathData
  completedAlbums: string[]
  onAlbumClick: (albumId: string) => void
}

// SVG coordinate constants
const VB_W = 300
const ERA_W = 72
const GRAPH_X = ERA_W + 8
const NODE_R = 12
const NODE_SPACE = 40
const ROW_H = 68
const PAD_Y = 10

function nodeX(idx: number): number {
  return GRAPH_X + NODE_R + idx * NODE_SPACE
}

function eraY(eraIdx: number): number {
  return PAD_Y + eraIdx * ROW_H + ROW_H / 2
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export default function NetworkMap({ pathData, completedAlbums, onAlbumClick }: NetworkMapProps) {
  const completedSet = new Set(completedAlbums)
  const totalH = PAD_Y * 2 + pathData.eras.length * ROW_H

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${totalH}`}
      width="100%"
      style={{ display: 'block' }}
      aria-label="Music history network map"
    >
      {pathData.eras.map((era, eraIdx) => {
        const cy = eraY(eraIdx)
        const eraAlbumIds = era.required_albums.map((a) => a.id)
        const completedInEra = eraAlbumIds.filter((id) => completedSet.has(id))
        const isEraComplete = completedInEra.length === era.required_albums.length
        const hasAnyComplete = completedInEra.length > 0

        const labelColor = isEraComplete
          ? '#111111'
          : hasAnyComplete
            ? '#888888'
            : '#cccccc'

        // Within-era horizontal connections
        const withinLines = era.required_albums.slice(0, -1).map((_, i) => {
          const fromDone = completedSet.has(era.required_albums[i].id)
          const toDone = completedSet.has(era.required_albums[i + 1].id)
          return (
            <line
              key={`w-${eraIdx}-${i}`}
              x1={nodeX(i) + NODE_R}
              y1={cy}
              x2={nodeX(i + 1) - NODE_R}
              y2={cy}
              stroke={fromDone && toDone ? '#111111' : '#e0e0d8'}
              strokeWidth="0.8"
            />
          )
        })

        // Between-era diagonal connection (last album of this era → first of next)
        let betweenLine: React.ReactNode = null
        if (eraIdx < pathData.eras.length - 1) {
          const nextEra = pathData.eras[eraIdx + 1]
          const lastId = era.required_albums[era.required_albums.length - 1].id
          const firstNextId = nextEra.required_albums[0].id
          const done = completedSet.has(lastId) && completedSet.has(firstNextId)
          betweenLine = (
            <line
              key={`b-${eraIdx}`}
              x1={nodeX(era.required_albums.length - 1)}
              y1={cy + NODE_R}
              x2={nodeX(0)}
              y2={eraY(eraIdx + 1) - NODE_R}
              stroke={done ? '#111111' : '#e0e0d8'}
              strokeWidth="0.8"
            />
          )
        }

        return (
          <g key={era.id}>
            {/* Era label */}
            <text
              x={0}
              y={cy - 5}
              fill={labelColor}
              fontSize="8"
              fontFamily="serif"
            >
              Era {era.number}
            </text>
            <text
              x={0}
              y={cy + 6}
              fill={labelColor}
              fontSize="6"
              fontFamily="sans-serif"
              letterSpacing="0.2"
            >
              {truncate(era.name, 16)}
            </text>

            {withinLines}
            {betweenLine}

            {/* Album nodes */}
            {era.required_albums.map((album, albumIdx) => {
              const isCompleted = completedSet.has(album.id)
              const fill = isCompleted ? '#111111' : '#f0f0ea'
              const stroke = isCompleted ? '#555555' : '#d8d8d0'

              return (
                <circle
                  key={album.id}
                  cx={nodeX(albumIdx)}
                  cy={cy}
                  r={NODE_R}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth="0.8"
                  onClick={() => onAlbumClick(album.id)}
                  style={{ cursor: 'pointer' }}
                />
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}
