interface EraTheme {
  accent: string
  accentDim: string
  accentSubtle: string
}

const ERA_THEMES: Record<number, EraTheme> = {
  1:  { accent: '#8a6a30', accentDim: '#6a5020', accentSubtle: '#f5ede0' }, // Early Baroque — amber gold
  2:  { accent: '#9a8010', accentDim: '#786008', accentSubtle: '#f8f4d8' }, // Late Baroque — dark gold
  3:  { accent: '#4a7a48', accentDim: '#305830', accentSubtle: '#e8f2e8' }, // Classical — forest green
  4:  { accent: '#a85840', accentDim: '#803828', accentSubtle: '#f5e8e0' }, // Early Romantic — terracotta
  5:  { accent: '#7848a8', accentDim: '#582888', accentSubtle: '#f0e8f8' }, // High Romantic — violet
  6:  { accent: '#287878', accentDim: '#185858', accentSubtle: '#e0f4f4' }, // Impressionist — teal
  7:  { accent: '#686058', accentDim: '#484038', accentSubtle: '#f0ece8' }, // Early Modern — warm gray
  8:  { accent: '#286898', accentDim: '#184878', accentSubtle: '#e0ecf8' }, // Mid-20th Century — steel blue
  9:  { accent: '#508830', accentDim: '#386018', accentSubtle: '#eaf4e0' }, // Late 20th Century — olive green
}

const DEFAULT: EraTheme = ERA_THEMES[1]

export function getEraTheme(eraNumber: number): EraTheme {
  return ERA_THEMES[eraNumber] ?? DEFAULT
}

export function applyEraTheme(eraNumber: number): void {
  const theme = getEraTheme(eraNumber)
  const root = document.documentElement
  root.style.setProperty('--era-accent', theme.accent)
  root.style.setProperty('--era-accent-dim', theme.accentDim)
  root.style.setProperty('--era-accent-subtle', theme.accentSubtle)
}
