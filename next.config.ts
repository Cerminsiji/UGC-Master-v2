import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const nextConfig = (phase: string): NextConfig => ({
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  output: 'standalone',
  reactStrictMode: false,
  devIndicators: false,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  transpilePackages: ['motion'],
  serverExternalPackages: ['@google/genai', 'ffmpeg-static', 'ffprobe-static'],
  outputFileTracingIncludes: {
    '/api/meta-cleaner': [
      './scripts/ffmpeg_cleaner.py',
      './node_modules/ffmpeg-static/ffmpeg',
      './node_modules/ffmpeg-static/index.js',
      './node_modules/ffmpeg-static/package.json',
      './node_modules/ffprobe-static/index.js',
      './node_modules/ffprobe-static/package.json',
      './node_modules/ffprobe-static/bin/linux/x64/ffprobe',
    ],
    '/api/meta-cleaner/probe': [
      './node_modules/ffmpeg-static/ffmpeg',
      './node_modules/ffmpeg-static/index.js',
      './node_modules/ffmpeg-static/package.json',
      './node_modules/ffprobe-static/index.js',
      './node_modules/ffprobe-static/package.json',
      './node_modules/ffprobe-static/bin/linux/x64/ffprobe',
    ],
  },
  outputFileTracingExcludes: {
    '*': [
      '**/.next-dev/**',
      '**/.next/cache/**',
      '**/public/assets/aistudio/file_0000000004dc82119cb1e14ad74b3554_8bc4c90f.png',
      '**/node_modules/@swc/core-linux-x64-musl/**',
      '**/node_modules/@swc/core-darwin-*/**',
      '**/node_modules/@swc/core-win32-*/**',
      '**/node_modules/typescript/**',
      '**/node_modules/eslint/**',
      '**/node_modules/eslint-config-next/**',
      '**/node_modules/@typescript-eslint/**',
      '**/node_modules/tailwindcss/**',
      '**/node_modules/@tailwindcss/**',
      '**/node_modules/lightningcss*/**',
      '**/node_modules/autoprefixer/**',
      '**/node_modules/ffprobe-static/bin/darwin/**',
      '**/node_modules/ffprobe-static/bin/win32/**',
      '**/node_modules/ffprobe-static/bin/linux/ia32/**',
      '**/node_modules/ffprobe-static/bin/linux/arm64/**',
      '**/node_modules/@ffmpeg/**',
      '**/node_modules/mp4box/**',
    ],
  },
  experimental: {
    devtoolSegmentExplorer: false,
    webpackMemoryOptimizations: true,
    preloadEntriesOnStart: false,
    serverSourceMaps: false,
    optimizePackageImports: ['lucide-react', 'motion'],
  },
  webpack: (config, { dev }) => {
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
});

export default nextConfig;
