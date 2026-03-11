'use client';

import { FormEvent, useEffect, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getFirebaseAuth } from '../../lib/firebaseClient';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const auth = getFirebaseAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load remembered email on first render
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedEmail = window.localStorage.getItem('cloud-admin-email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);

       // Remember or clear email based on checkbox
      if (typeof window !== 'undefined') {
        if (rememberMe) {
          window.localStorage.setItem('cloud-admin-email', email);
        } else {
          window.localStorage.removeItem('cloud-admin-email');
        }
      }

      const currentUser = auth.currentUser;
      const idToken = await currentUser?.getIdToken();

      if (!idToken) {
        throw new Error('Unable to get ID token from Firebase.');
      }

      const resp = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => null);
        throw new Error(data?.error || 'Failed to create server session.');
      }

      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-8 shadow-xl">
        <h1 className="text-xl font-semibold mb-1">Super Admin Login</h1>
        <p className="text-sm text-slate-300 mb-6">
          Sign in to manage pharmacy licenses for your desktop application.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 pr-10 text-sm text-slate-50 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-[11px] text-slate-400 hover:text-slate-200"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40"
              />
              <span className="text-slate-300">Remember me</span>
            </label>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}

