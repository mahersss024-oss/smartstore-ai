import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: '#f5fbff',
    categories: ['business', 'food', 'productivity'],
    description: 'SmartStore AI helps stores receive customer orders, manage channels, and run an AI ordering assistant.',
    dir: 'auto',
    display: 'standalone',
    icons: [
      {
        purpose: 'any',
        sizes: '192x192',
        src: '/brand/smartstore-mark-192.png',
        type: 'image/png',
      },
      {
        purpose: 'any',
        sizes: '512x512',
        src: '/brand/smartstore-mark-512.png',
        type: 'image/png',
      },
      {
        purpose: 'maskable',
        sizes: '512x512',
        src: '/brand/smartstore-mark-512.png',
        type: 'image/png',
      },
    ],
    id: '/',
    lang: 'en',
    name: 'SmartStore AI',
    orientation: 'any',
    scope: '/',
    short_name: 'SmartStore',
    start_url: '/ar?source=pwa',
    theme_color: '#0ea5e9',
  };
}
