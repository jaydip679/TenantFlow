import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../../services/authService.js';

export default function ResetPasswordPage() {
  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const emailFromQuery = searchParams.get('email') || '';

  const onSubmit = async (data) => {
    setLoading(true);
    setServerError('');
    try {
      await resetPassword({ email: data.email, otp: data.otp, newPassword: data.newPassword });
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
            {serverError && <div className="alert alert-danger">{serverError}</div>}
            <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
              <div className="form-group">
                <label className="form-label">Email address</label>
                <input
                  id="email"
                  type="email"
                  className={`form-input ${errors.email ? 'is-invalid' : ''}`}
                  defaultValue={emailFromQuery}
                  {...register('email', { required: 'Email is required' })}
                />
                {errors.email && <span className="form-error">{errors.email.message}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">OTP (from email)</label>
                <input
                  id="otp"
                  type="text"
                  className={`form-input ${errors.otp ? 'is-invalid' : ''}`}
                  placeholder="123456"
                  maxLength={6}
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
                  placeholder="Min. 8 characters"
                  {...register('newPassword', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Minimum 8 characters' },
                    pattern: {
                      value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                      message: 'Must contain uppercase, lowercase, and number',
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
