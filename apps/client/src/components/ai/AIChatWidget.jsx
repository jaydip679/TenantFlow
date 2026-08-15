import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Bot, Minimize2, Maximize2, Loader2 } from 'lucide-react';
import { useSelector } from 'react-redux';

/**
 * AIChatWidget
 *
 * Props:
 *   defaultOpen  {boolean}  — start open (default false)
 *   embedded     {boolean}  — render inline (no floating position)
 *   onClose      {function} — called when user closes the widget
 */
export default function AIChatWidget({ defaultOpen = false, embedded = false, onClose }) {
  const accessToken = useSelector((s) => s.auth.accessToken);
  const user        = useSelector((s) => s.auth.user);

  const [open,      setOpen]      = useState(defaultOpen || embedded);
  const [minimised, setMinimised] = useState(false);
  const [messages,  setMessages]  = useState([
    {
      role: 'assistant',
      content: "Hi! I'm your TenantFlow AI billing assistant. Ask me anything about your subscription, invoices, seat usage, or how to upgrade your plan.",
    },
  ]);
  const [input,     setInput]    = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef(null);
  const abortRef  = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open && !minimised) inputRef.current?.focus();
  }, [open, minimised]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');

    const userMsg = { role: 'user', content: text };
    const assistantMsg = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    abortRef.current = new AbortController();

    try {
      const response = await fetch('/api/v1/ai/chat', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${accessToken}`,
        },
        body:   JSON.stringify({ message: text }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${response.status}`);
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try {
              const parsed = JSON.parse(raw);
              const delta  = parsed.choices?.[0]?.delta?.content ?? parsed.content ?? '';
              if (delta) {
                setMessages((prev) => {
                  const copy = [...prev];
                  copy[copy.length - 1] = {
                    ...copy[copy.length - 1],
                    content: copy[copy.length - 1].content + delta,
                  };
                  return copy;
                });
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role:    'assistant',
          content: `⚠ ${err.message || 'Something went wrong. Please try again.'}`,
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleClose = () => {
    abortRef.current?.abort();
    setOpen(false);
    if (onClose) onClose();
  };

  /* ── Floating trigger button (when closed) ── */
  if (!open && !embedded) {
    return (
      <button
        id="ai-chat-trigger"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-[52px] h-[52px] rounded-full bg-gradient-to-br from-primary to-blue-500 border-none shadow-[0_4px_20px_rgba(108,99,255,0.4)] flex items-center justify-center cursor-pointer z-[999] transition-transform duration-200 hover:scale-110"
        title="Open AI billing assistant"
      >
        <Bot size={22} className="text-white" />
      </button>
    );
  }

  const wrapperClass = embedded 
    ? "flex flex-col h-full min-h-[360px] rounded-2xl border border-border bg-surface overflow-hidden" 
    : `fixed bottom-6 right-6 w-[360px] rounded-2xl bg-surface/95 border border-primary/30 shadow-[0_16px_48px_rgba(0,0,0,0.7),0_0_0_1px_rgba(108,99,255,0.15)] backdrop-blur-xl flex flex-col z-[999] overflow-hidden transition-all duration-300 ${minimised ? 'h-[52px]' : 'h-[520px]'}`;

  return (
    <div id="ai-chat-widget" className={wrapperClass}>
      {/* Header */}
      <div 
        className={`flex items-center justify-between px-4 py-3 shrink-0 transition-colors ${minimised ? 'border-b-0' : 'border-b border-border'} ${embedded ? 'cursor-default' : 'cursor-pointer hover:bg-surface-secondary/50'} bg-gradient-to-br from-primary/20 to-blue-500/10`}
        onClick={!embedded ? () => setMinimised((m) => !m) : undefined}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center">
            <Bot size={16} className="text-white" />
          </div>
          <div>
            <p className="m-0 font-bold text-[13px] text-text-primary">TenantFlow AI</p>
            <p className="m-0 text-[11px] text-primary">Billing Assistant</p>
          </div>
        </div>

        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {!embedded && (
            <button
              onClick={() => setMinimised((m) => !m)}
              className="p-1 rounded bg-transparent border-none text-text-muted hover:bg-surface-secondary hover:text-text-primary cursor-pointer transition-colors"
              title={minimised ? 'Expand' : 'Minimise'}
            >
              {minimised ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>
          )}
          {!embedded && (
            <button
              onClick={handleClose}
              className="p-1 rounded bg-transparent border-none text-text-muted hover:bg-surface-secondary hover:text-text-primary cursor-pointer transition-colors"
              title="Close"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {!minimised && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-[fadeIn_0.2s_ease]`}
              >
                <div className={`max-w-[82%] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                  msg.role === 'user'
                    ? 'rounded-[14px_14px_4px_14px] bg-gradient-to-br from-primary to-blue-600 text-white border-none'
                    : 'rounded-[14px_14px_14px_4px] bg-surface-secondary/50 text-text-primary border border-border'
                }`}>
                  {msg.content || (
                    streaming && i === messages.length - 1 ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin text-text-muted" />
                        <span className="text-xs text-text-muted">thinking…</span>
                      </span>
                    ) : null
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 border-t border-border flex gap-2 shrink-0">
            <textarea
              ref={inputRef}
              id="ai-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about invoices, plans, seats…"
              rows={1}
              className="flex-1 bg-surface-secondary/50 border border-border rounded-xl text-text-primary text-[13px] px-3 py-2.5 resize-none outline-none font-sans leading-relaxed max-h-[100px] overflow-y-auto transition-colors focus:border-primary/50"
            />
            <button
              id="ai-chat-send"
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              className={`w-9 h-9 rounded-full border-none flex items-center justify-center shrink-0 self-end transition-colors ${
                input.trim() && !streaming
                  ? 'bg-gradient-to-br from-primary to-blue-500 cursor-pointer text-white'
                  : 'bg-surface-secondary/50 text-text-muted/50 cursor-not-allowed'
              }`}
            >
              {streaming
                ? <Loader2 size={15} className="animate-spin text-white/50" />
                : <Send size={15} />
              }
            </button>
          </div>
        </>
      )}
    </div>
  );
}
