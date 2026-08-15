import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../../services/authService.js';
import { Zap } from 'lucide-react';
import ThemeToggle from '../../components/common/ThemeToggle.jsx';

export default function ResetPasswordPage() {
  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const [loading, setLoading]         = useState(false);
  const [success, setSuccess]         = useState(false);
  const [serverError, setServerError] = useState('');
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();

  // Email is locked — comes from the forgot-password step via URL param.
  // User cannot change it here; OTP is tied to this exact email on the backend.
  const lockedEmail = searchParams.get('email') || '';

  // If no email in URL the user landed here directly — redirect them to forgot-password
  if (!lockedEmail) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 font-sans text-text-primary">
        <div className="w-full max-w-[420px] bg-surface border border-border rounded-2xl shadow-sm p-8 text-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 mx-auto bg-gradient-to-br from-primary to-emerald-400 shadow-sm">
            <Zap size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-6">TenantFlow</h1>
          <div className="p-4 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium">
            No email found. Please start from the{' '}
            <Link to="/forgot-password" className="underline font-semibold hover:text-danger-dark">Forgot Password</Link> page.
          </div>
        </div>
      </div>
    );
  }

  const onSubmit = async (data) => {
    setLoading(true);
    setServerError('');
    try {
      // Always use the locked email — not whatever the user might type
      await resetPassword({ email: lockedEmail, otp: data.otp, newPassword: data.newPassword });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setServerError(err.response?.data?.message || 'Reset failed. Check your OTP and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 font-sans text-text-primary">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[420px] bg-surface border border-border rounded-2xl shadow-sm p-8 sm:p-10">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br from-primary to-emerald-400 shadow-sm">
            <Zap size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">TenantFlow</h1>
        </div>

        <h2 className="text-lg font-semibold mb-6 text-center">Set new password</h2>

        {success ? (
          <div className="p-4 rounded-lg bg-success/10 border border-success/20 text-success text-sm font-medium text-center">
            Password reset successfully! Redirecting to login…
          </div>
        ) : (
          <>
            <div className="mb-6">
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Sending OTP to</label>
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-surface-secondary border border-border rounded-lg text-sm">
                <span className="font-medium text-text-primary truncate mr-2">{lockedEmail}</span>
                <Link to="/forgot-password" className="text-primary hover:text-primary-hover font-medium shrink-0">
                  Change
                </Link>
              </div>
              <span className="text-xs text-text-muted mt-1.5 block">Check your inbox for the 6-digit code</span>
            </div>

            {serverError && <div className="mb-6 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium text-center">{serverError}</div>}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="otp" className="block text-sm font-medium text-text-secondary">OTP (from email)</label>
                <input
                  id="otp"
                  type="text"
                  className={`form-input text-center text-lg tracking-widest font-mono ${errors.otp ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
                  placeholder="123456"
                  maxLength={6}
                  autoFocus
                  {...register('otp', {
                    required: 'OTP is required',
                    pattern: { value: /^\d{6}$/, message: 'Must be 6 digits' },
                  })}
                />
                {errors.otp && <span className="text-xs font-medium text-danger">{errors.otp.message}</span>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="newPassword" className="block text-sm font-medium text-text-secondary">New Password</label>
                <input
                  id="newPassword"
                  type="password"
                  className={`form-input ${errors.newPassword ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
                  placeholder="Min. 8 chars with uppercase, number & symbol"
                  {...register('newPassword', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Minimum 8 characters' },
                    pattern: {
                      value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#\-_]).+$/,
                      message: 'Must contain uppercase, lowercase, number & special character (@$!%*?&)',
                    },
                  })}
                />
                {errors.newPassword && <span className="text-xs font-medium text-danger">{errors.newPassword.message}</span>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-secondary">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  className={`form-input ${errors.confirmPassword ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
                  placeholder="Repeat new password"
                  {...register('confirmPassword', {
                    required: 'Please confirm password',
                    validate: (v) => v === watch('newPassword') || 'Passwords do not match',
                  })}
                />
                {errors.confirmPassword && <span className="text-xs font-medium text-danger">{errors.confirmPassword.message}</span>}
              </div>

              <button id="reset-btn" type="submit" className="w-full py-2.5 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-base font-semibold mt-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed" disabled={loading}>
                {loading ? (
                  <svg className="animate-spin h-5 w-5 text-white mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : 'Reset Password'}
              </button>
            </form>

            <p className="mt-8 text-center text-sm">
              <Link to="/login" className="font-medium text-text-muted hover:text-text-primary transition-colors">&larr; Back to login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
