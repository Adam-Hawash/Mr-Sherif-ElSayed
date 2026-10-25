import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
  poweredByHeader: false,
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  serverExternalPackages: [
    '@libsql/client',
    '@prisma/adapter-libsql',
    '@libsql/isomorphic-fetch',
    '@libsql/isomorphic-ws',
    /* (ز29) القص السيرفري للرسومات — pdf.js legacy + napi canvas لازم يفضلوا خارجية
       من غير كده Turbopack بيحاول يلف الـ .node binary ويقع البناء
       («non-ecmascript placeable asset») */
    'pdfjs-dist',
    '@napi-rs/canvas',
  ],
  /* (ز29) كل أصول القص السيرفري لازم توصل مع الدالة على Vercel:
     خطوط pdf.js + باكجات napi canvas الأصلية (.node binaries) — من غيرها
     import('@napi-rs/canvas') بيقع في الـ lambda والقص بيفشل بصمت */
  outputFileTracingIncludes: {
    '/api/ai-extract': [
      './node_modules/pdfjs-dist/**',
      './node_modules/@napi-rs/canvas/**',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**',
      './node_modules/@napi-rs/canvas-linux-x64-musl/**',
    ],
    '/api/ai-extract-pages': [
      './node_modules/pdfjs-dist/**',
      './node_modules/@napi-rs/canvas/**',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**',
      './node_modules/@napi-rs/canvas-linux-x64-musl/**',
    ],
    '/api/crop-figures': [
      './node_modules/pdfjs-dist/**',
      './node_modules/@napi-rs/canvas/**',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**',
      './node_modules/@napi-rs/canvas-linux-x64-musl/**',
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '500mb' },
    optimizePackageImports: ['lucide-react', 'framer-motion', 'embla-carousel-react', 'react-day-picker', 'date-fns'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  async headers() {
    // Production-only: immutable caching for static assets.
    // In dev these headers make the browser stick to stale chunks forever.
    if (process.env.NODE_ENV !== 'production') return [];
    return [
      { source: '/uploads/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/_next/static/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
  turbopack: {},
};

export default nextConfig;
