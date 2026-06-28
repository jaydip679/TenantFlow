import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../../services/authService.js';

export default function ForgotPasswordPage() {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState('');

  const onSubmit = async (data) => {
    setLoading(true);
    setServerError('');
    try {
      await forgotPassword(data);
      setSuccess(true);
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

        {success ? (
          <div className="alert alert-success">
            <p>Password reset email sent! Check your inbox for instructions.</p>
            <Link to="/login" className="link-primary" style={{ display: 'block', marginTop: 12 }}>Back to Login</Link>
          </div>
        ) : (
          <>
            <p className="auth-hint">Enter your email and we&apos;ll send you a reset OTP.</p>
            {serverError && <div className="alert alert-danger">{serverError}</div>}

            <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
              <div className="form-group">
                <label className="form-label">Email address</label>
                <input
                  id="email"
                  type="email"
                  className={`form-input ${errors.email ? 'is-invalid' : ''}`}
                  placeholder="you@company.com"
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
          </>
        )}
      </div>
    </div>
  );
}
