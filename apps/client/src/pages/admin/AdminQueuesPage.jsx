import React, { useState, useEffect } from 'react';
import { Server, ExternalLink, Loader2 } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout.jsx';
import { getQueueStats } from '../../services/adminService.js';

export default function AdminQueuesPage() {
  const [stats,   setStats]   = useState({});
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = () => {
    setLoading(true);
    getQueueStats()
      .then((res) => setStats(res.data.data || {}))
      .catch(() => setError('Failed to load queue stats.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <AdminLayout title="Queue Monitor">
      <div className="max-w-[1100px] font-sans text-text-primary">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
          <div>
            <h1 className="m-0 text-[26px] font-bold text-text-primary flex items-center gap-2.5 tracking-tight">
              <div className="w-9 h-9 rounded-[10px] bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Server size={18} className="text-primary" />
              </div>
              Queue Monitor
            </h1>
            <p className="m-0 mt-1.5 text-sm text-text-muted">BullMQ job queue depths and failure counts</p>
          </div>
          <div className="flex gap-2.5">
            <button className="px-4 py-2 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[13px] font-semibold transition-colors" onClick={load}>
              &orarr; Refresh
            </button>
            <a href="/admin/queues" target="_blank" rel="noreferrer" className="px-4 py-2 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-[13px] font-semibold transition-colors flex items-center gap-1.5 no-underline">
              <ExternalLink size={14} /> Bull Board UI
            </a>
          </div>
        </div>

        {error && <div className="mb-6 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium">{error}</div>}

        {loading ? (
          <div className="p-16 flex justify-center">
            <Loader2 size={36} className="text-primary animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
            {Object.entries(stats).map(([name, counts]) => {
              const hasFailed = (counts.failed || 0) > 0;
              return (
                <div key={name} className={`bg-surface border rounded-2xl p-5 shadow-sm transition-colors ${hasFailed ? 'border-danger/30' : 'border-border hover:border-primary/30'}`}>
                  <p className="m-0 text-[14px] font-semibold text-text-primary capitalize mb-4 tracking-tight flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${hasFailed ? 'bg-danger' : 'bg-primary'}`} />
                    {name.replace(/-queue$/, '')}
                  </p>
                  <div className="grid grid-cols-3 gap-y-4 gap-x-2">
                    {[
                      { label: 'Waiting', value: counts.waiting, colorClass: 'text-accent' },
                      { label: 'Active',  value: counts.active,  colorClass: 'text-warning' },
                      { label: 'Done',    value: counts.completed, colorClass: 'text-success' },
                      { label: 'Failed',  value: counts.failed,  colorClass: hasFailed ? 'text-danger' : 'text-text-muted' },
                      { label: 'Delayed', value: counts.delayed, colorClass: 'text-text-muted' },
                    ].map(({ label, value, colorClass }) => (
                      <div key={label} className="text-center">
                        <div className={`text-xl font-bold leading-tight ${colorClass}`}>{value ?? 0}</div>
                        <div className="text-[11px] font-medium text-text-muted mt-1 uppercase tracking-[0.05em]">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
