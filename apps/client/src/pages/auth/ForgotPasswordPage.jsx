import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { forgotPassword } from '../../services/authService.js';

export default function ForgotPasswordPage() {
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();

  // Email pre-filled from login page (if user clicked "Forgot password?" after typing their email)
  const emailFromLogin  = searchParams.get('email') || '';

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { email: emailFromLogin },
  });

  const [loading, setLoading]         = useState(false);
  const [serverError, setServerError] = useState('');

  const onSubmit = async (data) => {
    setLoading(true);
    setServerError('');
    try {
      await forgotPassword({ email: data.email });
      // Pass the exact email OTP was sent to — locked on the next page
      navigate(`/reset-password?email=${encodeURIComponent(data.email)}`);
    } catch (err) {
      setServerError(err.response?.data?.message || 'Failed to send reset email.');
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

        <h2 className="form-section-title">Reset your password</h2>
        <p className="auth-hint">
          {emailFromLogin
            ? `We'll send a 6-digit OTP to the email below.`
            : `Enter your email and we'll send you a 6-digit OTP.`}
        </p>

        {serverError && <div className="alert alert-danger">{serverError}</div>}

        <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input
              id="email"
              type="email"
              className={`form-input ${errors.email ? 'is-invalid' : ''}`}
              placeholder="you@company.com"
              // If email came from login form, lock it — user should reset their own account
              readOnly={!!emailFromLogin}
              style={emailFromLogin ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
              })}
            />
            {errors.email && <span className="form-error">{errors.email.message}</span>}
          </div>

          <button id="forgot-btn" type="submit" className="btn-primary btn-full" disabled={loading}>
            {loading ? <span className="btn-spinner" /> : 'Send Reset OTP'}
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/login" className="link-subtle">← Back to login</Link>
        </p>
      </div>
    </div>
  );
}
