import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { register as registerApi, verifyOtp } from '../../services/authService.js';
import { Zap } from 'lucide-react';
import ThemeToggle from '../../components/common/ThemeToggle.jsx';

export default function RegisterPage() {
  const [step, setStep] = useState(1); // 1=account info, 2=verify OTP
  const [email, setEmail] = useState('');
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm();
  const { register: registerOtp, handleSubmit: handleOtpSubmit, formState: { errors: otpErrors } } = useForm();

  const onRegister = async (data) => {
    setLoading(true);
    setServerError('');
    try {
      // Backend expects: { firstName, lastName, email, password, companyName }
      await registerApi({
        firstName:   data.firstName,
        lastName:    data.lastName,
        email:       data.email,
        password:    data.password,
        companyName: data.companyName,
      });
      setEmail(data.email);
      setStep(2);
    } catch (err) {
      const msg = err.response?.data?.message           // top-level message
        || err.response?.data?.error?.message           // { error: { message } } shape
        || err.response?.data?.errors?.[0]?.message     // validation array shape
        || 'Registration failed. Please try again.';
      setServerError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async (data) => {
    setLoading(true);
    setServerError('');
    try {
      await verifyOtp({ email, otp: data.otp });
      navigate('/login?verified=true');
    } catch (err) {
      setServerError(err.response?.data?.message || 'Invalid or expired OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 font-sans text-text-primary">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[480px] bg-surface border border-border rounded-2xl shadow-sm p-8 sm:p-10">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br from-primary to-emerald-400 shadow-sm">
            <Zap size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">TenantFlow</h1>
        </div>

        <div className="flex items-center justify-center gap-3 mb-8">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step >= 1 ? 'bg-primary text-white' : 'bg-surface-secondary text-text-muted border border-border'}`}>1</div>
          <div className="w-12 h-px bg-border" />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step >= 2 ? 'bg-primary text-white' : 'bg-surface-secondary text-text-muted border border-border'}`}>2</div>
        </div>

        {serverError && <div className="mb-6 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium text-center">{serverError}</div>}

        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold mb-6 text-center">Create your account</h2>
            <form onSubmit={handleSubmit(onRegister)} className="space-y-5">
              
              <div className="flex gap-4">
                <div className="space-y-1.5 flex-1">
                  <label htmlFor="firstName" className="block text-sm font-medium text-text-secondary">First Name</label>
                  <input
                    id="firstName"
                    type="text"
                    className={`form-input ${errors.firstName ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
                    placeholder="John"
                    {...register('firstName', {
                      required: 'First name is required',
                      minLength: { value: 2, message: 'Minimum 2 characters' },
                      pattern: { value: /^[a-zA-Z\s'-]+$/, message: 'Letters only' },
                    })}
                  />
                  {errors.firstName && <span className="text-xs font-medium text-danger">{errors.firstName.message}</span>}
                </div>

                <div className="space-y-1.5 flex-1">
                  <label htmlFor="lastName" className="block text-sm font-medium text-text-secondary">Last Name</label>
                  <input
                    id="lastName"
                    type="text"
                    className={`form-input ${errors.lastName ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
                    placeholder="Doe"
                    {...register('lastName', {
                      required: 'Last name is required',
                      minLength: { value: 2, message: 'Minimum 2 characters' },
                      pattern: { value: /^[a-zA-Z\s'-]+$/, message: 'Letters only' },
                    })}
                  />
                  {errors.lastName && <span className="text-xs font-medium text-danger">{errors.lastName.message}</span>}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="companyName" className="block text-sm font-medium text-text-secondary">Company Name</label>
                <input
                  id="companyName"
                  type="text"
                  className={`form-input ${errors.companyName ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
                  placeholder="Acme Corp"
                  {...register('companyName', {
                    required: 'Company name is required',
                    minLength: { value: 2, message: 'Minimum 2 characters' },
                  })}
                />
                {errors.companyName && <span className="text-xs font-medium text-danger">{errors.companyName.message}</span>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-text-secondary">Work Email</label>
                <input
                  id="email"
                  type="email"
                  className={`form-input ${errors.email ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
                  placeholder="you@company.com"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
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
                  placeholder="Min. 8 chars with uppercase, number & symbol"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Minimum 8 characters' },
                    pattern: {
                      value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#\-_]).+$/,
                      message: 'Must contain uppercase, lowercase, number & special character (@$!%*?&)',
                    },
                  })}
                />
                {errors.password && <span className="text-xs font-medium text-danger">{errors.password.message}</span>}
              </div>

              <button id="register-btn" type="submit" className="w-full py-2.5 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-base font-semibold mt-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed" disabled={loading}>
                {loading ? (
                  <svg className="animate-spin h-5 w-5 text-white mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : 'Create Account \u2192'}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-text-muted">
              Already have an account? <Link to="/login" className="font-medium text-primary hover:text-primary-hover transition-colors">Sign in</Link>
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold mb-2 text-center">Verify your email</h2>
            <p className="text-sm text-text-muted text-center mb-6">We sent a 6-digit OTP to <strong className="text-text-primary">{email}</strong></p>
            <form onSubmit={handleOtpSubmit(onVerifyOtp)} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="otp" className="block text-sm font-medium text-text-secondary">One-Time Password (OTP)</label>
                <input
                  id="otp"
                  type="text"
                  className={`form-input text-center text-lg tracking-widest font-mono ${otpErrors.otp ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
                  placeholder="123456"
                  maxLength={6}
                  {...registerOtp('otp', {
                    required: 'OTP is required',
                    pattern: { value: /^\d{6}$/, message: 'Must be 6 digits' },
                  })}
                />
                {otpErrors.otp && <span className="text-xs font-medium text-danger">{otpErrors.otp.message}</span>}
              </div>
              <button id="verify-btn" type="submit" className="w-full py-2.5 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-base font-semibold mt-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed" disabled={loading}>
                {loading ? (
                  <svg className="animate-spin h-5 w-5 text-white mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : 'Verify Email'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
