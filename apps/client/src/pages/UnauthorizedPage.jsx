import React from 'react';
import { ShieldOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function UnauthorizedPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center bg-background text-text-primary font-sans">
      <div className="w-20 h-20 bg-danger/10 rounded-full flex items-center justify-center mb-2 shadow-sm">
        <ShieldOff size={36} className="text-danger" />
      </div>
      <div>
        <h1 className="text-5xl font-extrabold text-danger leading-none">403</h1>
        <h2 className="text-2xl font-semibold mt-3 mb-2">
          Access Denied
        </h2>
        <p className="text-text-muted text-[15px] max-w-[400px]">
          You don&apos;t have permission to access this page. Contact your administrator if you believe this is a mistake.
        </p>
      </div>
      <div className="flex gap-3 mt-2">
        <button className="px-5 py-2.5 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-sm font-semibold transition-colors flex items-center justify-center gap-1.5" onClick={() => navigate(-1)}>
          &larr; Go Back
        </button>
        <button className="px-5 py-2.5 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-sm font-semibold transition-colors flex items-center justify-center" onClick={() => navigate('/')}>
          Go Home
        </button>
      </div>
    </div>
  );
}
