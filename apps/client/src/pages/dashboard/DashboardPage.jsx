import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  CreditCard,
  Users,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Send,
  Bot,
  TrendingUp,
  Zap,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import LoadingSpinner from '../../components/common/LoadingSpinner.jsx';
import { fetchSubscription, fetchTenantInvoices } from '../../store/subscriptionSlice.js';
import { aiChatBaseURL } from '../../services/subscriptionService.js';

// ── Design tokens ─────────────────────────────────────────────────────────────
const ACCENT  = '#6c63ff';
const ACCENT2 = '#a78bfa';
const BG_CARD = 'rgba(255,255,255,0.04)';
const BORDER  = 'rgba(255,255,255,0.08)';
const TEXT    = '#f0f0ff';
const MUTED   = '#8b8bad';

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysUntil(dateStr) {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCurrency(amount, currency = 'INR') {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount / 100);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, sub, accentColor = ACCENT, badge }) {
  return (
    <div style={{
      background: BG_CARD,
      border: `1px solid ${BORDER}`,
      borderRadius: 16,
      padding: '22px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      backdropFilter: 'blur(8px)',
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: `${accentColor}22`,
          border: `1px solid ${accentColor}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} color={accentColor} />
        </div>
        {badge && (
          <span style={{
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: badge.bg, color: badge.color, border: `1px solid ${badge.border || 'transparent'}`,
          }}>
            {badge.text}
          </span>
        )}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 13, color: MUTED, fontWeight: 500 }}>{label}</p>
        <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700, color: TEXT, lineHeight: 1.2 }}>{value}</p>
        {sub && <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>{sub}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    paid:          { bg: 'rgba(34,197,94,0.15)',  color: '#4ade80', text: 'Paid' },
    open:          { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', text: 'Open' },
    void:          { bg: 'rgba(107,114,128,0.2)', color: '#9ca3af', text: 'Void' },
    uncollectible: { bg: 'rgba(239,68,68,0.15)',  color: '#f87171', text: 'Uncollectible' },
    draft:         { bg: 'rgba(234,179,8,0.15)',  color: '#facc15', text: 'Draft' },
  };
  const cfg = map[status] ?? { bg: 'rgba(255,255,255,0.1)', color: '#9ca3af', text: status };
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: cfg.bg, color: cfg.color,
    }}>
      {cfg.text}
    </span>
  );
}

function SeatProgressBar({ used, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const dangerColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : ACCENT;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: MUTED }}>Seat utilisation</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: dangerColor }}>{used} / {total} ({pct}%)</span>
      </div>
      <div style={{
        height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${dangerColor}, ${dangerColor}cc)`,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  );
}

// ── AI Chat Panel ──────────────────────────────────────────────────────────────
function AIChatPanel({ accessToken }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm your TenantFlow AI assistant. Ask me anything about your subscription, invoices, or billing." },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef(null);
  const abortRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setStreaming(true);

    // Append empty assistant bubble that we'll fill progressively
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    abortRef.current = new AbortController();
    try {
      const res = await fetch(aiChatBaseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ message: text }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const chunk = line.slice(6);
            if (chunk === '[DONE]') break;
            try {
              const parsed = JSON.parse(chunk);
              const delta = parsed.choices?.[0]?.delta?.content ?? parsed.content ?? chunk;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + delta,
                };
                return updated;
              });
            } catch {
              // plain text chunk
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + chunk,
                };
                return updated;
              });
            }
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: 'Sorry, I encountered an error. Please try again.',
          };
          return updated;
        });
      }
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, accessToken]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div style={{
      background: BG_CARD,
      border: `1px solid ${BORDER}`,
      borderRadius: 16,
      display: 'flex',
      flexDirection: 'column',
      height: 440,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: `${ACCENT}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={16} color={ACCENT2} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT }}>AI Assistant</p>
          <p style={{ margin: 0, fontSize: 11, color: MUTED }}>Powered by TenantFlow AI</p>
        </div>
        {streaming && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#4ade80',
              animation: 'tf-pulse 1.2s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 11, color: '#4ade80' }}>Streaming…</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '80%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user' ? `${ACCENT}33` : 'rgba(255,255,255,0.06)',
              border: `1px solid ${msg.role === 'user' ? `${ACCENT}44` : BORDER}`,
              fontSize: 13,
              color: TEXT,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}>
              {msg.content || (streaming && i === messages.length - 1 ? (
                <span style={{ color: MUTED }}>▋</span>
              ) : '')}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 16px',
        borderTop: `1px solid ${BORDER}`,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
      }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about your subscription, invoices…"
          rows={1}
          disabled={streaming}
          style={{
            flex: 1,
            resize: 'none',
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: '10px 14px',
            color: TEXT,
            fontSize: 13,
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || streaming}
          style={{
            width: 38, height: 38,
            borderRadius: 10,
            border: 'none',
            background: (!input.trim() || streaming) ? 'rgba(108,99,255,0.2)' : ACCENT,
            color: '#fff',
            cursor: (!input.trim() || streaming) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
            flexShrink: 0,
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const dispatch   = useDispatch();
  const { user, accessToken } = useSelector((s) => s.auth);
  const { subscription, invoices, loading, invoicesLoading } = useSelector((s) => s.subscription);
  const tenantId = user?.tenantId;

  useEffect(() => {
    if (!tenantId) return;
    dispatch(fetchSubscription(tenantId));
    dispatch(fetchTenantInvoices({ tenantId, params: { limit: 5, page: 1 } }));
  }, [dispatch, tenantId]);

  const isTrialing = subscription?.status === 'trialing';
  const trialEnd   = subscription?.trialEnd;
  const daysLeft   = trialEnd ? daysUntil(trialEnd) : 0;

  const usedSeats  = subscription?.usedSeats ?? 0;
  const totalSeats = subscription?.totalSeats ?? subscription?.plan?.seats ?? 0;

  const nextBilling = subscription?.currentPeriodEnd;
  const lastInvoice = Array.isArray(invoices) ? invoices[0] : null;

  const hasAI = user?.plan?.features?.ai_assistant === true;

  const pageLoading = loading && !subscription;

  if (pageLoading) {
    return (
      <DashboardLayout>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
          <LoadingSpinner size={56} />
        </div>
      </DashboardLayout>
    );
  }

  const statusBadge = () => {
    switch (subscription?.status) {
      case 'active':   return { bg: 'rgba(34,197,94,0.15)',  color: '#4ade80', text: 'Active',   border: 'rgba(34,197,94,0.3)' };
      case 'trialing': return { bg: 'rgba(234,179,8,0.15)', color: '#facc15', text: 'Trialing', border: 'rgba(234,179,8,0.3)' };
      case 'past_due': return { bg: 'rgba(239,68,68,0.15)', color: '#f87171', text: 'Past Due', border: 'rgba(239,68,68,0.3)' };
      case 'canceled': return { bg: 'rgba(107,114,128,0.2)',color: '#9ca3af', text: 'Canceled', border: 'transparent' };
      default:         return { bg: 'rgba(255,255,255,0.08)', color: MUTED,  text: subscription?.status ?? '—', border: 'transparent' };
    }
  };

  return (
    <DashboardLayout>
      {/* Trial banner */}
      {isTrialing && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 20px',
          marginBottom: 24,
          borderRadius: 12,
          background: 'rgba(234,179,8,0.12)',
          border: '1px solid rgba(234,179,8,0.3)',
        }}>
          <AlertTriangle size={18} color="#facc15" />
          <span style={{ fontSize: 14, color: '#fde68a', fontWeight: 500 }}>
            Your free trial expires in <strong>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</strong>.{' '}
            <a href="/dashboard/subscription" style={{ color: '#facc15', textDecoration: 'underline' }}>
              Upgrade now
            </a>{' '}
            to keep uninterrupted access.
          </span>
        </div>
      )}

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: TEXT }}>
          Welcome back{user?.name ? `, ${user.name}` : ''}
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: MUTED }}>
          Here's an overview of your account.
        </p>
      </div>

      {/* Metric cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
        marginBottom: 28,
      }}>
        <MetricCard
          icon={Zap}
          label="Subscription Status"
          value={subscription?.plan?.name ?? '—'}
          sub={`Billed ${subscription?.interval ?? ''}`}
          accentColor={ACCENT}
          badge={statusBadge()}
        />
        <MetricCard
          icon={Users}
          label="Seats Used"
          value={`${usedSeats} / ${totalSeats || '∞'}`}
          sub={totalSeats ? `${Math.round((usedSeats / totalSeats) * 100)}% utilised` : 'Unlimited seats'}
          accentColor="#a78bfa"
        />
        <MetricCard
          icon={Calendar}
          label="Next Billing Date"
          value={formatDate(nextBilling)}
          sub={nextBilling ? `In ${daysUntil(nextBilling)} days` : undefined}
          accentColor="#34d399"
        />
        <MetricCard
          icon={DollarSign}
          label="Last Invoice"
          value={lastInvoice ? formatCurrency(lastInvoice.amount, lastInvoice.currency) : '—'}
          sub={lastInvoice ? formatDate(lastInvoice.createdAt) : 'No invoices yet'}
          accentColor="#fb923c"
          badge={lastInvoice ? {
            bg: lastInvoice.status === 'paid' ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
            color: lastInvoice.status === 'paid' ? '#4ade80' : '#60a5fa',
            text: lastInvoice.status,
          } : undefined}
        />
      </div>

      {/* Seat utilisation bar */}
      {totalSeats > 0 && (
        <div style={{
          background: BG_CARD, border: `1px solid ${BORDER}`,
          borderRadius: 16, padding: '20px 24px', marginBottom: 28,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <TrendingUp size={16} color={ACCENT2} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT }}>Team Seat Usage</h3>
          </div>
          <SeatProgressBar used={usedSeats} total={totalSeats} />
          {totalSeats > 0 && usedSeats >= totalSeats && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#f87171' }}>
              You've reached your seat limit.{' '}
              <a href="/dashboard/subscription" style={{ color: '#f87171', textDecoration: 'underline' }}>
                Upgrade your plan
              </a>{' '}
              to add more members.
            </p>
          )}
        </div>
      )}

      {/* Two-column: Recent invoices + AI chat */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: hasAI ? '1fr 400px' : '1fr',
        gap: 20,
        alignItems: 'start',
      }}>
        {/* Recent invoices */}
        <div style={{
          background: BG_CARD, border: `1px solid ${BORDER}`,
          borderRadius: 16, overflow: 'hidden',
        }}>
          <div style={{
            padding: '18px 24px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CreditCard size={16} color={ACCENT2} />
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT }}>Recent Invoices</h3>
            </div>
            <a href="/dashboard/invoices" style={{ fontSize: 13, color: ACCENT2, textDecoration: 'none' }}>
              View all →
            </a>
          </div>

          {invoicesLoading ? (
            <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
              <LoadingSpinner size={36} />
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: MUTED }}>
              <CreditCard size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p style={{ margin: 0 }}>No invoices yet</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {['Invoice #', 'Date', 'Amount', 'Status'].map((h) => (
                      <th key={h} style={{
                        padding: '12px 20px', textAlign: 'left',
                        fontSize: 11, fontWeight: 600, color: MUTED,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(invoices) ? invoices : []).slice(0, 5).map((inv, i) => (
                    <tr
                      key={inv._id ?? inv.id ?? i}
                      style={{ borderBottom: `1px solid ${BORDER}`, transition: 'background 0.15s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '14px 20px', fontSize: 13, color: TEXT, fontWeight: 500 }}>
                        {inv.invoiceNumber ?? inv.number ?? `#${String(i + 1).padStart(4, '0')}`}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: 13, color: MUTED }}>
                        {formatDate(inv.createdAt ?? inv.date)}
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: 13, color: TEXT, fontWeight: 600 }}>
                        {formatCurrency(inv.amount ?? inv.total, inv.currency)}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <StatusBadge status={inv.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* AI Chat (feature-gated) */}
        {hasAI && <AIChatPanel accessToken={accessToken} />}
      </div>
    </DashboardLayout>
  );
}
