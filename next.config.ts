import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/job-cards/detect': ['./node_modules/pdfjs-dist/package.json', './node_modules/pdfjs-dist/legacy/build/**', './node_modules/pdfjs-dist/wasm/**', './node_modules/pdfjs-dist/standard_fonts/**', './node_modules/@napi-rs/canvas*/**'],
  },
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
