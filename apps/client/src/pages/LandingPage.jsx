import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Zap, Shield, BarChart3, Bell, Users, Brain,
  ArrowRight, Check, ChevronRight,
} from 'lucide-react';
import ThemeToggle from '../components/common/ThemeToggle.jsx';

/* ── Static data ─────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: <Zap size={22} />,
    color: 'text-primary',
    bg:    'bg-primary/10',
    title: 'Smart Billing',
    desc:  'Automatic invoicing, proration, and plan upgrades. Powered by Razorpay with HMAC-verified webhooks.',
  },
  {
    icon: <Brain size={22} />,
    color: 'text-accent',
    bg:    'bg-accent/10',
    title: 'AI Churn Insights',
    desc:  'Nightly AI analysis predicts which tenants are at risk. Proactive outreach emails sent automatically.',
  },
  {
    icon: <BarChart3 size={22} />,
    color: 'text-blue-500',
    bg:    'bg-blue-500/10',
    title: 'Revenue Analytics',
    desc:  'Live MRR, ARR, churn rate, and subscription counts — all in one admin dashboard.',
  },
  {
    icon: <Bell size={22} />,
    color: 'text-warning',
    bg:    'bg-warning/10',
    title: 'Real-Time Notifications',
    desc:  'Socket.IO-powered instant alerts for payments, dunning, and plan changes.',
  },
  {
    icon: <Users size={22} />,
    color: 'text-emerald-500',
    bg:    'bg-emerald-500/10',
    title: 'Team Management',
    desc:  'Invite members, assign roles, and manage seat limits per plan with fine-grained access control.',
  },
  {
    icon: <Shield size={22} />,
    color: 'text-danger',
    bg:    'bg-danger/10',
    title: 'Dunning Automation',
    desc:  '4-step dunning state machine: 0, 3, 7, and 14-day retry attempts with tenant suspension.',
  },
];

const PLANS = [
  {
    name: 'Starter',
    price: '₹999',
    interval: 'mo',
    features: ['Up to 5 seats', 'Invoice generation', 'Basic analytics', 'Email notifications'],
    cta: 'Get Started',
    featured: false,
  },
  {
    name: 'Growth',
    price: '₹2,499',
    interval: 'mo',
    features: ['Up to 25 seats', 'Everything in Starter', 'AI billing assistant', 'Advanced analytics', 'Priority support'],
    cta: 'Start Free Trial',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: '₹7,999',
    interval: 'mo',
    features: ['Unlimited seats', 'Everything in Growth', 'API access', 'Dedicated support', 'Custom integrations'],
    cta: 'Contact Sales',
    featured: false,
  },
];

/* ── Landing Page ────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useSelector((s) => s.auth);

  // Redirect authenticated users to their dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate(user?.role === 'super_admin' ? '/admin' : '/dashboard', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const heroRef = useRef(null);

  return (
    <div className="min-h-screen bg-background text-text-primary overflow-x-hidden font-sans">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 bg-surface/90 backdrop-blur-md border-b border-border px-6 md:px-12 lg:px-20 h-16 flex items-center justify-between transition-colors duration-200">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center font-extrabold text-[15px] text-white bg-gradient-to-br from-primary to-emerald-400 shadow-sm shrink-0">
            TF
          </div>
          <span className="font-bold text-lg tracking-tight">TenantFlow</span>
        </div>

        {/* Nav links (desktop) */}
        <div className="hidden md:flex gap-8 items-center">
          {['Features', 'Pricing'].map((label) => (
            <a key={label}
              href={`#${label.toLowerCase()}`}
              className="text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
            >{label}</a>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            id="nav-login"
            className="hidden sm:inline-flex items-center justify-center px-4 py-2 rounded-lg border border-transparent bg-transparent text-text-muted hover:text-text-primary hover:bg-surface-secondary cursor-pointer text-sm font-semibold transition-colors"
            onClick={() => navigate('/login')}
          >
            Sign in
          </button>
          <button
            id="nav-signup"
            className="px-4 py-2 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-sm font-semibold transition-colors flex items-center justify-center gap-1"
            onClick={() => navigate('/register')}
          >
            Get started &rarr;
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section ref={heroRef} className="py-20 md:py-28 px-6 md:px-12 lg:px-20 text-center relative overflow-hidden">
        {/* Background glow blobs */}
        <div className="absolute -top-[20%] left-[30%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(22,163,74,0.08)_0%,transparent_70%)] pointer-events-none" />
        <div className="absolute -bottom-[10%] right-[20%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.06)_0%,transparent_70%)] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto">
          {/* Badge */}
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary mb-6 tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            Razorpay · Socket.IO · OpenAI &mdash; Production ready
          </span>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6 text-transparent bg-clip-text bg-gradient-to-br from-text-primary via-text-primary to-text-muted">
            SaaS billing that<br />runs itself
          </h1>

          <p className="text-base md:text-lg text-text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            TenantFlow handles invoicing, dunning, plan upgrades, AI churn analysis, and real-time notifications &mdash; so you can focus on your product.
          </p>

          <div className="flex flex-wrap gap-3 justify-center">
            <button
              id="hero-cta-signup"
              className="px-7 py-3 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-base font-semibold transition-colors flex items-center justify-center gap-2"
              onClick={() => navigate('/register')}
            >
              Start free trial <ArrowRight size={18} />
            </button>
            <button
              id="hero-cta-login"
              className="px-7 py-3 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-base font-semibold transition-colors flex items-center justify-center"
              onClick={() => navigate('/login')}
            >
              Sign in to dashboard
            </button>
          </div>

          <p className="mt-5 text-sm text-text-muted/70">
            No credit card required &middot; 14-day free trial
          </p>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 md:py-24 px-6 md:px-12 lg:px-20 bg-surface-secondary/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3 text-text-primary">
              Everything you need, nothing you don&apos;t
            </h2>
            <p className="text-base text-text-muted max-w-xl mx-auto">
              A complete billing infrastructure stack built for modern SaaS teams.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="p-6 bg-surface border border-border rounded-2xl transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${f.bg} ${f.color}`}>
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold mb-2 text-text-primary">{f.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 md:py-24 px-6 md:px-12 lg:px-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3 text-text-primary">
              Simple, transparent pricing
            </h2>
            <p className="text-base text-text-muted">
              Start free, scale as you grow. Cancel anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {PLANS.map((plan) => (
              <div key={plan.name} className={`p-8 rounded-3xl relative transition-all duration-200 ${
                plan.featured 
                  ? 'bg-primary/5 border border-primary/30 shadow-xl shadow-primary/10 md:-translate-y-4' 
                  : 'bg-surface border border-border'
              }`}>
                {plan.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary to-emerald-500 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                )}

                <p className="font-bold text-sm text-text-muted uppercase tracking-wider mb-3">
                  {plan.name}
                </p>
                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-4xl md:text-5xl font-extrabold tracking-tight text-text-primary">{plan.price}</span>
                  <span className="text-sm font-medium text-text-muted">/{plan.interval}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-text-secondary">
                      <Check size={16} className="text-primary shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  id={`plan-cta-${plan.name.toLowerCase()}`}
                  className={`w-full py-2.5 rounded-lg border cursor-pointer text-sm font-semibold transition-colors flex items-center justify-center gap-1 ${
                    plan.featured 
                      ? 'border-none bg-primary hover:bg-primary-hover text-white' 
                      : 'border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted'
                  }`}
                  onClick={() => navigate('/register')}
                >
                  {plan.cta} {plan.featured && <ChevronRight size={16} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-8 px-6 md:px-12 lg:px-20 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md flex items-center justify-center font-bold text-[11px] text-white bg-gradient-to-br from-primary to-emerald-400">
            TF
          </div>
          <span className="font-semibold text-sm text-text-primary">TenantFlow</span>
        </div>
        <p className="text-xs text-text-muted text-center">
          &copy; {new Date().getFullYear()} TenantFlow. Built with Node.js, React, Razorpay &amp; OpenAI.
        </p>
        <div className="flex gap-6">
          {['Privacy', 'Terms', 'Docs'].map((l) => (
            <a key={l} href="#" className="text-sm text-text-muted hover:text-text-primary transition-colors">
              {l}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
