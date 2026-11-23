import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
  poweredByHeader: false,
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  serverExternalPackages: [
    '@libsql/client',
    '@prisma/adapter-libsql',
    '@prisma/client',
    '@prisma/engines',
    '@libsql/isomorphic-fetch',
    '@libsql/isomorphic-ws',
    /* (وN16) محرك الصور — خارجي عشان توربوباك ما يلفش الـ wasm،
       وwrangler هو اللي بيحوله لموديول مسبق الترجمة وقت النشر */
    'mupdf',
    '@jsquash/jpeg',
    '@jsquash/png',
  ],
  /* (ز29) كل أصول القص السيرفري لازم توصل مع الدالة على Vercel:
     خطوط pdf.js + باكجات napi canvas الأصلية (.node binaries) — من غيرها
     import('@napi-rs/canvas') بيقع في الـ lambda والقص بيفشل بصمت */
  outputFileTracingIncludes: {
    '/api/ai-extract': [
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**',
      './node_modules/@napi-rs/canvas-linux-x64-musl/**',
    ],
    '/api/ai-extract-pages': [
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**',
      './node_modules/@napi-rs/canvas-linux-x64-musl/**',
    ],
    '/api/crop-figures': [
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**',
      './node_modules/@napi-rs/canvas-linux-x64-musl/**',
    ],
    '/api/**': [
      './node_modules/@prisma/engines/**',
      './node_modules/.prisma/**',
      './node_modules/@prisma/client/**',
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
  /* (وN16) بناء كلاود فلير بس: FF_CF_BUILD=1 → webpack + DefinePlugin
     بتحول توكنات مواصفات ملفات .cf.js لسلايت حرفية، فويبپاك يحولها
     خارجيات وwrangler يحول الـ wasm لموديولات مسبقة الترجمة —
     توربوباك في التطوير ما يشوف التوكنات خالص فالتطوير بيفضل سليم */
  webpack: (config: any, { webpack: wp }: any) => {
    if (process.env.FF_CF_BUILD) {
      config.plugins.push(
        new wp.DefinePlugin({
          __FF_SPEC_JPEG_ENC__: JSON.stringify('@jsquash/jpeg/codec/enc/mozjpeg_enc.cf.js'),
          __FF_SPEC_JPEG_DEC__: JSON.stringify('@jsquash/jpeg/codec/dec/mozjpeg_dec.cf.js'),
          __FF_SPEC_PNG__: JSON.stringify('@jsquash/png/codec/pkg/squoosh_png.cf.js'),
          __FF_SPEC_MUPDF_CF__: JSON.stringify('mupdf/dist/mupdf.cf.js'),
        })
      );
    }
    return config;
  },
};

export default nextConfig;
