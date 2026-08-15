import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setCredentials } from '../../store/authSlice.js';
import { login } from '../../services/authService.js';
import { Zap } from 'lucide-react';
import ThemeToggle from '../../components/common/ThemeToggle.jsx';

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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 font-sans text-text-primary">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[420px] bg-surface border border-border rounded-2xl shadow-sm p-8 sm:p-10">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br from-primary to-emerald-400 shadow-sm">
            <Zap size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">TenantFlow</h1>
          <p className="text-sm text-text-muted">Multi-Tenant SaaS Billing Engine</p>
        </div>

        <h2 className="text-lg font-semibold mb-6 text-center">Sign in to your account</h2>

        {serverError && (
          <div className="mb-6 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium text-center">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary">Email address</label>
            <input
              id="email"
              type="email"
              className={`form-input ${errors.email ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
              placeholder="you@company.com"
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email format' },
              })}
            />
            {errors.email && <span className="text-xs font-medium text-danger">{errors.email.message}</span>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary">Password</label>
            <input
              id="password"
              type="password"
              className={`form-input ${errors.password ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
              placeholder="••••••••"
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'Password must be at least 8 characters' },
              })}
            />
            {errors.password && <span className="text-xs font-medium text-danger">{errors.password.message}</span>}
          </div>

          <div className="flex justify-end pt-1">
            <Link
              to={`/forgot-password${typedEmail ? `?email=${encodeURIComponent(typedEmail)}` : ''}`}
              className="text-sm font-medium text-primary hover:text-primary-hover transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          <button
            id="login-btn"
            type="submit"
            className="w-full py-2.5 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-base font-semibold mt-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-white mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : 'Sign In'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-text-muted">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-primary hover:text-primary-hover transition-colors">Create one</Link>
        </p>
      </div>
    </div>
  );
}
