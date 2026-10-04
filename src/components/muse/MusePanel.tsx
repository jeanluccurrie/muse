import { useState, useEffect, useRef } from 'react'
import { apiGet, apiPost } from '../../lib/api'

interface Message {
  id?: number
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

interface Conversation {
  id: number
  album_id: string
  messages: Message[]
}

interface MusePanelProps {
  albumId: string
  onClose: () => void
}

export default function MusePanel({ albumId, onClose }: MusePanelProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setLoading(true)
    apiGet<Conversation>(`/api/conversations?album_id=${encodeURIComponent(albumId)}`)
      .then((conv) => {
        setConversation(conv)
        setLoading(false)
      })
      .catch(() => {
        setError('Could not load conversation.')
        setLoading(false)
      })
  }, [albumId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation?.messages])

  useEffect(() => {
    if (!loading) inputRef.current?.focus()
  }, [loading])

  async function handleSend() {
    if (!input.trim() || sending || !conversation) return

    const userMessage = input.trim()
    setInput('')
    setSending(true)

    // Optimistically add the user message
    setConversation((prev) =>
      prev ? { ...prev, messages: [...prev.messages, { role: 'user', content: userMessage }] } : prev
    )

    try {
      const reply = await apiPost<{ role: 'assistant'; content: string }>(
        `/api/conversations?album_id=${encodeURIComponent(albumId)}`,
        { content: userMessage },
      )
      setConversation((prev) =>
        prev ? { ...prev, messages: [...prev.messages, reply] } : prev
      )
    } catch {
      setError('Failed to send message. Check your AI settings.')
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col max-w-lg mx-auto">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="bg-white border-t border-[#e8e8e0] flex flex-col"
           style={{ height: '70vh' }}>

        {/* Panel Header */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-[#e8e8e0] flex-shrink-0">
          <span className="font-serif tracking-[0.3em] text-sm text-[#111111]">MUSE</span>
          <button
            onClick={onClose}
            className="text-[#dddddd] hover:text-[#999999] transition-colors text-xs tracking-[0.2em] uppercase"
          >
            close
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-8 py-4 space-y-4">
          {loading && (
            <p className="text-[#cccccc] text-xs tracking-[0.15em]">Loading…</p>
          )}

          {error && (
            <p className="text-[#cc4444] text-xs leading-relaxed">{error}</p>
          )}

          {!loading && !error && conversation?.messages.length === 0 && (
            <p className="text-[#bbbbbb] text-sm leading-relaxed italic">
              Ask MUSE anything about this album, this era, or how it connects to everything you've heard.
            </p>
          )}

          {conversation?.messages.map((msg, i) => (
            <div
              key={i}
              className={msg.role === 'user' ? 'text-right' : ''}
            >
              {msg.role === 'assistant' && (
                <p className="text-[#666666] text-xs tracking-[0.2em] uppercase mb-1">MUSE</p>
              )}
              <p
                className={[
                  'text-sm leading-relaxed whitespace-pre-wrap break-words',
                  msg.role === 'user' ? 'text-[#888888]' : 'text-[#333333]',
                ].join(' ')}
              >
                {msg.content}
              </p>
            </div>
          ))}

          {sending && (
            <div>
              <p className="text-[#666666] text-xs tracking-[0.2em] uppercase mb-1">MUSE</p>
              <p className="text-[#cccccc] text-sm tracking-[0.1em]">…</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-8 pt-3 border-t border-[#e8e8e0] flex-shrink-0" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 2rem))' }}>
          <div className="flex gap-3 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask MUSE…"
              rows={2}
              className="flex-1 min-w-0 bg-white border border-[#e8e8e0] focus:border-[#e8e8e0] outline-none resize-none text-[#333333] text-base leading-relaxed px-4 py-3 placeholder-[#cccccc] font-serif"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className={[
                'px-4 py-3 border text-xs tracking-[0.2em] uppercase transition-colors flex-shrink-0',
                input.trim() && !sending
                  ? 'bg-[#111111] border-[#111111] text-white hover:bg-[#333333] cursor-pointer'
                  : 'border-[#e8e8e0] text-[#cccccc] cursor-not-allowed',
              ].join(' ')}
            >
              Send
            </button>
          </div>
          <p className="text-[#e8e8e0] text-xs mt-2">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  )
}
