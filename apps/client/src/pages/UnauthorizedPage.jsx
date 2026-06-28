import React from 'react';
import { ShieldOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function UnauthorizedPage() {
  const navigate = useNavigate();
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 24,
      padding: 32,
      textAlign: 'center',
    }}>
      <div style={{
        width: 80, height: 80,
        background: 'rgba(239,68,68,0.12)',
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 8,
      }}>
        <ShieldOff size={36} color="#ef4444" />
      </div>
      <div>
        <h1 style={{ fontSize: 48, fontWeight: 800, color: 'hsl(4,85%,60%)', lineHeight: 1 }}>403</h1>
        <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-text)', margin: '12px 0 8px' }}>
          Access Denied
        </h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 15, maxWidth: 400 }}>
          You don&apos;t have permission to access this page. Contact your administrator if you believe this is a mistake.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn-secondary" onClick={() => navigate(-1)}>
          ← Go Back
        </button>
        <button className="btn-primary" onClick={() => navigate('/')}>
          Go Home
        </button>
      </div>
    </div>
  );
}
