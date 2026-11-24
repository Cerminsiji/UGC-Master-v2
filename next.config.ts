import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const nextConfig = (phase: string): NextConfig => ({
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
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
  serverExternalPackages: ['@google/genai', 'ffmpeg-static', 'ffprobe-static'],
  outputFileTracingExcludes: {
    '*': ['**/*'],
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
