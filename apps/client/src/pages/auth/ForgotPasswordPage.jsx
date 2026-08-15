import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { forgotPassword } from '../../services/authService.js';
import { Zap } from 'lucide-react';
import ThemeToggle from '../../components/common/ThemeToggle.jsx';

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

        <h2 className="text-lg font-semibold mb-2 text-center">Reset your password</h2>
        <p className="text-sm text-text-muted text-center mb-6">
          {emailFromLogin
            ? `We'll send a 6-digit OTP to the email below.`
            : `Enter your email and we'll send you a 6-digit OTP.`}
        </p>

        {serverError && <div className="mb-6 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium text-center">{serverError}</div>}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary">Email address</label>
            <input
              id="email"
              type="email"
              className={`form-input ${errors.email ? 'border-danger focus:border-danger focus:ring-danger' : ''} ${emailFromLogin ? 'opacity-70 cursor-not-allowed' : ''}`}
              placeholder="you@company.com"
              // If email came from login form, lock it — user should reset their own account
              readOnly={!!emailFromLogin}
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
              })}
            />
            {errors.email && <span className="text-xs font-medium text-danger">{errors.email.message}</span>}
          </div>

          <button id="forgot-btn" type="submit" className="w-full py-2.5 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-base font-semibold mt-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed" disabled={loading}>
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-white mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : 'Send Reset OTP'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm">
          <Link to="/login" className="font-medium text-text-muted hover:text-text-primary transition-colors">&larr; Back to login</Link>
        </p>
      </div>
    </div>
  );
}
