import React, { useState, useEffect } from 'react';
import { Server, ExternalLink } from 'lucide-react';
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
    <AdminLayout>
      <div style={{ maxWidth: 1100 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <Server size={22} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle' }} />
              Queue Monitor
            </h1>
            <p className="page-subtitle">BullMQ job queue depths and failure counts</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary btn-sm" onClick={load}>↺ Refresh</button>
            <a href="/admin/queues" target="_blank" className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ExternalLink size={14} /> Bull Board UI
            </a>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {loading ? (
          <div style={{ padding: 64, textAlign: 'center' }}>
            <div className="btn-spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto', borderTopColor: 'var(--color-primary)' }} />
          </div>
        ) : (
          <div className="grid-3" style={{ gap: 16 }}>
            {Object.entries(stats).map(([name, counts]) => {
              const hasFailed = (counts.failed || 0) > 0;
              return (
                <div key={name} className="card card-sm" style={{ '--accent': hasFailed ? 'var(--color-danger)' : 'var(--color-primary)' }}>
                  <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, textTransform: 'capitalize', color: 'var(--color-text)' }}>
                    {name.replace(/-queue$/, '')}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {[
                      { label: 'Waiting', value: counts.waiting, color: 'var(--color-info)' },
                      { label: 'Active',  value: counts.active,  color: 'var(--color-warning)' },
                      { label: 'Done',    value: counts.completed, color: 'var(--color-success)' },
                      { label: 'Failed',  value: counts.failed,  color: hasFailed ? 'var(--color-danger)' : 'var(--color-text-muted)' },
                      { label: 'Delayed', value: counts.delayed, color: 'var(--color-text-muted)' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color }}>{value ?? 0}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>{label}</div>
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
