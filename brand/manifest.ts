import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Meanwhile',
    short_name: 'Meanwhile',
    description: 'A live, AI-directed 3D Earth. The planet is the only programming.',
    start_url: '/',
    display: 'standalone',
    background_color: '#080b11',
    theme_color: '#080b11',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
