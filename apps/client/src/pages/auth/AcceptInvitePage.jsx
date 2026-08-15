import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import api from '../../services/api.js';
import { Zap, CheckCircle2, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import ThemeToggle from '../../components/common/ThemeToggle.jsx';

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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 font-sans text-text-primary">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[440px]">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center shadow-sm">
            <Zap size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">TenantFlow</span>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-8 sm:p-9 shadow-sm backdrop-blur-md">
          {/* Loading context */}
          {ctxLoading && (
            <div className="text-center py-8 text-text-muted">
              <Loader2 size={32} className="animate-spin mx-auto mb-3" />
              <p className="m-0 text-sm">Validating your invitation…</p>
            </div>
          )}

          {/* Invalid token */}
          {!ctxLoading && ctxError && (
            <div className="text-center">
              <AlertCircle size={40} className="text-danger mx-auto mb-4" />
              <h2 className="m-0 mb-2 text-xl font-bold text-text-primary">Invite Invalid</h2>
              <p className="m-0 mb-6 text-sm text-text-muted leading-relaxed">{ctxError}</p>
              <button onClick={() => navigate('/login')} className="px-6 py-2.5 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-sm font-semibold transition-colors">
                Go to Login
              </button>
            </div>
          )}

          {/* Success */}
          {!ctxLoading && !ctxError && done && (
            <div className="text-center">
              <CheckCircle2 size={48} className="text-success mx-auto mb-4" />
              <h2 className="m-0 mb-2 text-xl font-bold text-text-primary">You&apos;re in!</h2>
              <p className="m-0 mb-2 text-sm text-text-muted">
                Your account has been created. You can now log in to <strong className="text-text-primary">{context?.tenantName}</strong>.
              </p>
              <button onClick={() => navigate('/login')} className="mt-6 px-6 py-2.5 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-sm font-semibold transition-colors">
                Log In Now
              </button>
            </div>
          )}

          {/* Form */}
          {!ctxLoading && !ctxError && !done && context && (
            <>
              <div className="mb-7">
                <h1 className="m-0 mb-1.5 text-2xl font-bold text-text-primary">Accept Invitation</h1>
                <p className="m-0 text-[13px] text-text-muted">
                  You&apos;ve been invited to join <strong className="text-text-primary">{context.tenantName}</strong> as{' '}
                  <strong className="text-primary">{ROLE_LABELS[context.role] || context.role}</strong>.
                </p>
                <p className="m-0 mt-1.5 text-xs text-text-muted">
                  Joining as <strong className="text-text-primary">{context.email}</strong>
                </p>
              </div>

              {submitErr && (
                <div className="mb-4 p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-danger text-[13px]">
                  {submitErr}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-[0.06em] mb-1.5">First Name</label>
                    <input
                      {...register('firstName', { required: 'Required', minLength: { value: 2, message: 'Min 2 chars' } })}
                      placeholder="Jane"
                      className={`form-input ${errors.firstName ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
                    />
                    {errors.firstName && <p className="text-danger text-xs mt-1">{errors.firstName.message}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-[0.06em] mb-1.5">Last Name</label>
                    <input
                      {...register('lastName', { required: 'Required', minLength: { value: 2, message: 'Min 2 chars' } })}
                      placeholder="Smith"
                      className={`form-input ${errors.lastName ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
                    />
                    {errors.lastName && <p className="text-danger text-xs mt-1">{errors.lastName.message}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-[0.06em] mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      {...register('password', {
                        required: 'Password is required',
                        minLength: { value: 8, message: 'At least 8 characters' },
                        pattern: { value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, message: 'Must include uppercase, lowercase, number & special character' },
                      })}
                      type={showPwd ? 'text' : 'password'}
                      placeholder="••••••••"
                      className={`form-input pr-10 ${errors.password ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
                    />
                    <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-text-muted cursor-pointer p-0">
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {errors.password && <p className="text-danger text-xs mt-1">{errors.password.message}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-[0.06em] mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <input
                      {...register('confirm', {
                        required: 'Please confirm your password',
                        validate: v => v === pwdValue || 'Passwords do not match',
                      })}
                      type={showConf ? 'text' : 'password'}
                      placeholder="••••••••"
                      className={`form-input pr-10 ${errors.confirm ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
                    />
                    <button type="button" onClick={() => setShowConf(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-text-muted cursor-pointer p-0">
                      {showConf ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {errors.confirm && <p className="text-danger text-xs mt-1">{errors.confirm.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 py-3 rounded-lg border-none bg-primary hover:bg-primary-hover text-white text-[15px] font-semibold cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {submitting ? <><Loader2 size={16} className="animate-spin" /> Joining…</> : 'Join Workspace'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
