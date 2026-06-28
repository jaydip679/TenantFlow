import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Zap, Shield, BarChart3, Bell, Users, Brain,
  ArrowRight, Check, ChevronRight,
} from 'lucide-react';

/* ── Static data ─────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: <Zap size={22} />,
    color: 'hsl(252,100%,69%)',
    bg:    'rgba(108,99,255,0.12)',
    title: 'Smart Billing',
    desc:  'Automatic invoicing, proration, and plan upgrades. Powered by Razorpay with HMAC-verified webhooks.',
  },
  {
    icon: <Brain size={22} />,
    color: 'hsl(280,90%,65%)',
    bg:    'rgba(160,90,255,0.12)',
    title: 'AI Churn Insights',
    desc:  'Nightly AI analysis predicts which tenants are at risk. Proactive outreach emails sent automatically.',
  },
  {
    icon: <BarChart3 size={22} />,
    color: 'hsl(206,90%,55%)',
    bg:    'rgba(59,130,246,0.12)',
    title: 'Revenue Analytics',
    desc:  'Live MRR, ARR, churn rate, and subscription counts — all in one admin dashboard.',
  },
  {
    icon: <Bell size={22} />,
    color: 'hsl(38,95%,55%)',
    bg:    'rgba(245,158,11,0.12)',
    title: 'Real-Time Notifications',
    desc:  'Socket.IO-powered instant alerts for payments, dunning, and plan changes.',
  },
  {
    icon: <Users size={22} />,
    color: 'hsl(152,68%,44%)',
    bg:    'rgba(16,185,129,0.12)',
    title: 'Team Management',
    desc:  'Invite members, assign roles, and manage seat limits per plan with fine-grained access control.',
  },
  {
    icon: <Shield size={22} />,
    color: 'hsl(4,85%,58%)',
    bg:    'rgba(239,68,68,0.12)',
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
    <div style={{ minHeight: '100vh', color: 'var(--color-text)', overflowX: 'hidden' }}>

      {/* ── Nav ── */}
      <nav style={{
        position:   'sticky', top: 0, zIndex: 100,
        background: 'rgba(10,10,20,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 clamp(24px, 5vw, 80px)',
        height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34,
            background: 'linear-gradient(135deg, hsl(252,100%,69%), hsl(220,90%,60%))',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 15, color: '#fff',
            boxShadow: '0 4px 14px hsla(252,100%,69%,0.35)',
          }}>TF</div>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: -0.3 }}>TenantFlow</span>
        </div>

        {/* Nav links (desktop) */}
        <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          {['Features', 'Pricing'].map((label) => (
            <a key={label}
              href={`#${label.toLowerCase()}`}
              style={{ color: 'var(--color-text-muted)', fontSize: 14, fontWeight: 500, textDecoration: 'none', transition: 'color 150ms' }}
              onMouseEnter={(e) => { e.target.style.color = 'var(--color-text)'; }}
              onMouseLeave={(e) => { e.target.style.color = 'var(--color-text-muted)'; }}
            >{label}</a>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            id="nav-login"
            className="btn-ghost btn-sm"
            onClick={() => navigate('/login')}
          >
            Sign in
          </button>
          <button
            id="nav-signup"
            className="btn-primary btn-sm"
            onClick={() => navigate('/register')}
          >
            Get started →
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section ref={heroRef} style={{
        padding: 'clamp(64px, 10vh, 120px) clamp(24px, 5vw, 80px)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Background glow blobs */}
        <div style={{
          position: 'absolute', top: '-20%', left: '30%',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, hsla(252,80%,50%,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-10%', right: '20%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, hsla(206,80%,50%,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', maxWidth: 800, margin: '0 auto' }}>
          {/* Badge */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 999,
            background: 'rgba(108,99,255,0.12)',
            border: '1px solid rgba(108,99,255,0.3)',
            fontSize: 12, fontWeight: 600, color: 'hsl(252,100%,78%)',
            marginBottom: 24, letterSpacing: 0.3,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(152,68%,44%)', display: 'inline-block' }} />
            Razorpay · Socket.IO · OpenAI — Production ready
          </span>

          <h1 style={{
            fontSize: 'clamp(38px, 6vw, 72px)',
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1.1,
            marginBottom: 20,
            background: 'linear-gradient(135deg, #fff 20%, hsl(252,100%,78%) 60%, hsl(206,90%,65%))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            SaaS billing that<br />runs itself
          </h1>

          <p style={{
            fontSize: 'clamp(16px, 2vw, 20px)',
            color: 'var(--color-text-muted)',
            maxWidth: 560, margin: '0 auto 40px',
            lineHeight: 1.65,
          }}>
            TenantFlow handles invoicing, dunning, plan upgrades, AI churn analysis, and real-time notifications — so you can focus on your product.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              id="hero-cta-signup"
              className="btn-primary"
              style={{ padding: '13px 28px', fontSize: 15, gap: 8 }}
              onClick={() => navigate('/register')}
            >
              Start free trial <ArrowRight size={16} />
            </button>
            <button
              id="hero-cta-login"
              className="btn-secondary"
              style={{ padding: '13px 28px', fontSize: 15 }}
              onClick={() => navigate('/login')}
            >
              Sign in to dashboard
            </button>
          </div>

          <p style={{ marginTop: 16, fontSize: 13, color: 'var(--color-text-subtle)' }}>
            No credit card required · 14-day free trial
          </p>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" style={{ padding: 'clamp(48px, 8vh, 96px) clamp(24px, 5vw, 80px)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, letterSpacing: -1, marginBottom: 12 }}>
              Everything you need, nothing you don&apos;t
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 16, maxWidth: 480, margin: '0 auto' }}>
              A complete billing infrastructure stack built for modern SaaS teams.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            {FEATURES.map((f) => (
              <div key={f.title} style={{
                padding: 24,
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16,
                backdropFilter: 'blur(12px)',
                transition: 'transform 200ms, box-shadow 200ms',
                cursor: 'default',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 12px 32px rgba(0,0,0,0.4)`; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: f.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: f.color, marginBottom: 16,
                }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" style={{ padding: 'clamp(48px, 8vh, 96px) clamp(24px, 5vw, 80px)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, letterSpacing: -1, marginBottom: 12 }}>
              Simple, transparent pricing
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 16 }}>
              Start free, scale as you grow. Cancel anytime.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {PLANS.map((plan) => (
              <div key={plan.name} style={{
                padding: 28,
                background: plan.featured ? 'rgba(108,99,255,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${plan.featured ? 'rgba(108,99,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 20,
                position: 'relative',
                boxShadow: plan.featured ? '0 0 0 1px rgba(108,99,255,0.2), 0 8px 32px rgba(0,0,0,0.3)' : 'none',
              }}>
                {plan.featured && (
                  <span style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, hsl(252,100%,69%), hsl(220,90%,60%))',
                    color: '#fff', fontSize: 11, fontWeight: 700,
                    padding: '3px 12px', borderRadius: 999, letterSpacing: 0.5,
                  }}>Most Popular</span>
                )}

                <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                  {plan.name}
                </p>
                <div style={{ marginBottom: 20 }}>
                  <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>{plan.price}</span>
                  <span style={{ fontSize: 14, color: 'var(--color-text-muted)', marginLeft: 4 }}>/{plan.interval}</span>
                </div>

                <ul style={{ listStyle: 'none', marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: 'flex', gap: 10, fontSize: 14, color: 'var(--color-text-muted)', alignItems: 'center' }}>
                      <Check size={14} color="hsl(152,68%,44%)" style={{ flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  id={`plan-cta-${plan.name.toLowerCase()}`}
                  className={plan.featured ? 'btn-primary btn-full' : 'btn-secondary btn-full'}
                  onClick={() => navigate('/register')}
                  style={{ fontSize: 14 }}
                >
                  {plan.cta} {plan.featured && <ChevronRight size={14} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '32px clamp(24px, 5vw, 80px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26,
            background: 'linear-gradient(135deg, hsl(252,100%,69%), hsl(220,90%,60%))',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: '#fff',
          }}>TF</div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>TenantFlow</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-subtle)' }}>
          © {new Date().getFullYear()} TenantFlow. Built with Node.js, React, Razorpay &amp; OpenAI.
        </p>
        <div style={{ display: 'flex', gap: 20 }}>
          {['Privacy', 'Terms', 'Docs'].map((l) => (
            <a key={l} href="#" style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none' }}
              onMouseEnter={(e) => { e.target.style.color = 'var(--color-text)'; }}
              onMouseLeave={(e) => { e.target.style.color = 'var(--color-text-muted)'; }}
            >{l}</a>
          ))}
        </div>
      </footer>
    </div>
  );
}
