const fs = require('fs');
const path = require('path');

const dir = __dirname;

process.env.NODE_ENV = 'production';
process.chdir(dir);

const standaloneServerPath = path.join(dir, '.next', 'standalone', 'server.js');
const rootNextServerPath = path.join(dir, '.next', 'server');

// If only the standalone bundle exists (no root .next/server), copy static/public if needed and delegate
if (!fs.existsSync(rootNextServerPath) && fs.existsSync(standaloneServerPath)) {
  require(standaloneServerPath);
} else {
  const currentPort = parseInt(process.env.PORT, 10) || 3000;
  const hostname = process.env.HOSTNAME || '0.0.0.0';

  let keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT, 10);
  if (
    Number.isNaN(keepAliveTimeout) ||
    !Number.isFinite(keepAliveTimeout) ||
    keepAliveTimeout < 0
  ) {
    keepAliveTimeout = undefined;
  }

  let nextConfig;
  const requiredFilesPath = path.join(dir, '.next', 'required-server-files.json');
  if (!process.env.__NEXT_PRIVATE_STANDALONE_CONFIG && fs.existsSync(requiredFilesPath)) {
    try {
      const requiredFiles = JSON.parse(fs.readFileSync(requiredFilesPath, 'utf8'));
      if (requiredFiles && requiredFiles.config) {
        nextConfig = requiredFiles.config;
        process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(requiredFiles.config);
      }
    } catch (err) {
      console.warn('Warning: failed to read .next/required-server-files.json:', err.message);
    }
  }

  require('next');
  const { startServer } = require('next/dist/server/lib/start-server');

  startServer({
    dir,
    isDev: false,
    ...(nextConfig ? { config: nextConfig } : {}),
    hostname,
    port: currentPort,
    allowRetry: false,
    keepAliveTimeout,
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
