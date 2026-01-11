'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface PhotoMetadata {
  filename: string;
  filepath: string;
  web_filename?: string;
  has_gps: boolean;
  gps: {
    latitude: number;
    longitude: number;
    altitude?: number;
  } | null;
  camera_make: string;
  camera_model: string;
  date_taken: string;
  width: string | number;
  height: string | number;
}

export default function PhotoMap() {
  const [photos, setPhotos] = useState<PhotoMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [carouselPhotos, setCarouselPhotos] = useState<PhotoMetadata[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  useEffect(() => {
    // Fetch photo metadata
    fetch('/api/photos')
      .then(res => res.json())
      .then(data => {
        const photosWithGps = data.filter((p: PhotoMetadata) => p.has_gps);
        setPhotos(photosWithGps);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading photos:', err);
        setLoading(false);
      });
  }, []);

  const handlePhotoClick = (photo: PhotoMetadata) => {
    // Show all photos in the carousel
    setCarouselPhotos(photos);
    setCurrentPhotoIndex(photos.indexOf(photo));
  };

  // Keyboard navigation
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

  // Create custom thumbnail icon for each photo
  const createThumbnailIcon = (photo: PhotoMetadata) => {
    const iconHtml = `
      <div style="
        width: 60px;
        height: 60px;
        border-radius: 8px;
        overflow: hidden;
        border: 3px solid #1f2937;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        cursor: pointer;
        background: white;
      ">
        <img
          src="/api/photos/${encodeURIComponent(photo.web_filename || photo.filename)}"
          style="width: 100%; height: 100%; object-fit: cover;"
        />
      </div>
    `;

    return L.divIcon({
      html: iconHtml,
      className: 'custom-thumbnail-marker',
      iconSize: [60, 60],
      iconAnchor: [30, 30],
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading photos...</div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">No photos with GPS data found</div>
      </div>
    );
  }

  // Calculate center of all photos
  const avgLat = photos.reduce((sum, p) => sum + (p.gps?.latitude || 0), 0) / photos.length;
  const avgLon = photos.reduce((sum, p) => sum + (p.gps?.longitude || 0), 0) / photos.length;

  const currentPhoto = carouselPhotos[currentPhotoIndex];

  return (
    <>
      <div className={`h-screen w-full ${carouselPhotos.length > 0 ? 'blur-sm' : ''} transition-all`}>
        <MapContainer
          center={[avgLat, avgLon]}
          zoom={15}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            className="map-tiles"
          />

          {photos.map((photo, index) => {
            if (!photo.gps) return null;

            return (
              <Marker
                key={index}
                position={[photo.gps.latitude, photo.gps.longitude]}
                icon={createThumbnailIcon(photo)}
                eventHandlers={{
                  click: () => handlePhotoClick(photo),
                }}
              />
            );
          })}
        </MapContainer>
      </div>

      {/* Photo Carousel Modal */}
      {carouselPhotos.length > 0 && currentPhoto && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
          onClick={() => setCarouselPhotos([])}
        >
          <div
            className="bg-gray-900 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setCarouselPhotos([])}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors z-10"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Photo with navigation arrows */}
            <div className="relative bg-black">
              {/* Previous arrow */}
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
                src={`/api/photos/${encodeURIComponent(currentPhoto.web_filename || currentPhoto.filename)}`}
                alt={currentPhoto.filename}
                className="w-full max-h-[65vh] object-contain"
              />

              {/* Next arrow */}
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

              {/* Photo counter */}
              {carouselPhotos.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded-full text-sm font-medium">
                  {currentPhotoIndex + 1} / {carouselPhotos.length}
                </div>
              )}
            </div>

            {/* Thumbnail strip for carousel navigation */}
            {carouselPhotos.length > 1 && (
              <div className="px-6 py-4 bg-gray-800 overflow-x-auto">
                <div className="flex gap-2">
                  {carouselPhotos.map((photo, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentPhotoIndex(index)}
                      className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden transition-all ${
                        index === currentPhotoIndex
                          ? 'ring-2 ring-blue-500 scale-110'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={`/api/photos/${encodeURIComponent(photo.web_filename || photo.filename)}`}
                        alt={photo.filename}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Photo details */}
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

                {currentPhoto.gps?.altitude && (
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
