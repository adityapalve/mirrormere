'use client';

import { useMemo, useState } from 'react';

type CreateMapResponse = {
  slug: string;
  title: string;
  viewUrl: string;
  inviteUrl: string;
  ownerToken: string;
};

export default function Home() {
  const [title, setTitle] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateMapResponse | null>(null);

  const origin = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
  }, []);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    setCreated(null);

    try {
      const res = await fetch('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, ownerName }),
      });

      const payload = (await res.json().catch(() => null)) as CreateMapResponse | { error?: string } | null;
      if (!res.ok) {
        throw new Error((payload as { error?: string } | null)?.error || 'Failed to create map');
      }

      setCreated(payload as CreateMapResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create map');
    } finally {
      setCreating(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Shared photo map</h1>
        <p className="mt-3 text-sm text-white/60">
          Create a map, upload photos, then invite friends to add theirs.
        </p>

        <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs text-white/60">Map title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Summer 2026"
                className="h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-amber-400/30"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs text-white/60">Your name</span>
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Adi"
                className="h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-amber-400/30"
              />
            </label>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-amber-400 px-4 text-sm font-medium text-black transition hover:bg-amber-300 disabled:opacity-60"
          >
            {creating ? 'Creating...' : 'Create map'}
          </button>

          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

          {created && (
            <div className="mt-6 grid gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50">View link</span>
                  <button
                    onClick={() => copy(`${origin}${created.viewUrl}`)}
                    className="ml-auto rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
                  >
                    Copy
                  </button>
                </div>
                <a className="mt-2 block break-all text-white/90 hover:underline" href={created.viewUrl}>
                  {origin}{created.viewUrl}
                </a>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50">Invite to upload</span>
                  <button
                    onClick={() => copy(`${origin}${created.inviteUrl}`)}
                    className="ml-auto rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
                  >
                    Copy
                  </button>
                </div>
                <p className="mt-2 break-all text-white/90">{origin}{created.inviteUrl}</p>
                <p className="mt-2 text-xs text-white/50">
                  Keep this invite link private - it allows uploads.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
