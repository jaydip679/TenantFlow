import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../../services/authService.js';

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
      <div className="auth-page">
        <div className="auth-card card">
          <div className="auth-logo">
            <div className="logo-mark">TF</div>
            <h1 className="auth-title">TenantFlow</h1>
          </div>
          <div className="alert alert-danger">
            No email found. Please start from the{' '}
            <Link to="/forgot-password" className="link-primary">Forgot Password</Link> page.
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
    <div className="auth-page">
      <div className="auth-card card">
        <div className="auth-logo">
          <div className="logo-mark">TF</div>
          <h1 className="auth-title">TenantFlow</h1>
        </div>

        <h2 className="form-section-title">Set new password</h2>

        {success ? (
          <div className="alert alert-success">
            Password reset successfully! Redirecting to login…
          </div>
        ) : (
          <>
            {/* Show locked email — read-only, not an input */}
            <div className="form-group">
              <label className="form-label">Sending OTP to</label>
              <div className="form-input-locked">
                <span className="locked-email">{lockedEmail}</span>
                <Link to="/forgot-password" className="link-subtle locked-change">
                  Change
                </Link>
              </div>
              <span className="form-hint">Check your inbox for the 6-digit code</span>
            </div>

            {serverError && <div className="alert alert-danger">{serverError}</div>}

            <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
              <div className="form-group">
                <label className="form-label">OTP (from email)</label>
                <input
                  id="otp"
                  type="text"
                  className={`form-input otp-input ${errors.otp ? 'is-invalid' : ''}`}
                  placeholder="123456"
                  maxLength={6}
                  autoFocus
                  {...register('otp', {
                    required: 'OTP is required',
                    pattern: { value: /^\d{6}$/, message: 'Must be 6 digits' },
                  })}
                />
                {errors.otp && <span className="form-error">{errors.otp.message}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  id="newPassword"
                  type="password"
                  className={`form-input ${errors.newPassword ? 'is-invalid' : ''}`}
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
                {errors.newPassword && <span className="form-error">{errors.newPassword.message}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  className={`form-input ${errors.confirmPassword ? 'is-invalid' : ''}`}
                  placeholder="Repeat new password"
                  {...register('confirmPassword', {
                    required: 'Please confirm password',
                    validate: (v) => v === watch('newPassword') || 'Passwords do not match',
                  })}
                />
                {errors.confirmPassword && <span className="form-error">{errors.confirmPassword.message}</span>}
              </div>

              <button id="reset-btn" type="submit" className="btn-primary btn-full" disabled={loading}>
                {loading ? <span className="btn-spinner" /> : 'Reset Password'}
              </button>
            </form>

            <p className="auth-switch">
              <Link to="/login" className="link-subtle">← Back to login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
