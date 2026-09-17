'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.status === 200) {
        router.push(next);
        return;
      }
      setError(res.status === 401 ? 'Incorrect password' : `Login failed (${res.status})`);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label htmlFor="password" className="text-[11px] uppercase tracking-wider text-muted">
        Shared password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoFocus
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="h-9 rounded border border-border bg-bg px-3 font-mono text-[13px] text-text focus:border-concord/60 focus:outline-none"
      />
      {error && (
        <p role="alert" className="text-[12px] text-hegemony">{error}</p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="h-9 rounded bg-concord/90 font-mono text-[12px] font-semibold tracking-[0.18em] text-bg hover:bg-concord disabled:opacity-60"
      >
        {busy ? 'Checking…' : 'Enter'}
      </button>
    </form>
  );
}
