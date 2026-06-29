import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Bot, Minimize2, Maximize2, Loader } from 'lucide-react';
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
        style={{
          position:     'fixed',
          bottom:       24,
          right:        24,
          width:        52,
          height:       52,
          borderRadius: '50%',
          background:   'linear-gradient(135deg, hsl(252,100%,69%), hsl(220,90%,60%))',
          border:       'none',
          boxShadow:    '0 4px 20px hsla(252,100%,69%,0.4)',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          cursor:       'pointer',
          zIndex:       999,
          transition:   'transform 200ms ease, box-shadow 200ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        title="Open AI billing assistant"
      >
        <Bot size={22} color="#fff" />
      </button>
    );
  }

  const wrapperStyle = embedded ? {
    display:       'flex',
    flexDirection: 'column',
    height:        '100%',
    minHeight:     360,
    borderRadius:  'var(--radius-lg)',
    border:        '1px solid var(--glass-border)',
    background:    'var(--glass-bg)',
    backdropFilter: 'blur(20px)',
    overflow:      'hidden',
  } : {
    position:      'fixed',
    bottom:        24,
    right:         24,
    width:         360,
    height:        minimised ? 52 : 520,
    borderRadius:  'var(--radius-xl)',
    background:    'rgba(15,15,26,0.92)',
    border:        '1px solid rgba(108,99,255,0.3)',
    boxShadow:     '0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(108,99,255,0.15)',
    backdropFilter: 'blur(24px)',
    display:       'flex',
    flexDirection: 'column',
    zIndex:        999,
    overflow:      'hidden',
    transition:    'height 250ms ease',
  };

  return (
    <div id="ai-chat-widget" style={wrapperStyle}>
      {/* Header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '12px 16px',
        borderBottom:   minimised ? 'none' : '1px solid rgba(255,255,255,0.06)',
        background:     'linear-gradient(135deg, rgba(108,99,255,0.2), rgba(59,130,246,0.1))',
        flexShrink:     0,
        cursor:         embedded ? 'default' : 'pointer',
      }}
        onClick={!embedded ? () => setMinimised((m) => !m) : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, hsl(252,100%,69%), hsl(220,90%,60%))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={16} color="#fff" />
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: 13, color: '#fff', margin: 0 }}>TenantFlow AI</p>
            <p style={{ fontSize: 11, color: 'hsl(252,80%,80%)', margin: 0 }}>Billing Assistant</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          {!embedded && (
            <button
              onClick={() => setMinimised((m) => !m)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', padding: 4, cursor: 'pointer', borderRadius: 4 }}
              title={minimised ? 'Expand' : 'Minimise'}
            >
              {minimised ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>
          )}
          {!embedded && (
            <button
              onClick={handleClose}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', padding: 4, cursor: 'pointer', borderRadius: 4 }}
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
          <div style={{
            flex:       1,
            overflowY:  'auto',
            padding:    '16px 12px',
            display:    'flex',
            flexDirection: 'column',
            gap:        12,
          }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display:   'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  animation: 'fadeIn 0.2s ease',
                }}
              >
                <div style={{
                  maxWidth:     '82%',
                  padding:      '9px 13px',
                  borderRadius: msg.role === 'user'
                    ? '14px 14px 4px 14px'
                    : '14px 14px 14px 4px',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, hsl(252,80%,55%), hsl(220,80%,50%))'
                    : 'rgba(255,255,255,0.06)',
                  border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  fontSize:    13,
                  lineHeight:  1.55,
                  color:       '#e8e8f0',
                  whiteSpace:  'pre-wrap',
                  wordBreak:   'break-word',
                }}>
                  {msg.content || (
                    streaming && i === messages.length - 1 ? (
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>thinking…</span>
                      </span>
                    ) : null
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding:      '10px 12px',
            borderTop:    '1px solid rgba(255,255,255,0.06)',
            display:      'flex',
            gap:          8,
            flexShrink:   0,
          }}>
            <textarea
              ref={inputRef}
              id="ai-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about invoices, plans, seats…"
              rows={1}
              style={{
                flex:        1,
                background:  'rgba(255,255,255,0.06)',
                border:      '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                color:       '#e8e8f0',
                fontSize:    13,
                padding:     '9px 12px',
                resize:      'none',
                outline:     'none',
                fontFamily:  'inherit',
                lineHeight:  1.4,
                maxHeight:   100,
                overflowY:   'auto',
                transition:  'border-color 150ms',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'rgba(108,99,255,0.5)'; }}
              onBlur={(e)  => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
            />
            <button
              id="ai-chat-send"
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              style={{
                width:        38,
                height:       38,
                borderRadius: '50%',
                background:   input.trim() && !streaming
                  ? 'linear-gradient(135deg, hsl(252,100%,69%), hsl(220,90%,60%))'
                  : 'rgba(255,255,255,0.08)',
                border:       'none',
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
                cursor:       input.trim() && !streaming ? 'pointer' : 'not-allowed',
                flexShrink:   0,
                transition:   'background 150ms',
                alignSelf:    'flex-end',
              }}
            >
              {streaming
                ? <Loader size={15} color="rgba(255,255,255,0.5)" style={{ animation: 'spin 0.8s linear infinite' }} />
                : <Send size={15} color={input.trim() ? '#fff' : 'rgba(255,255,255,0.3)'} />
              }
            </button>
          </div>
        </>
      )}
    </div>
  );
}
