import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import { updateMe } from '../../services/authService.js';
import { updateUser } from '../../store/authSlice.js';

export default function ProfilePage() {
  const { user }     = useSelector((s) => s.auth);
  const dispatch     = useDispatch();
  const navigate     = useNavigate();
  const [editing, setEditing]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [success, setSuccess]       = useState('');
  const [error, setError]           = useState('');
  const [firstName, setFirstName]   = useState(user?.firstName || '');
  const [lastName, setLastName]     = useState(user?.lastName  || '');

  const initials = `${(user?.firstName || 'U')[0]}${(user?.lastName || '')[0] || ''}`.toUpperCase();

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await updateMe({ firstName, lastName });
      // Update Redux store + localStorage immediately — no logout needed
      dispatch(updateUser({ firstName, lastName }));
      setSuccess('Profile updated successfully.');
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', color: '#8b8bad', cursor: 'pointer', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            ← Back
          </button>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#f0f0ff' }}>My Profile</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#8b8bad' }}>Manage your personal information</p>
        </div>

        {/* Avatar card */}
        <div style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '28px 28px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'linear-gradient(135deg, #6c63ff, #a78bfa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, fontWeight: 700, color: '#fff',
              boxShadow: '0 0 24px rgba(108,99,255,0.4)',
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f0f0ff' }}>
                {user?.firstName} {user?.lastName}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#8b8bad' }}>{user?.email}</p>
              <span style={{
                display: 'inline-block', marginTop: 6,
                padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: 'rgba(108,99,255,0.15)', color: '#a78bfa',
                textTransform: 'capitalize',
              }}>
                {user?.role?.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* Details card */}
        <div style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '28px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#f0f0ff' }}>Personal Information</h2>
            {!editing && (
              <button
                onClick={() => { setEditing(true); setSuccess(''); setError(''); }}
                style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid rgba(108,99,255,0.4)', background: 'rgba(108,99,255,0.1)', color: '#a78bfa', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
              >
                Edit
              </button>
            )}
          </div>

          {success && <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80', fontSize: 13 }}>{success}</div>}
          {error   && <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)',  border: '1px solid rgba(239,68,68,0.25)',  color: '#f87171', fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="First Name">
              {editing
                ? <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
                : <Value>{user?.firstName || '—'}</Value>}
            </Field>
            <Field label="Last Name">
              {editing
                ? <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
                : <Value>{user?.lastName || '—'}</Value>}
            </Field>
            <Field label="Email Address">
              <Value muted>{user?.email}</Value>
              <span style={{ fontSize: 11, color: '#8b8bad' }}>Cannot be changed</span>
            </Field>
            <Field label="Role">
              <Value muted style={{ textTransform: 'capitalize' }}>{user?.role?.replace('_', ' ')}</Value>
            </Field>
          </div>

          {editing && (
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                onClick={handleSave}
                disabled={loading}
                style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #a78bfa)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
              >
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                onClick={() => { setEditing(false); setFirstName(user?.firstName || ''); setLastName(user?.lastName || ''); setError(''); }}
                style={{ padding: '9px 22px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8b8bad', cursor: 'pointer', fontSize: 14 }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: '#8b8bad', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
      {children}
    </div>
  );
}
function Value({ children, muted, style: s }) {
  return <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: muted ? '#c4c4d4' : '#f0f0ff', ...s }}>{children}</p>;
}
const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid rgba(108,99,255,0.4)', background: 'rgba(255,255,255,0.05)',
  color: '#f0f0ff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
