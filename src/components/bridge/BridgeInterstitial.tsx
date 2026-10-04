import { useRef, useState, useEffect } from 'react'

interface BridgeInterstitialProps {
  currentEraName: string
  currentEraNumber: number
  nextEraName: string
  nextEraNumber: number
  bridgeText: string
  onContinue: () => Promise<void>
}

export default function BridgeInterstitial({
  currentEraName,
  currentEraNumber,
  nextEraName,
  nextEraNumber,
  bridgeText,
  onContinue,
}: BridgeInterstitialProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [continuing, setContinuing] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function handleScroll() {
      const el = scrollRef.current
      if (!el) return
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40
      if (nearBottom) setScrolled(true)
    }

    el.addEventListener('scroll', handleScroll)
    handleScroll()
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  async function handleContinue() {
    setContinuing(true)
    await onContinue()
    setContinuing(false)
  }

  return (
    <div className="min-h-screen bg-white text-[#111111] flex flex-col max-w-lg mx-auto">

      {/* Fixed header */}
      <header className="flex items-center justify-between px-8 pt-8 pb-8 flex-shrink-0">
        <span className="font-serif tracking-[0.3em] text-base text-[#111111]">MUSE</span>
        <p className="text-[#cccccc] text-xs tracking-[0.2em] uppercase">
          Era {currentEraNumber} → Era {nextEraNumber}
        </p>
      </header>

      {/* Scrollable passage */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-8 pb-8"
      >
        <div className="border-b border-[#e8e8e0] pb-8 mb-8">
          <p className="text-[#bbbbbb] text-xs tracking-[0.25em] uppercase mb-2">Leaving</p>
          <p className="font-serif text-[#888888] text-lg">{currentEraName}</p>
        </div>

        <div className="mb-12">
          <p className="text-[#111111] text-base leading-loose font-serif whitespace-pre-wrap">
            {bridgeText}
          </p>
        </div>

        <div className="border-t border-[#e8e8e0] pt-8 mb-10">
          <p className="text-[#bbbbbb] text-xs tracking-[0.25em] uppercase mb-2">Entering</p>
          <p className="font-serif text-[#111111] text-lg">{nextEraName}</p>
        </div>

        {/* Continue button appears after scrolling */}
        <div
          className={[
            'transition-opacity duration-500',
            scrolled ? 'opacity-100' : 'opacity-0 pointer-events-none',
          ].join(' ')}
        >
          <button
            onClick={handleContinue}
            disabled={continuing || !scrolled}
            className={[
              'w-full py-4 border text-xs tracking-[0.35em] uppercase transition-colors mb-8',
              !continuing
                ? 'bg-[#111111] border-[#111111] text-white hover:bg-[#333333] cursor-pointer'
                : 'border-[#e8e8e0] text-[#cccccc] cursor-not-allowed',
            ].join(' ')}
          >
            {continuing ? 'Beginning…' : `Begin Era ${nextEraNumber} — ${nextEraName}`}
          </button>
        </div>
      </div>

      {/* Scroll hint when not yet scrolled */}
      {!scrolled && (
        <div className="flex-shrink-0 px-8 pb-8 text-center">
          <p className="text-[#e8e8e0] text-xs tracking-[0.15em]">Scroll to read the full passage</p>
        </div>
      )}
    </div>
  )
}
