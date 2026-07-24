import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import api from '../../services/api.js';
import { Zap, CheckCircle2, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';

const BG      = 'linear-gradient(135deg,#0f0f1a 0%,#1a1a2e 50%,#16213e 100%)';
const ACCENT  = '#6c63ff';
const CARD    = 'rgba(255,255,255,0.04)';
const BORDER  = 'rgba(255,255,255,0.1)';
const TEXT    = '#f0f0ff';
const MUTED   = '#8b8bad';

const ROLE_LABELS = {
  tenant_member:  'Team Member',
  finance_member: 'Finance Member',
  tenant_admin:   'Admin',
};

export default function AcceptInvitePage() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const token      = params.get('token');
  const tenantId   = params.get('tenantId');

  const [context,   setContext]   = useState(null);  // { tenantName, email, role }
  const [ctxError,  setCtxError]  = useState('');
  const [ctxLoading,setCtxLoading]= useState(true);
  const [showPwd,   setShowPwd]   = useState(false);
  const [showConf,  setShowConf]  = useState(false);
  const [submitting,setSubmitting]= useState(false);
  const [done,      setDone]      = useState(false);
  const [submitErr, setSubmitErr] = useState('');

  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const pwdValue = watch('password', '');

  // On mount: validate the invite token to get context
  useEffect(() => {
    if (!token) {
      setCtxError('Invalid invite link — no token found. Please use the link from your invitation email.');
      setCtxLoading(false);
      return;
    }
    api.get(`/tenants/invite/validate?token=${token}`)
      .then((res) => setContext(res.data.data))
      .catch((err) => setCtxError(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'This invite link is invalid or has already been used.'
      ))
      .finally(() => setCtxLoading(false));
  }, [token]);

  const onSubmit = async (data) => {
    setSubmitting(true);
    setSubmitErr('');
    try {
      const tid = tenantId || context?.tenantId;
      await api.post(`/tenants/${tid}/members/accept-invite`, {
        token,
        firstName: data.firstName,
        lastName:  data.lastName,
        password:  data.password,
      });
      setDone(true);
    } catch (err) {
      setSubmitErr(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to accept invite. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const inp = {
    width: '100%', padding: '10px 14px', borderRadius: 9,
    border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.05)',
    color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };
  const errTxt = { color: '#f87171', fontSize: 12, marginTop: 4 };

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg,${ACCENT},#a78bfa)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 20px ${ACCENT}55` }}>
            <Zap size={20} color="#fff" />
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>TenantFlow</span>
        </div>

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '36px 32px', backdropFilter: 'blur(12px)' }}>

          {/* Loading context */}
          {ctxLoading && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: MUTED }}>
              <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
              <p style={{ margin: 0 }}>Validating your invitation…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Invalid token */}
          {!ctxLoading && ctxError && (
            <div style={{ textAlign: 'center' }}>
              <AlertCircle size={40} color="#f87171" style={{ margin: '0 auto 16px' }} />
              <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: TEXT }}>Invite Invalid</h2>
              <p style={{ margin: '0 0 24px', fontSize: 14, color: MUTED, lineHeight: 1.6 }}>{ctxError}</p>
              <button onClick={() => navigate('/login')} style={{ padding: '10px 24px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                Go to Login
              </button>
            </div>
          )}

          {/* Success */}
          {!ctxLoading && !ctxError && done && (
            <div style={{ textAlign: 'center' }}>
              <CheckCircle2 size={48} color="#4ade80" style={{ margin: '0 auto 16px' }} />
              <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: TEXT }}>You're in!</h2>
              <p style={{ margin: '0 0 8px', fontSize: 14, color: MUTED }}>
                Your account has been created. You can now log in to <strong style={{ color: TEXT }}>{context?.tenantName}</strong>.
              </p>
              <button onClick={() => navigate('/login')} style={{ marginTop: 24, padding: '10px 24px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg,${ACCENT},#a78bfa)`, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                Log In Now
              </button>
            </div>
          )}

          {/* Form */}
          {!ctxLoading && !ctxError && !done && context && (
            <>
              <div style={{ marginBottom: 28 }}>
                <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: TEXT }}>Accept Invitation</h1>
                <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
                  You've been invited to join <strong style={{ color: TEXT }}>{context.tenantName}</strong> as{' '}
                  <strong style={{ color: '#a78bfa' }}>{ROLE_LABELS[context.role] || context.role}</strong>.
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: MUTED }}>
                  Joining as <strong style={{ color: TEXT }}>{context.email}</strong>
                </p>
              </div>

              {submitErr && (
                <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 13 }}>
                  {submitErr}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>First Name</label>
                    <input
                      {...register('firstName', { required: 'Required', minLength: { value: 2, message: 'Min 2 chars' } })}
                      placeholder="Jane"
                      style={inp}
                    />
                    {errors.firstName && <p style={errTxt}>{errors.firstName.message}</p>}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Last Name</label>
                    <input
                      {...register('lastName', { required: 'Required', minLength: { value: 2, message: 'Min 2 chars' } })}
                      placeholder="Smith"
                      style={inp}
                    />
                    {errors.lastName && <p style={errTxt}>{errors.lastName.message}</p>}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      {...register('password', {
                        required: 'Password is required',
                        minLength: { value: 8, message: 'At least 8 characters' },
                        pattern: { value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, message: 'Must include uppercase, lowercase, number & special character' },
                      })}
                      type={showPwd ? 'text' : 'password'}
                      placeholder="••••••••"
                      style={{ ...inp, paddingRight: 40 }}
                    />
                    <button type="button" onClick={() => setShowPwd(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: MUTED, cursor: 'pointer', padding: 0 }}>
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {errors.password && <p style={errTxt}>{errors.password.message}</p>}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Confirm Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      {...register('confirm', {
                        required: 'Please confirm your password',
                        validate: v => v === pwdValue || 'Passwords do not match',
                      })}
                      type={showConf ? 'text' : 'password'}
                      placeholder="••••••••"
                      style={{ ...inp, paddingRight: 40 }}
                    />
                    <button type="button" onClick={() => setShowConf(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: MUTED, cursor: 'pointer', padding: 0 }}>
                      {showConf ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {errors.confirm && <p style={errTxt}>{errors.confirm.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{ marginTop: 8, padding: '12px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg,${ACCENT},#a78bfa)`, color: '#fff', fontSize: 15, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  {submitting ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Joining…</> : 'Join Workspace'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
