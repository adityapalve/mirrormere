'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeckGL } from '@deck.gl/react';
import { IconLayer } from '@deck.gl/layers';
import Map, { NavigationControl, type ViewState } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface PhotoMetadata {
  id: string;
  filename: string;
  original_url: string;
  thumbnail_url?: string;
  has_gps: boolean;
  gps: {
    latitude: number;
    longitude: number;
    altitude?: number | null;
  } | null;
  camera_make: string;
  camera_model: string;
  date_taken: string;
  width: string | number;
  height: string | number;
}

type SyncResult = {
  imported: number;
  skipped: number;
  errors?: string[];
};

const DEFAULT_VIEW_STATE: ViewState = {
  longitude: 0,
  latitude: 20,
  zoom: 1.5,
  pitch: 0,
  bearing: 0,
};

export default function PhotoMap() {
  const [photos, setPhotos] = useState<PhotoMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [carouselPhotos, setCarouselPhotos] = useState<PhotoMetadata[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [appleId, setAppleId] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [verifyingTwoFactor, setVerifyingTwoFactor] = useState(false);
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/photos');
      if (!response.ok) {
        throw new Error('Failed to fetch photos');
      }

      const data = await response.json();
      const photosWithGps = data.filter((p: PhotoMetadata) => p.has_gps && p.gps);
      setPhotos(photosWithGps);

      if (photosWithGps.length > 0) {
        const avgLat =
          photosWithGps.reduce((sum: number, p: PhotoMetadata) => sum + (p.gps?.latitude || 0), 0) /
          photosWithGps.length;
        const avgLon =
          photosWithGps.reduce((sum: number, p: PhotoMetadata) => sum + (p.gps?.longitude || 0), 0) /
          photosWithGps.length;

        setViewState((prev) => ({
          ...prev,
          latitude: avgLat,
          longitude: avgLon,
          zoom: 4,
        }));
      }
    } catch (error) {
      console.error('Error loading photos:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  useEffect(() => {
    const fetchCredentials = async () => {
      try {
        const response = await fetch('/api/icloud/credentials');
        const data = await response.json();
        setHasCredentials(Boolean(data?.hasCredentials));
      } catch (error) {
        console.error('Error checking credentials:', error);
      }
    };

    fetchCredentials();
  }, []);

  const formatSyncMessage = (worker: SyncResult, index: SyncResult) => {
    const workerErrors = worker.errors?.length ?? 0;
    const indexErrors = index.errors?.length ?? 0;
    const totalErrors = workerErrors + indexErrors;

    return `Uploaded ${worker.imported} · Indexed ${index.imported}${totalErrors ? ` · ${totalErrors} errors` : ''}`;
  };

  const handleSync = async (force = false) => {
    if (!hasCredentials && !force) {
      setShowCredentialsModal(true);
      return;
    }

    setSyncing(true);
    setSyncMessage(null);

    try {
      const response = await fetch('/api/icloud/sync', { method: 'POST' });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'Sync failed');
      }

      if (payload?.status === 'needs_2fa') {
        setPendingSessionId(payload.sessionId);
        setTwoFactorCode('');
        setSyncMessage('Two-factor code required.');
        return;
      }

      const workerResult: SyncResult = payload.worker;
      const indexResult: SyncResult = payload.index;
      setSyncMessage(formatSyncMessage(workerResult, indexResult));
      await loadPhotos();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!appleId.trim() || !appPassword.trim()) {
      setSyncMessage('Apple ID and app-specific password are required.');
      return;
    }

    setSavingCredentials(true);
    setSyncMessage(null);

    try {
      const response = await fetch('/api/icloud/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appleId, appPassword }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save credentials');
      }

      setHasCredentials(true);
      setShowCredentialsModal(false);
      setAppPassword('');
      await handleSync(true);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Failed to save credentials');
    } finally {
      setSavingCredentials(false);
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (!pendingSessionId) {
      return;
    }

    if (!twoFactorCode.trim()) {
      setSyncMessage('Enter the 2FA code from your device.');
      return;
    }

    setVerifyingTwoFactor(true);
    setSyncMessage(null);

    try {
      const response = await fetch('/api/icloud/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: pendingSessionId, code: twoFactorCode }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || '2FA verification failed');
      }

      const workerResult: SyncResult = payload.worker;
      const indexResult: SyncResult = payload.index;
      setSyncMessage(formatSyncMessage(workerResult, indexResult));
      setPendingSessionId(null);
      setTwoFactorCode('');
      await loadPhotos();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : '2FA verification failed');
    } finally {
      setVerifyingTwoFactor(false);
    }
  };

  const handlePhotoClick = useCallback((photo: PhotoMetadata) => {
    setCarouselPhotos(photos);
    setCurrentPhotoIndex(photos.indexOf(photo));
  }, [photos]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (carouselPhotos.length === 0) return;

      if (e.key === 'ArrowLeft') {
        setCurrentPhotoIndex((currentPhotoIndex - 1 + carouselPhotos.length) % carouselPhotos.length);
      } else if (e.key === 'ArrowRight') {
        setCurrentPhotoIndex((currentPhotoIndex + 1) % carouselPhotos.length);
      } else if (e.key === 'Escape') {
        setCarouselPhotos([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [carouselPhotos, currentPhotoIndex]);

  const layers = useMemo(() => {
    if (!photos.length) {
      return [];
    }

    return [
      new IconLayer<PhotoMetadata>({
        id: 'photo-thumbnails',
        data: photos,
        pickable: true,
        autoPacking: true,
        sizeUnits: 'pixels',
        getPosition: (d) => [d.gps?.longitude || 0, d.gps?.latitude || 0],
        getIcon: (d) => ({
          url: d.thumbnail_url || d.original_url,
          width: 80,
          height: 80,
          anchorY: 80,
        }),
        getSize: 50,
        onClick: (info) => {
          if (info.object) {
            handlePhotoClick(info.object);
          }
        },
      }),
    ];
  }, [photos, handlePhotoClick]);

  if (!mapboxToken) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Missing Mapbox token</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading photos...</div>
      </div>
    );
  }

  const currentPhoto = carouselPhotos[currentPhotoIndex];

  return (
    <>
      <div className={`relative h-screen w-full ${carouselPhotos.length > 0 ? 'blur-sm' : ''} transition-all`}>
        <div className="absolute left-4 top-4 z-20 space-y-2">
          <button
            onClick={() => handleSync()}
            disabled={syncing}
            className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-gray-900 shadow-lg transition hover:bg-white disabled:opacity-60"
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            onClick={() => setShowCredentialsModal(true)}
            className="rounded-full bg-black/70 px-4 py-1.5 text-xs font-medium text-white shadow"
          >
            {hasCredentials ? 'Edit iCloud' : 'Add iCloud'}
          </button>
          {syncMessage && (
            <div className="rounded-lg bg-black/70 px-3 py-2 text-xs text-white shadow">
              {syncMessage}
            </div>
          )}
        </div>

        {photos.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="rounded-lg bg-black/70 px-4 py-3 text-sm text-white shadow">
              No photos with GPS data yet. Click Sync now.
            </div>
          </div>
        )}

        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: nextViewState }) => setViewState(nextViewState)}
          controller={true}
          layers={layers}
        >
          <Map
            mapboxAccessToken={mapboxToken}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            projection={{ name: 'globe' }}
            style={{ height: '100%', width: '100%' }}
          >
            <NavigationControl position="bottom-right" />
          </Map>
        </DeckGL>
      </div>

      {showCredentialsModal && (
        <div
          className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowCredentialsModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-gray-900 p-6 text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-xl font-semibold">Connect iCloud</h2>
            <p className="mt-2 text-sm text-gray-300">
              Use your Apple ID and an app-specific password.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-xs uppercase tracking-wide text-gray-400">Apple ID</label>
              <input
                type="email"
                value={appleId}
                onChange={(event) => setAppleId(event.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
              />
              <label className="block text-xs uppercase tracking-wide text-gray-400">App Password</label>
              <input
                type="password"
                value={appPassword}
                onChange={(event) => setAppPassword(event.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="rounded-full px-4 py-2 text-sm text-gray-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCredentials}
                disabled={savingCredentials}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow disabled:opacity-60"
              >
                {savingCredentials ? 'Saving…' : 'Save & Sync'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingSessionId && (
        <div
          className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPendingSessionId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-gray-900 p-6 text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-xl font-semibold">Two-Factor Required</h2>
            <p className="mt-2 text-sm text-gray-300">
              Enter the verification code from your device.
            </p>
            <input
              type="text"
              value={twoFactorCode}
              onChange={(event) => setTwoFactorCode(event.target.value)}
              className="mt-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
            />
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setPendingSessionId(null)}
                className="rounded-full px-4 py-2 text-sm text-gray-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyTwoFactor}
                disabled={verifyingTwoFactor}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow disabled:opacity-60"
              >
                {verifyingTwoFactor ? 'Verifying…' : 'Verify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {carouselPhotos.length > 0 && currentPhoto && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
          onClick={() => setCarouselPhotos([])}
        >
          <div
            className="bg-gray-900 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setCarouselPhotos([])}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors z-10"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="relative bg-black">
              {carouselPhotos.length > 1 && (
                <button
                  onClick={() => setCurrentPhotoIndex((currentPhotoIndex - 1 + carouselPhotos.length) % carouselPhotos.length)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 transition-colors z-10"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}

              <img
                src={currentPhoto.original_url}
                alt={currentPhoto.filename}
                className="w-full max-h-[65vh] object-contain"
              />

              {carouselPhotos.length > 1 && (
                <button
                  onClick={() => setCurrentPhotoIndex((currentPhotoIndex + 1) % carouselPhotos.length)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 transition-colors z-10"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              {carouselPhotos.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded-full text-sm font-medium">
                  {currentPhotoIndex + 1} / {carouselPhotos.length}
                </div>
              )}
            </div>

            {carouselPhotos.length > 1 && (
              <div className="px-6 py-4 bg-gray-800 overflow-x-auto">
                <div className="flex gap-2">
                  {carouselPhotos.map((photo, index) => (
                    <button
                      key={photo.id}
                      onClick={() => setCurrentPhotoIndex(index)}
                      className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden transition-all ${
                        index === currentPhotoIndex
                          ? 'ring-2 ring-blue-500 scale-110'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={photo.thumbnail_url || photo.original_url}
                        alt={photo.filename}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="p-6 space-y-4">
              <h2 className="text-2xl font-bold text-white">{currentPhoto.filename}</h2>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400 font-medium">Date Taken</p>
                  <p className="text-gray-100">{currentPhoto.date_taken}</p>
                </div>

                <div>
                  <p className="text-gray-400 font-medium">Camera</p>
                  <p className="text-gray-100">{currentPhoto.camera_make} {currentPhoto.camera_model}</p>
                </div>

                {currentPhoto.width !== 'Unknown' && (
                  <div>
                    <p className="text-gray-400 font-medium">Dimensions</p>
                    <p className="text-gray-100">{currentPhoto.width} x {currentPhoto.height}</p>
                  </div>
                )}

                <div>
                  <p className="text-gray-400 font-medium">Location</p>
                  <p className="text-gray-100 text-xs">
                    {currentPhoto.gps?.latitude.toFixed(6)}, {currentPhoto.gps?.longitude.toFixed(6)}
                  </p>
                </div>

                {currentPhoto.gps?.altitude !== null && currentPhoto.gps?.altitude !== undefined && (
                  <div>
                    <p className="text-gray-400 font-medium">Altitude</p>
                    <p className="text-gray-100">{currentPhoto.gps.altitude.toFixed(1)}m</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
