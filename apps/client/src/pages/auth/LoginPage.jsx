import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setCredentials } from '../../store/authSlice.js';
import { login } from '../../services/authService.js';

export default function LoginPage() {
  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const typedEmail = watch('email') || '';  // track what user typed
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const onSubmit = async (data) => {
    setLoading(true);
    setServerError('');
    try {
      const res = await login(data);
      const { user, accessToken } = res.data.data;
      dispatch(setCredentials({ user, accessToken }));
      if (user.role === 'super_admin') navigate('/admin');
      else navigate('/dashboard');
    } catch (err) {
      setServerError(err.response?.data?.message || 'Login failed. Please try again.');
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
          <p className="auth-subtitle">Multi-Tenant SaaS Billing Engine</p>
        </div>

        <h2 className="form-section-title">Sign in to your account</h2>

        {serverError && (
          <div className="alert alert-danger">
            <span>{serverError}</span>
          </div>
        )}

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
                pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email format' },
              })}
            />
            {errors.email && <span className="form-error">{errors.email.message}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              id="password"
              type="password"
              className={`form-input ${errors.password ? 'is-invalid' : ''}`}
              placeholder="••••••••"
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'Password must be at least 8 characters' },
              })}
            />
            {errors.password && <span className="form-error">{errors.password.message}</span>}
          </div>

          <div className="form-footer">
            <Link
              to={`/forgot-password${typedEmail ? `?email=${encodeURIComponent(typedEmail)}` : ''}`}
              className="link-subtle"
            >
              Forgot password?
            </Link>
          </div>

          <button
            id="login-btn"
            type="submit"
            className="btn-primary btn-full"
            disabled={loading}
          >
            {loading ? <span className="btn-spinner" /> : 'Sign In'}
          </button>
        </form>

        <p className="auth-switch">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="link-primary">Create one</Link>
        </p>
      </div>
    </div>
  );
}
