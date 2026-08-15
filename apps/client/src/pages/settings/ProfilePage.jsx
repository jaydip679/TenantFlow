import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Loader2, ArrowLeft } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import { updateMe, changePassword as changePasswordApi } from '../../services/authService.js';
import { updateUser, logout } from '../../store/authSlice.js';

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

  // Change password state
  const [pwdOpen,    setPwdOpen]    = useState(false);
  const [curPwd,     setCurPwd]     = useState('');
  const [newPwd,     setNewPwd]     = useState('');
  const [confPwd,    setConfPwd]    = useState('');
  const [showCur,    setShowCur]    = useState(false);
  const [showNew,    setShowNew]    = useState(false);
  const [showConf,   setShowConf]   = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError,   setPwdError]   = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  const initials = `${(user?.firstName || 'U')[0]}${(user?.lastName || '')[0] || ''}`.toUpperCase();

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await updateMe({ firstName, lastName });
      dispatch(updateUser({ firstName, lastName }));
      setSuccess('Profile updated successfully.');
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    setPwdError('');
    setPwdSuccess('');
    if (!curPwd || !newPwd || !confPwd) { setPwdError('All fields are required.'); return; }
    if (newPwd !== confPwd)              { setPwdError('New passwords do not match.'); return; }
    if (newPwd.length < 8)              { setPwdError('New password must be at least 8 characters.'); return; }
    setPwdLoading(true);
    try {
      await changePasswordApi({ currentPassword: curPwd, newPassword: newPwd });
      setPwdSuccess('Password changed! You will be logged out.');
      // Backend invalidated all sessions — log out client after 2s
      setTimeout(() => { dispatch(logout()); navigate('/login', { replace: true }); }, 2000);
    } catch (err) {
      setPwdError(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to change password.'
      );
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <DashboardLayout title="My Profile">
      <div className="max-w-[640px] mx-auto font-sans text-text-primary">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 bg-transparent border-none text-text-muted hover:text-text-primary cursor-pointer text-[13px] mb-3 transition-colors p-0"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <h1 className="m-0 text-2xl font-bold text-text-primary">My Profile</h1>
          <p className="m-0 mt-1 text-sm text-text-muted">Manage your personal information and security</p>
        </div>

        {/* Avatar card */}
        <div className="bg-surface border border-border rounded-2xl p-7 mb-5 shadow-sm">
          <div className="flex items-center gap-5">
            <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center text-[26px] font-bold text-white shrink-0 shadow-[0_0_24px_rgba(108,99,255,0.4)]">
              {initials}
            </div>
            <div>
              <p className="m-0 text-xl font-bold text-text-primary">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="m-0 mt-0.5 text-[13px] text-text-muted">{user?.email}</p>
              <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary uppercase tracking-wider">
                {user?.role?.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* Personal Information card */}
        <div className="bg-surface border border-border rounded-2xl p-7 mb-5 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="m-0 text-base font-bold text-text-primary">Personal Information</h2>
            {!editing && (
              <button
                onClick={() => { setEditing(true); setSuccess(''); setError(''); }}
                className="px-4 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary cursor-pointer text-[13px] font-semibold transition-colors hover:bg-primary/20"
              >
                Edit
              </button>
            )}
          </div>

          {success && <div className="mb-4 p-3 rounded-lg bg-success/10 border border-success/20 text-success text-[13px] font-medium">{success}</div>}
          {error   && <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-[13px] font-medium">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name">
              {editing
                ? <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-surface-secondary/50 text-text-primary text-sm outline-none focus:border-primary transition-colors" />
                : <Value>{user?.firstName || '—'}</Value>}
            </Field>
            <Field label="Last Name">
              {editing
                ? <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-surface-secondary/50 text-text-primary text-sm outline-none focus:border-primary transition-colors" />
                : <Value>{user?.lastName || '—'}</Value>}
            </Field>
            <Field label="Email Address">
              <Value muted>{user?.email}</Value>
              <span className="text-[11px] text-text-muted">Cannot be changed</span>
            </Field>
            <Field label="Role">
              <Value muted className="capitalize">{user?.role?.replace(/_/g, ' ')}</Value>
            </Field>
          </div>

          {editing && (
            <div className="flex gap-2.5 mt-6">
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-5 py-2 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-sm font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Save Changes'}
              </button>
              <button
                onClick={() => { setEditing(false); setFirstName(user?.firstName || ''); setLastName(user?.lastName || ''); setError(''); }}
                className="px-5 py-2 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Change Password card */}
        <div className="bg-surface border border-border rounded-2xl p-7 shadow-sm">
          <div className={`flex items-center justify-between ${pwdOpen ? 'mb-6' : 'mb-0'}`}>
            <div className="flex items-center gap-2.5">
              <Lock size={16} className="text-primary" />
              <h2 className="m-0 text-base font-bold text-text-primary">Change Password</h2>
            </div>
            <button
              onClick={() => { setPwdOpen(v => !v); setPwdError(''); setPwdSuccess(''); setCurPwd(''); setNewPwd(''); setConfPwd(''); }}
              className="px-4 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary cursor-pointer text-[13px] font-semibold transition-colors hover:bg-primary/20"
            >
              {pwdOpen ? 'Cancel' : 'Change'}
            </button>
          </div>

          {pwdOpen && (
            <div className="flex flex-col gap-4">
              {pwdError   && <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-[13px] font-medium">{pwdError}</div>}
              {pwdSuccess && <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-success text-[13px] font-medium">{pwdSuccess}</div>}

              {[
                { label: 'Current Password', val: curPwd, set: setCurPwd, show: showCur, setShow: setShowCur },
                { label: 'New Password',     val: newPwd, set: setNewPwd, show: showNew, setShow: setShowNew },
                { label: 'Confirm New',      val: confPwd,set: setConfPwd,show: showConf,setShow: setShowConf },
              ].map(({ label, val, set, show, setShow }) => (
                <div key={label}>
                  <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5">{label}</label>
                  <div className="relative">
                    <input type={show ? 'text' : 'password'} value={val} onChange={e => set(e.target.value)} className="w-full px-3 pr-9 py-2 rounded-lg border border-border bg-surface-secondary/50 text-text-primary text-sm outline-none focus:border-primary transition-colors" placeholder="••••••••" />
                    <button type="button" onClick={() => setShow(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none text-text-muted hover:text-text-primary cursor-pointer p-0 flex items-center justify-center">
                      {show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={handlePasswordChange}
                disabled={pwdLoading}
                className="mt-1 px-5 py-2.5 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-sm font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {pwdLoading ? <Loader2 size={16} className="animate-spin" /> : 'Update Password'}
              </button>

              <p className="m-0 text-xs text-text-muted">
                <span className="text-warning">⚠</span> Changing your password will log you out of all active sessions.
              </p>
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
      <p className="m-0 mb-1 text-[11px] font-bold text-text-muted uppercase tracking-wider">{label}</p>
      {children}
    </div>
  );
}
function Value({ children, muted, className = '' }) {
  return <p className={`m-0 text-sm font-medium ${muted ? 'text-text-muted' : 'text-text-primary'} ${className}`}>{children}</p>;
}
