'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { DeckGL } from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import type { LayersList } from '@deck.gl/core';
import Map, { Marker, NavigationControl, type MapRef, type ViewState } from 'react-map-gl';
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

async function createThumbnailJpeg(file: File, opts?: { maxSize?: number; quality?: number }) {
  const maxSize = opts?.maxSize ?? 512;
  const quality = opts?.quality ?? 0.78;

  try {
    // createImageBitmap is fast and avoids layout.
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;
    const scale = Math.min(1, maxSize / Math.max(width, height));

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
    );
    return blob;
  } catch {
    return null;
  }
}

function isLikelyCorsError(error: unknown) {
  return error instanceof TypeError && /failed to fetch/i.test(error.message);
}

function Lightbox({
  photo,
  onClose,
  onNext,
  onPrev,
  onDelete,
  canDelete,
}: {
  photo: MapPhoto;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onDelete: () => void;
  canDelete: boolean;
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

        {canDelete && (
          <button
            onClick={onDelete}
            className="absolute right-14 top-4 rounded-full border border-white/10 bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-red-500/30 hover:text-white"
            aria-label="Delete"
            title="Delete photo"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3m-4 0h14"
              />
            </svg>
          </button>
        )}

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

const MapArea = memo(function MapArea({
  mapboxToken,
  viewState,
  onViewStateChange,
  layers,
  mapRef,
  onMoveStart,
  onMoveEnd,
  children,
}: {
  mapboxToken: string;
  viewState: ViewState;
  onViewStateChange: (next: ViewState) => void;
  layers: LayersList;
  mapRef: RefObject<MapRef | null>;
  onMoveStart: () => void;
  onMoveEnd: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="absolute inset-0">
      <DeckGL
        viewState={viewState}
        onViewStateChange={(e) => onViewStateChange(e.viewState as ViewState)}
        controller
        layers={layers}
      >
        <Map
          ref={mapRef}
          mapboxAccessToken={mapboxToken}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          projection={{ name: 'globe' }}
          style={{ width: '100%', height: '100%' }}
          onMoveStart={onMoveStart}
          onMoveEnd={onMoveEnd}
        >
          <NavigationControl position="top-right" />
          {children}
        </Map>
      </DeckGL>
    </div>
  );
});

export default function MapClient({ slug, token }: { slug: string; token: string | null }) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const [meta, setMeta] = useState<MapMeta | null>(null);
  const [photos, setPhotos] = useState<MapPhoto[]>([]);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [trayOpen, setTrayOpen] = useState(false);
  const [trayGridReady, setTrayGridReady] = useState(false);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [focusedPhotoId, setFocusedPhotoId] = useState<string | null>(null);
  const [followPaused, setFollowPaused] = useState(false);
  const [mapMoving, setMapMoving] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE);
  const viewInitialized = useRef(false);
  const mapRef = useRef<MapRef | null>(null);
  const userInteractingRef = useRef(false);

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

  useEffect(() => {
    if (!trayOpen) {
      setTrayGridReady(false);
      return;
    }
    const t = setTimeout(() => setTrayGridReady(true), 180);
    return () => clearTimeout(t);
  }, [trayOpen]);

  const flyToPhoto = useCallback(
    (photoId: string | null, reason: 'select' | 'lightbox' | 'recenter') => {
      if (!photoId) return;
      const photo = photos.find((p) => p.id === photoId) ?? null;
      const gps = photo?.gps;
      if (!gps) return;

      // Never fight the user's drag gesture.
      if (reason !== 'recenter' && userInteractingRef.current) return;

      // Any explicit jump means we are "following" again.
      setFollowPaused(false);

      mapRef.current?.flyTo({
        center: [gps.longitude, gps.latitude],
        zoom: Math.max(viewState.zoom ?? 2.6, 4.2),
        speed: 0.9,
        curve: 1.25,
        essential: true,
      });
    },
    [photos, viewState.zoom],
  );

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
        const fileList = Array.from(files);
        const exifr = await import('exifr');

        setUploadMessage(`Preparing ${fileList.length} file(s)...`);

        const presignRes = await fetch(
          `/api/maps/${encodeURIComponent(slug)}/presign?token=${encodeURIComponent(token)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              files: fileList.map((f, idx) => ({
                clientId: String(idx),
                filename: f.name,
                contentType: f.type || undefined,
                size: f.size,
              })),
            }),
          },
        );

        const presignPayload = (await presignRes.json().catch(() => null)) as
          | {
              uploads: Array<{
                clientId: string;
                photoId: string;
                objectKey: string;
                thumbnailKey: string;
                filename: string;
                contentType: string;
                uploadUrl: string;
                thumbnailUploadUrl: string;
              }>;
            }
          | { error?: string }
          | null;

        if (!presignRes.ok) {
          throw new Error((presignPayload as { error?: string } | null)?.error || 'Failed to prepare uploads');
        }

        const uploads = (presignPayload as { uploads?: unknown } | null)?.uploads;
        if (!Array.isArray(uploads) || uploads.length === 0) {
          throw new Error('No uploads were prepared');
        }

        const ingested: Array<{
          photoId: string;
          objectKey: string;
          thumbnailKey: string | null;
          filename: string;
          gps: { latitude: number; longitude: number; altitude?: number | null } | null;
          dateTaken: string | null;
          cameraMake: string | null;
          cameraModel: string | null;
          width: number | null;
          height: number | null;
        }> = [];

        const errors: string[] = [];

        let done = 0;
        for (const u of uploads) {
          const idx = Number(u.clientId);
          const file = Number.isFinite(idx) ? fileList[idx] : undefined;
          if (!file) {
            errors.push(`Missing file for upload ${u.filename}`);
            continue;
          }

          done += 1;
          setUploadMessage(`Uploading ${done}/${uploads.length}...`);

          let gps: { latitude: number; longitude: number; altitude?: number | null } | null = null;
          let dateTaken: string | null = null;
          let cameraMake: string | null = null;
          let cameraModel: string | null = null;
          let width: number | null = null;
          let height: number | null = null;

          try {
            const parsed = await exifr.parse(file, { tiff: true, exif: true }).catch(() => null);
            const gpsParsed = await (exifr as unknown as { gps: (input: unknown) => Promise<unknown> }).gps(file).catch(
              () => null,
            );

            if (gpsParsed && typeof gpsParsed === 'object') {
              const lat = (gpsParsed as { latitude?: unknown }).latitude;
              const lon = (gpsParsed as { longitude?: unknown }).longitude;
              const alt = (gpsParsed as { altitude?: unknown }).altitude;
              if (typeof lat === 'number' && typeof lon === 'number') {
                gps = { latitude: lat, longitude: lon, altitude: typeof alt === 'number' ? alt : null };
              }
            }

            if (parsed && typeof parsed === 'object') {
              const dto = (parsed as { DateTimeOriginal?: unknown }).DateTimeOriginal;
              const dt = (parsed as { DateTime?: unknown }).DateTime;
              const dateRaw = dto ?? dt;
              if (dateRaw instanceof Date) {
                dateTaken = dateRaw.toISOString();
              } else if (typeof dateRaw === 'string') {
                dateTaken = dateRaw;
              }

              const mk = (parsed as { Make?: unknown }).Make;
              const mdl = (parsed as { Model?: unknown }).Model;
              cameraMake = typeof mk === 'string' ? mk : mk ? String(mk) : null;
              cameraModel = typeof mdl === 'string' ? mdl : mdl ? String(mdl) : null;

              const w = (parsed as { ExifImageWidth?: unknown; ImageWidth?: unknown }).ExifImageWidth
                ?? (parsed as { ImageWidth?: unknown }).ImageWidth;
              const h = (parsed as { ExifImageHeight?: unknown; ImageHeight?: unknown }).ExifImageHeight
                ?? (parsed as { ImageHeight?: unknown }).ImageHeight;

              const wn = typeof w === 'number' ? w : Number(w);
              const hn = typeof h === 'number' ? h : Number(h);
              width = Number.isFinite(wn) ? wn : null;
              height = Number.isFinite(hn) ? hn : null;
            }
          } catch {
            // EXIF parse is best-effort
          }

          try {
            const putRes = await fetch(u.uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': u.contentType,
              },
              body: file,
            });

            if (!putRes.ok) {
              throw new Error(`Upload failed (${putRes.status})`);
            }

            // Best-effort thumbnail generation/upload.
            let thumbnailKey: string | null = null;
            const thumb = await createThumbnailJpeg(file);
            if (thumb) {
              try {
                const thumbRes = await fetch(u.thumbnailUploadUrl, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'image/jpeg',
                  },
                  body: thumb,
                });
                if (thumbRes.ok) {
                  thumbnailKey = u.thumbnailKey;
                }
              } catch {
                // ignore
              }
            }

            ingested.push({
              photoId: u.photoId,
              objectKey: u.objectKey,
              thumbnailKey,
              filename: u.filename,
              gps,
              dateTaken,
              cameraMake,
              cameraModel,
              width,
              height,
            });
          } catch (e) {
            if (isLikelyCorsError(e)) {
              errors.push(`${u.filename}: blocked by CORS (check S3 bucket AllowedOrigins)`);
            } else {
              errors.push(`${u.filename}: ${e instanceof Error ? e.message : 'Upload failed'}`);
            }
          }
        }

        if (ingested.length > 0) {
          setUploadMessage('Indexing uploads...');
          const ingestRes = await fetch(
            `/api/maps/${encodeURIComponent(slug)}/ingest?token=${encodeURIComponent(token)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uploads: ingested }),
            },
          );
          const ingestPayload = (await ingestRes.json().catch(() => null)) as { imported?: number; error?: string } | null;
          if (!ingestRes.ok) {
            throw new Error(ingestPayload?.error || 'Failed to index uploads');
          }
        }

        setUploadMessage(
          `Uploaded ${ingested.length}/${uploads.length}${errors.length ? ` - ${errors.length} failed` : ''}`,
        );
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

  const onSelectPhoto = useCallback(
    (id: string) => {
      setActivePhotoId(id);
      flyToPhoto(id, 'select');
    },
    [flyToPhoto],
  );

  const focusNext = useCallback(() => {
    if (photos.length === 0) return;
    const current = focusedPhotoId ?? activePhotoId ?? photos[0]!.id;
    const idx = photos.findIndex((p) => p.id === current);
    const safe = idx >= 0 ? idx : 0;
    const next = photos[(safe + 1) % photos.length]!.id;
    setFocusedPhotoId(next);
    setActivePhotoId(next);
    flyToPhoto(next, 'lightbox');
  }, [photos, focusedPhotoId, activePhotoId, flyToPhoto]);

  const focusPrev = useCallback(() => {
    if (photos.length === 0) return;
    const current = focusedPhotoId ?? activePhotoId ?? photos[0]!.id;
    const idx = photos.findIndex((p) => p.id === current);
    const safe = idx >= 0 ? idx : 0;
    const prev = photos[(safe - 1 + photos.length) % photos.length]!.id;
    setFocusedPhotoId(prev);
    setActivePhotoId(prev);
    flyToPhoto(prev, 'lightbox');
  }, [photos, focusedPhotoId, activePhotoId, flyToPhoto]);

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
            flyToPhoto(obj.id, 'select');
          }
        },
        updateTriggers: {
          getRadius: [activePhotoId],
          getFillColor: [activePhotoId],
        },
      }),
    ];
  }, [points, activePhotoId, flyToPhoto]);

  const handleMapMoveStart = useCallback(() => {
    userInteractingRef.current = true;
    setFollowPaused(true);
    setMapMoving(true);
  }, []);

  const handleMapMoveEnd = useCallback(() => {
    userInteractingRef.current = false;
    setMapMoving(false);
  }, []);

  if (!mapboxToken) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white/70">
        Missing `NEXT_PUBLIC_MAPBOX_TOKEN`
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-hidden bg-black text-white">
      <MapArea
        mapboxToken={mapboxToken}
        viewState={viewState}
        onViewStateChange={setViewState}
        layers={layers}
        mapRef={mapRef}
        onMoveStart={handleMapMoveStart}
        onMoveEnd={handleMapMoveEnd}
      >
        {activePhoto?.gps && !mapMoving && (
          <Marker
            latitude={activePhoto.gps.latitude}
            longitude={activePhoto.gps.longitude}
            anchor="center"
          >
            <button
              onClick={() => setFocusedPhotoId(activePhoto.id)}
              className="group relative h-16 w-16 overflow-hidden rounded-full border border-white/15 bg-black/40 shadow-2xl shadow-black/60 outline-none transition hover:scale-[1.02] focus:ring-2 focus:ring-amber-400/40"
              title="Open photo"
            >
              <img
                src={activePhoto.thumbnailUrl}
                alt={activePhoto.filename}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-amber-400/25" />
            </button>
          </Marker>
        )}
      </MapArea>

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
        className="absolute bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-black/55 backdrop-blur-xl will-change-transform"
        style={{
          height: '58vh',
          transform: trayOpen ? 'translateY(0px)' : 'translateY(calc(58vh - 96px))',
          transition: 'transform 260ms cubic-bezier(0.2, 0, 0, 1)',
        }}
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
                    <img
                      src={p.thumbnailUrl}
                      alt={p.filename}
                      loading="lazy"
                      decoding="async"
                      className="h-16 w-24 object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : (
              trayGridReady ? (
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
                      <img
                        src={p.thumbnailUrl}
                        alt={p.filename}
                        loading="lazy"
                        decoding="async"
                        className="aspect-square w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/50">
                  Loading grid...
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {followPaused && activePhoto?.gps && (
        <div className="pointer-events-none absolute bottom-[calc(58vh+16px)] left-0 right-0 z-20 flex justify-center">
          <button
            onClick={() => flyToPhoto(activePhotoId, 'recenter')}
            className="pointer-events-auto rounded-full border border-white/10 bg-black/45 px-4 py-2 text-xs text-white/70 backdrop-blur-sm hover:bg-black/60"
          >
            Recenter
          </button>
        </div>
      )}

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
          canDelete={Boolean(token)}
          onDelete={async () => {
            if (!token) return;
            const ok = window.confirm('Delete this photo?');
            if (!ok) return;

            try {
              const res = await fetch(
                `/api/maps/${encodeURIComponent(slug)}/photos/${encodeURIComponent(focusedPhoto.id)}?token=${encodeURIComponent(token)}`,
                { method: 'DELETE' },
              );
              const payload = (await res.json().catch(() => null)) as { error?: string } | null;
              if (!res.ok) throw new Error(payload?.error || 'Failed to delete');
              setUploadMessage('Photo deleted');
              setFocusedPhotoId(null);
              await load();
            } catch (e) {
              setUploadMessage(e instanceof Error ? e.message : 'Failed to delete');
            }
          }}
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
