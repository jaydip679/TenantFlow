import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  CreditCard,
  Users,
  Calendar,
  DollarSign,
  AlertTriangle,
  Bot,
  TrendingUp,
  Zap,
  Send,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import LoadingSpinner from '../../components/common/LoadingSpinner.jsx';
import { fetchSubscription, fetchTenantInvoices } from '../../store/subscriptionSlice.js';
import { aiChatBaseURL } from '../../services/subscriptionService.js';

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

function MetricCard({ icon: Icon, label, value, sub, accentClass = 'text-primary', bgClass = 'bg-primary/10', borderClass = 'border-primary/20', badge }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-3 shadow-sm transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${bgClass} ${borderClass} border`}>
          <Icon size={20} className={accentClass} />
        </div>
        {badge && (
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.className}`}>
            {badge.text}
          </span>
        )}
      </div>
      <div>
        <p className="m-0 text-[13px] text-text-muted font-medium">{label}</p>
        <p className="m-0 mt-1 text-2xl font-bold text-text-primary leading-tight">{value}</p>
        {sub && <p className="m-0 mt-1 text-xs text-text-muted">{sub}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    paid:          { className: 'bg-success/15 text-success border-success/30', text: 'Paid' },
    open:          { className: 'bg-accent/15 text-accent border-accent/30', text: 'Open' },
    void:          { className: 'bg-text-muted/20 text-text-muted border-transparent', text: 'Void' },
    uncollectible: { className: 'bg-danger/15 text-danger border-danger/30', text: 'Uncollectible' },
    draft:         { className: 'bg-warning/15 text-warning border-warning/30', text: 'Draft' },
  };
  const cfg = map[status] ?? { className: 'bg-surface-secondary text-text-muted border-transparent', text: status };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${cfg.className}`}>
      {cfg.text}
    </span>
  );
}

function SeatProgressBar({ used, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const dangerColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : 'var(--primary)';
  
  return (
    <div className="mt-1">
      <div className="flex justify-between mb-1.5">
        <span className="text-[13px] text-text-muted">Seat utilisation</span>
        <span className="text-[13px] font-semibold" style={{ color: dangerColor }}>{used} / {total} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-surface-secondary overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${dangerColor}, ${dangerColor}cc)`
          }}
        />
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
    <div className="bg-surface border border-border rounded-2xl flex flex-col h-[440px] overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4.5 py-3.5 border-b border-border flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
          <Bot size={16} className="text-primary" />
        </div>
        <div>
          <p className="m-0 text-sm font-semibold text-text-primary">AI Assistant</p>
          <p className="m-0 text-[11px] text-text-muted">Powered by TenantFlow AI</p>
        </div>
        {streaming && (
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-[11px] text-success">Streaming…</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user' 
                ? 'rounded-[16px_16px_4px_16px] bg-primary/10 border border-primary/20 text-text-primary' 
                : 'rounded-[16px_16px_16px_4px] bg-surface-secondary border border-border text-text-primary'
            }`}>
              {msg.content || (streaming && i === messages.length - 1 ? (
                <span className="text-text-muted">▋</span>
              ) : '')}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border flex gap-2 items-end bg-surface">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about your subscription, invoices…"
          rows={1}
          disabled={streaming}
          className="flex-1 resize-none bg-surface-secondary border border-border rounded-xl px-3.5 py-2.5 text-text-primary text-[13px] outline-none font-sans leading-relaxed focus:border-primary transition-colors disabled:opacity-70"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || streaming}
          className={`w-9 h-9 rounded-xl border-none flex items-center justify-center shrink-0 transition-colors ${
            (!input.trim() || streaming) 
              ? 'bg-primary/20 text-white cursor-not-allowed' 
              : 'bg-primary hover:bg-primary-hover text-white cursor-pointer'
          }`}
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

  const usedSeats  = subscription?.seatCount ?? 0;
  const totalSeats = subscription?.planVersionId?.features?.max_seats
                  ?? subscription?.planId?.features?.max_seats
                  ?? 0;

  const nextBilling = subscription?.currentPeriodEnd;
  const lastInvoice = Array.isArray(invoices) ? invoices[0] : null;

  const hasAI = user?.plan?.features?.ai_assistant === true;

  const pageLoading = loading && !subscription;

  if (pageLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingSpinner size={56} />
        </div>
      </DashboardLayout>
    );
  }

  const statusBadge = () => {
    switch (subscription?.status) {
      case 'active':   return { className: 'bg-success/15 text-success border-success/30', text: 'Active' };
      case 'trialing': return { className: 'bg-warning/15 text-warning border-warning/30', text: 'Trialing' };
      case 'past_due': return { className: 'bg-danger/15 text-danger border-danger/30', text: 'Past Due' };
      case 'canceled': return { className: 'bg-text-muted/20 text-text-muted border-transparent', text: 'Canceled' };
      default:         return { className: 'bg-surface-secondary text-text-muted border-transparent', text: subscription?.status ?? '—' };
    }
  };

  return (
    <DashboardLayout>
      {/* Trial banner */}
      {isTrialing && (
        <div className="flex items-center gap-3 px-5 py-3.5 mb-6 rounded-xl bg-warning/10 border border-warning/30">
          <AlertTriangle size={18} className="text-warning" />
          <span className="text-sm text-warning font-medium">
            Your free trial expires in <strong>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</strong>.{' '}
            <a href="/dashboard/subscription" className="text-warning underline hover:text-amber-600 transition-colors">
              Upgrade now
            </a>{' '}
            to keep uninterrupted access.
          </span>
        </div>
      )}

      {/* Page header */}
      <div className="mb-7">
        <h2 className="m-0 text-[22px] font-bold text-text-primary tracking-tight">
          Welcome back{user?.name ? `, ${user.name}` : ''}
        </h2>
        <p className="m-0 mt-1 text-sm text-text-muted">
          Here's an overview of your account.
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <MetricCard
          icon={Zap}
          label="Subscription Status"
          value={(subscription?.planVersionId?.displayName || subscription?.planId?.displayName) ?? '—'}
          sub={`Billed ${subscription?.planVersionId?.interval || subscription?.planId?.interval || 'monthly'}`}
          accentClass="text-primary" bgClass="bg-primary/10" borderClass="border-primary/20"
          badge={statusBadge()}
        />
        <MetricCard
          icon={Users}
          label="Seats Used"
          value={`${usedSeats} / ${totalSeats || '∞'}`}
          sub={totalSeats ? `${Math.round((usedSeats / totalSeats) * 100)}% utilised` : 'Unlimited seats'}
          accentClass="text-accent" bgClass="bg-accent/10" borderClass="border-accent/20"
        />
        <MetricCard
          icon={Calendar}
          label="Next Billing Date"
          value={formatDate(nextBilling)}
          sub={nextBilling ? `In ${daysUntil(nextBilling)} days` : undefined}
          accentClass="text-emerald-500" bgClass="bg-emerald-500/10" borderClass="border-emerald-500/20"
        />
        <MetricCard
          icon={DollarSign}
          label="Last Invoice"
          value={lastInvoice ? formatCurrency(lastInvoice.amount, lastInvoice.currency) : '—'}
          sub={lastInvoice ? formatDate(lastInvoice.createdAt) : 'No invoices yet'}
          accentClass="text-orange-500" bgClass="bg-orange-500/10" borderClass="border-orange-500/20"
          badge={lastInvoice ? {
            className: lastInvoice.status === 'paid' ? 'bg-success/15 text-success border-success/30' : 'bg-accent/15 text-accent border-accent/30',
            text: lastInvoice.status,
          } : undefined}
        />
      </div>

      {/* Seat utilisation bar */}
      {totalSeats > 0 && (
        <div className="bg-surface border border-border rounded-2xl px-6 py-5 mb-7 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-primary" />
            <h3 className="m-0 text-[15px] font-semibold text-text-primary">Team Seat Usage</h3>
          </div>
          <SeatProgressBar used={usedSeats} total={totalSeats} />
          {totalSeats > 0 && usedSeats >= totalSeats && (
            <p className="m-0 mt-2 text-xs text-danger font-medium">
              You've reached your seat limit.{' '}
              <a href="/dashboard/subscription" className="text-danger underline hover:text-red-600 transition-colors">
                Upgrade your plan
              </a>{' '}
              to add more members.
            </p>
          )}
        </div>
      )}

      {/* Two-column: Recent invoices + AI chat */}
      <div className={`grid gap-5 items-start ${hasAI ? 'lg:grid-cols-[1fr_400px]' : 'grid-cols-1'}`}>
        {/* Recent invoices */}
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4.5 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard size={16} className="text-primary" />
              <h3 className="m-0 text-[15px] font-semibold text-text-primary">Recent Invoices</h3>
            </div>
            <a href="/dashboard/invoices" className="text-[13px] text-primary hover:text-primary-hover font-medium no-underline transition-colors">
              View all &rarr;
            </a>
          </div>

          {invoicesLoading ? (
            <div className="p-10 flex justify-center">
              <LoadingSpinner size={36} />
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <div className="py-10 px-6 text-center text-text-muted">
              <CreditCard size={32} className="mx-auto mb-3 opacity-40" />
              <p className="m-0 text-sm">No invoices yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary/50">
                    {['Invoice #', 'Date', 'Amount', 'Status'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(invoices) ? invoices : []).slice(0, 5).map((inv, i) => (
                    <tr
                      key={inv._id ?? inv.id ?? i}
                      className="border-b border-border transition-colors hover:bg-surface-secondary/30 last:border-0"
                    >
                      <td className="px-5 py-3.5 text-[13px] text-text-primary font-medium whitespace-nowrap">
                        {inv.invoiceNumber ?? inv.number ?? `#${String(i + 1).padStart(4, '0')}`}
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-text-muted whitespace-nowrap">
                        {formatDate(inv.createdAt ?? inv.date)}
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-text-primary font-semibold whitespace-nowrap">
                        {formatCurrency(inv.amount ?? inv.total, inv.currency)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
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
