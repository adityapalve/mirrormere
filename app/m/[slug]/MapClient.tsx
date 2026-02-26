'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeckGL } from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import Map, { NavigationControl, type ViewState } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

type InviteInfo = {
  id: string;
  label: string | null;
  color: string | null;
};

type MapPhoto = {
  id: string;
  filename: string;
  originalUrl: string;
  thumbnailUrl: string;
  hasGps: boolean;
  gps: { latitude: number; longitude: number; altitude: number | null } | null;
  dateTaken: string | null;
  invite: InviteInfo | null;
};

type MapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  dateTaken: string | null;
  invite: InviteInfo | null;
  originalUrl: string;
  thumbnailUrl: string;
};

type MapMeta = {
  id: string;
  slug: string;
  title: string | null;
  counts: { photos: number; geotagged: number; invites: number };
};

const DEFAULT_VIEW_STATE: ViewState = {
  longitude: 0,
  latitude: 20,
  zoom: 1.6,
  pitch: 0,
  bearing: 0,
  padding: { top: 0, bottom: 0, left: 0, right: 0 },
};

function formatDatePill(value: string | null) {
  if (!value) return '--';
  try {
    const d = new Date(value);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '--';
  }
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '').trim();
  const full = normalized.length === 3
    ? normalized.split('').map((c) => `${c}${c}`).join('')
    : normalized;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function Lightbox({
  photo,
  onClose,
  onNext,
  onPrev,
}: {
  photo: MapPhoto;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, onNext, onPrev]);

  return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
      <div className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-black/70 shadow-2xl">
        <img
          src={photo.originalUrl}
          alt={photo.filename}
          className="max-h-[85vh] w-full object-contain"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 hover:text-white"
          aria-label="Close"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <button
          onClick={onPrev}
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/35 p-3 text-white/70 backdrop-blur-sm transition hover:bg-black/55 hover:text-white"
          aria-label="Previous"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={onNext}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/35 p-3 text-white/70 backdrop-blur-sm transition hover:bg-black/55 hover:text-white"
          aria-label="Next"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="absolute bottom-0 left-0 right-0 px-6 pb-5 pt-10">
          <div className="flex items-end gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white/90">{photo.invite?.label || 'Photo'}</p>
              <p className="text-xs text-white/55">{formatDatePill(photo.dateTaken)}</p>
            </div>
            <p className="ml-auto shrink-0 text-[11px] text-white/45">{photo.filename}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MapClient({ slug, token }: { slug: string; token: string | null }) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const [meta, setMeta] = useState<MapMeta | null>(null);
  const [photos, setPhotos] = useState<MapPhoto[]>([]);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [trayOpen, setTrayOpen] = useState(false);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [focusedPhotoId, setFocusedPhotoId] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE);
  const viewInitialized = useRef(false);

  const origin = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
  }, []);

  const activePhoto = useMemo(
    () => (activePhotoId ? photos.find((p) => p.id === activePhotoId) ?? null : null),
    [photos, activePhotoId],
  );

  const focusedPhoto = useMemo(
    () => (focusedPhotoId ? photos.find((p) => p.id === focusedPhotoId) ?? null : null),
    [photos, focusedPhotoId],
  );

  const activeDateLabel = useMemo(() => formatDatePill(activePhoto?.dateTaken ?? null), [activePhoto]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [metaRes, photosRes, pointsRes] = await Promise.all([
        fetch(`/api/maps/${encodeURIComponent(slug)}`),
        fetch(`/api/maps/${encodeURIComponent(slug)}/photos`),
        fetch(`/api/maps/${encodeURIComponent(slug)}/points`),
      ]);

      const metaPayload = (await metaRes.json().catch(() => null)) as MapMeta | { error?: string } | null;
      if (!metaRes.ok) throw new Error((metaPayload as { error?: string } | null)?.error || 'Failed to load map');

      const photosPayload = (await photosRes.json().catch(() => [])) as MapPhoto[];
      const pointsPayload = (await pointsRes.json().catch(() => [])) as MapPoint[];

      setMeta(metaPayload as MapMeta);
      setPhotos(Array.isArray(photosPayload) ? photosPayload : []);
      setPoints(Array.isArray(pointsPayload) ? pointsPayload : []);

      const firstId = (photosPayload as MapPhoto[])[0]?.id ?? null;
      setActivePhotoId((prev) => prev ?? firstId);

      if (!viewInitialized.current && pointsPayload.length > 0) {
        const avgLat = pointsPayload.reduce((s, p) => s + p.latitude, 0) / pointsPayload.length;
        const avgLon = pointsPayload.reduce((s, p) => s + p.longitude, 0) / pointsPayload.length;
        setViewState((vs) => ({ ...vs, latitude: avgLat, longitude: avgLon, zoom: 2.6 }));
        viewInitialized.current = true;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      if (!token) return;

      setUploading(true);
      setUploadMessage(null);

      try {
        const fd = new FormData();
        Array.from(files).forEach((f) => fd.append('files', f));

        const res = await fetch(`/api/maps/${encodeURIComponent(slug)}/upload?token=${encodeURIComponent(token)}`,
          { method: 'POST', body: fd },
        );
        const payload = (await res.json().catch(() => null)) as
          | { imported: number; skipped: number; errors: string[] }
          | { error?: string }
          | null;
        if (!res.ok) throw new Error((payload as { error?: string } | null)?.error || 'Upload failed');

        const imported = (payload as { imported?: number } | null)?.imported ?? 0;
        const skipped = (payload as { skipped?: number } | null)?.skipped ?? 0;
        const errs = (payload as { errors?: string[] } | null)?.errors ?? [];
        setUploadMessage(`Uploaded ${imported}${skipped ? ` · Skipped ${skipped}` : ''}${errs.length ? ` · ${errs.length} errors` : ''}`);
        await load();
      } catch (e) {
        setUploadMessage(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [slug, token, load],
  );

  const handleCreateInvite = useCallback(async () => {
    if (!token) return;
    const label = window.prompt("Friend's name (for color + filter)") || '';

    try {
      const res = await fetch(`/api/maps/${encodeURIComponent(slug)}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerToken: token, label }),
      });
      const payload = (await res.json().catch(() => null)) as { inviteUrl?: string; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || 'Failed to create invite');
      if (payload?.inviteUrl) {
        await navigator.clipboard.writeText(`${origin}${payload.inviteUrl}`);
        setUploadMessage('Invite link copied to clipboard');
      }
    } catch (e) {
      setUploadMessage(e instanceof Error ? e.message : 'Failed to create invite');
    }
  }, [slug, token, origin]);

  const onSelectPhoto = useCallback((id: string) => {
    setActivePhotoId(id);
  }, []);

  const focusNext = useCallback(() => {
    if (photos.length === 0) return;
    const current = focusedPhotoId ?? activePhotoId ?? photos[0]!.id;
    const idx = photos.findIndex((p) => p.id === current);
    const safe = idx >= 0 ? idx : 0;
    const next = photos[(safe + 1) % photos.length]!.id;
    setFocusedPhotoId(next);
    setActivePhotoId(next);
  }, [photos, focusedPhotoId, activePhotoId]);

  const focusPrev = useCallback(() => {
    if (photos.length === 0) return;
    const current = focusedPhotoId ?? activePhotoId ?? photos[0]!.id;
    const idx = photos.findIndex((p) => p.id === current);
    const safe = idx >= 0 ? idx : 0;
    const prev = photos[(safe - 1 + photos.length) % photos.length]!.id;
    setFocusedPhotoId(prev);
    setActivePhotoId(prev);
  }, [photos, focusedPhotoId, activePhotoId]);

  const layers = useMemo(() => {
    if (!points.length) return [];

    return [
      new ScatterplotLayer<MapPoint>({
        id: 'map-points',
        data: points,
        pickable: true,
        opacity: 0.85,
        stroked: true,
        filled: true,
        radiusMinPixels: 3,
        radiusMaxPixels: 18,
        getPosition: (d) => [d.longitude, d.latitude],
        getRadius: (d) => (d.id === activePhotoId ? 12 : 6),
        getFillColor: (d) => {
          const hex = d.invite?.color || '#ffffff';
          const { r, g, b } = hexToRgb(hex);
          return d.id === activePhotoId ? [r, g, b, 230] : [r, g, b, 140];
        },
        getLineColor: [255, 255, 255, 70],
        lineWidthMinPixels: 1,
        onClick: (info) => {
          const obj = info.object;
          if (obj?.id) {
            setActivePhotoId(obj.id);
            setFocusedPhotoId(obj.id);
            setTrayOpen(true);
          }
        },
        updateTriggers: {
          getRadius: [activePhotoId],
          getFillColor: [activePhotoId],
        },
      }),
    ];
  }, [points, activePhotoId]);

  if (!mapboxToken) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white/70">
        Missing `NEXT_PUBLIC_MAPBOX_TOKEN`
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0">
        <DeckGL
          viewState={viewState}
          onViewStateChange={(e) => setViewState(e.viewState as ViewState)}
          controller
          layers={layers}
        >
          <Map
            mapboxAccessToken={mapboxToken}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            projection={{ name: 'globe' }}
            style={{ width: '100%', height: '100%' }}
          >
            <NavigationControl position="top-right" />
          </Map>
        </DeckGL>
      </div>

      {/* Top bar */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 px-4 pt-4">
        <div className="pointer-events-auto mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 rounded-2xl border border-white/10 bg-black/35 px-4 py-2 backdrop-blur-sm">
            <p className="truncate text-sm font-medium text-white/90">{meta?.title || 'Shared map'}</p>
            <p className="text-xs text-white/55">
              {meta ? `${meta.counts.photos} photos · ${meta.counts.geotagged} geotagged` : loading ? 'Loading...' : ''}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${origin}/m/${slug}`);
                  setUploadMessage('View link copied');
                } catch {
                  setUploadMessage('Failed to copy');
                }
              }}
              className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/70 backdrop-blur-sm hover:bg-black/55"
            >
              Share
            </button>

            {token && (
              <>
                <button
                  onClick={handleCreateInvite}
                  className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/70 backdrop-blur-sm hover:bg-black/55"
                >
                  Invite
                </button>
                <button
                  onClick={handleUploadClick}
                  disabled={uploading}
                  className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-medium text-black hover:bg-amber-300 disabled:opacity-60"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </>
            )}
          </div>
        </div>

        {uploadMessage && (
          <div className="pointer-events-auto mx-auto mt-3 max-w-6xl">
            <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-2 text-xs text-white/70 backdrop-blur-sm">
              {uploadMessage}
            </div>
          </div>
        )}
      </div>

      {/* Bottom tray */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-black/55 backdrop-blur-xl transition-[height] duration-300 ${
          trayOpen ? 'h-[58vh]' : 'h-24'
        }`}
      >
        <div className="mx-auto flex h-full max-w-6xl flex-col">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => setTrayOpen((v) => !v)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
            >
              {trayOpen ? 'Collapse' : 'Expand'}
            </button>
            <p className="text-sm text-white/80">{activeDateLabel}</p>
            <p className="ml-auto text-xs text-white/50">{photos.length} photos</p>
          </div>

          <div className="flex-1 overflow-auto px-4 pb-4">
            {!trayOpen ? (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {photos.slice(0, 60).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectPhoto(p.id);
                      setFocusedPhotoId(p.id);
                    }}
                    className={`shrink-0 overflow-hidden rounded-xl border transition ${
                      p.id === activePhotoId ? 'border-amber-400/60' : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <img src={p.thumbnailUrl} alt={p.filename} className="h-16 w-24 object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {photos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectPhoto(p.id);
                      setFocusedPhotoId(p.id);
                    }}
                    className={`overflow-hidden rounded-xl border transition ${
                      p.id === activePhotoId ? 'border-amber-400/60' : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <img src={p.thumbnailUrl} alt={p.filename} className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/30 text-white/60">
          Loading...
        </div>
      )}
      {error && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/30">
          <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        </div>
      )}

      {focusedPhoto && (
        <Lightbox
          photo={focusedPhoto}
          onClose={() => setFocusedPhotoId(null)}
          onNext={focusNext}
          onPrev={focusPrev}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
