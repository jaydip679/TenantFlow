import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { register as registerApi, verifyOtp } from '../../services/authService.js';

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
    <div className="auth-page">
      <div className="auth-card card">
        <div className="auth-logo">
          <div className="logo-mark">TF</div>
          <h1 className="auth-title">TenantFlow</h1>
        </div>

        <div className="step-indicator">
          <div className={`step ${step >= 1 ? 'active' : ''}`}>1</div>
          <div className="step-line" />
          <div className={`step ${step >= 2 ? 'active' : ''}`}>2</div>
        </div>

        {serverError && <div className="alert alert-danger">{serverError}</div>}

        {step === 1 && (
          <>
            <h2 className="form-section-title">Create your account</h2>
            <form onSubmit={handleSubmit(onRegister)} className="auth-form">

              {/* First Name + Last Name side by side */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input
                    id="firstName"
                    type="text"
                    className={`form-input ${errors.firstName ? 'is-invalid' : ''}`}
                    placeholder="John"
                    {...register('firstName', {
                      required: 'First name is required',
                      minLength: { value: 2, message: 'Minimum 2 characters' },
                      pattern: { value: /^[a-zA-Z\s'-]+$/, message: 'Letters only' },
                    })}
                  />
                  {errors.firstName && <span className="form-error">{errors.firstName.message}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input
                    id="lastName"
                    type="text"
                    className={`form-input ${errors.lastName ? 'is-invalid' : ''}`}
                    placeholder="Doe"
                    {...register('lastName', {
                      required: 'Last name is required',
                      minLength: { value: 2, message: 'Minimum 2 characters' },
                      pattern: { value: /^[a-zA-Z\s'-]+$/, message: 'Letters only' },
                    })}
                  />
                  {errors.lastName && <span className="form-error">{errors.lastName.message}</span>}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Company Name</label>
                <input
                  id="companyName"
                  type="text"
                  className={`form-input ${errors.companyName ? 'is-invalid' : ''}`}
                  placeholder="Acme Corp"
                  {...register('companyName', {
                    required: 'Company name is required',
                    minLength: { value: 2, message: 'Minimum 2 characters' },
                  })}
                />
                {errors.companyName && <span className="form-error">{errors.companyName.message}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Work Email</label>
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

              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  id="password"
                  type="password"
                  className={`form-input ${errors.password ? 'is-invalid' : ''}`}
                  placeholder="Min. 8 chars with uppercase, number & symbol"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Minimum 8 characters' },
                    pattern: {
                      // Must match backend Joi: uppercase + lowercase + digit + special char
                      value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#\-_]).+$/,
                      message: 'Must contain uppercase, lowercase, number & special character (@$!%*?&)',
                    },
                  })}
                />
                {errors.password && <span className="form-error">{errors.password.message}</span>}
              </div>

              <button id="register-btn" type="submit" className="btn-primary btn-full" disabled={loading}>
                {loading ? <span className="btn-spinner" /> : 'Create Account →'}
              </button>
            </form>

            <p className="auth-switch">
              Already have an account? <Link to="/login" className="link-primary">Sign in</Link>
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="form-section-title">Verify your email</h2>
            <p className="auth-hint">We sent a 6-digit OTP to <strong>{email}</strong></p>
            <form onSubmit={handleOtpSubmit(onVerifyOtp)} className="auth-form">
              <div className="form-group">
                <label className="form-label">One-Time Password (OTP)</label>
                <input
                  id="otp"
                  type="text"
                  className={`form-input otp-input ${otpErrors.otp ? 'is-invalid' : ''}`}
                  placeholder="123456"
                  maxLength={6}
                  {...registerOtp('otp', {
                    required: 'OTP is required',
                    pattern: { value: /^\d{6}$/, message: 'Must be 6 digits' },
                  })}
                />
                {otpErrors.otp && <span className="form-error">{otpErrors.otp.message}</span>}
              </div>
              <button id="verify-btn" type="submit" className="btn-primary btn-full" disabled={loading}>
                {loading ? <span className="btn-spinner" /> : 'Verify Email'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
