'use client';

import dynamic from 'next/dynamic';

// Dynamically import PhotoMap with no SSR since Leaflet requires window object
const PhotoMap = dynamic(() => import('./components/PhotoMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <div className="text-xl">Loading map...</div>
    </div>
  ),
});

export default function Home() {
  return <PhotoMap />;
}
