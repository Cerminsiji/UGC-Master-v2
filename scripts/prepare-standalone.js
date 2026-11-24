const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const standaloneDir = path.join(rootDir, '.next', 'standalone');

if (!fs.existsSync(standaloneDir)) {
  process.exit(0);
}

// 1. Ensure complete .next/server (webpack-runtime.js + chunks), .next/static, and public inside .next/standalone
const serverSrc = path.join(rootDir, '.next', 'server');
const serverDst = path.join(standaloneDir, '.next', 'server');
if (fs.existsSync(serverSrc)) {
  fs.cpSync(serverSrc, serverDst, { recursive: true, force: true });
}

const staticSrc = path.join(rootDir, '.next', 'static');
const staticDst = path.join(standaloneDir, '.next', 'static');
if (fs.existsSync(staticSrc)) {
  fs.cpSync(staticSrc, staticDst, { recursive: true, force: true });
}

const publicSrc = path.join(rootDir, 'public');
const publicDst = path.join(standaloneDir, 'public');
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, publicDst, { recursive: true, force: true });
}

// 2. Patch standalone server.js port resolution when nginx owns PORT=NGINX_PORT
const standaloneServerJs = path.join(standaloneDir, 'server.js');
if (fs.existsSync(standaloneServerJs)) {
  let srv = fs.readFileSync(standaloneServerJs, 'utf8');
  const portSnippet = 'const currentPort = parseInt(process.env.PORT, 10) || 3000';
  if (srv.includes(portSnippet)) {
    srv = srv.replace(
      portSnippet,
      'const currentPort = parseInt((process.env.NGINX_PORT && process.env.PORT === process.env.NGINX_PORT && process.env.DEFAULT_APP_PORT) ? process.env.DEFAULT_APP_PORT : process.env.PORT, 10) || 3000'
    );
    fs.writeFileSync(standaloneServerJs, srv, 'utf8');
  }
}

// 3. Copy Python cleaner script
const pySrc = path.join(rootDir, 'scripts', 'ffmpeg_cleaner.py');
const pyDst = path.join(standaloneDir, 'scripts', 'ffmpeg_cleaner.py');
if (fs.existsSync(pySrc)) {
  fs.mkdirSync(path.dirname(pyDst), { recursive: true });
  fs.copyFileSync(pySrc, pyDst);
}

// 4. Copy required runtime node_modules (trimmed of source maps, dev/turbo/experimental bundles)
const rootModules = path.join(rootDir, 'node_modules');
const dstModules = path.join(standaloneDir, 'node_modules');
fs.mkdirSync(dstModules, { recursive: true });

const seedPackages = [
  'next',
  'react',
  'react-dom',
  'styled-jsx',
  '@swc/helpers',
  'client-only',
  '@google/genai',
  'ffmpeg-static',
  'ffprobe-static',
];

const skipPackages = new Set([
  'sharp',
  'typescript',
  'eslint',
  'caniuse-lite',
  'postcss',
  'autoprefixer',
  'tailwindcss',
  'lightningcss',
]);

const nextCompiledSkipDirs = [
  '/node_modules/next/dist/compiled/terser',
  '/node_modules/next/dist/compiled/sass-loader',
  '/node_modules/next/dist/compiled/react-dom-experimental',
  '/node_modules/next/dist/compiled/react-server-dom-webpack-experimental',
  '/node_modules/next/dist/compiled/react-server-dom-turbopack',
  '/node_modules/next/dist/compiled/react-server-dom-turbopack-experimental',
  '/node_modules/next/dist/compiled/cssnano-simple',
  '/node_modules/next/dist/compiled/postcss-preset-env',
];

const visited = new Set();
const queue = [...seedPackages];

function shouldSkipPath(srcPath) {
  const norm = srcPath.replace(/\\/g, '/');
  if (norm.endsWith('.map') || norm.endsWith('.d.ts')) return true;
  if (norm.includes('/node_modules/ffprobe-static/bin/darwin/')) return true;
  if (norm.includes('/node_modules/ffprobe-static/bin/win32/')) return true;
  if (norm.includes('/node_modules/ffprobe-static/bin/linux/ia32/')) return true;
  if (norm.includes('/node_modules/ffprobe-static/bin/linux/arm64/')) return true;
  if (norm.includes('/node_modules/@img/')) return true;
  if (norm.includes('/node_modules/@next/swc-')) return true;
  if (norm.includes('/node_modules/next/dist/esm')) return true;
  if (norm.includes('/node_modules/next/dist/experimental')) return true;
  if (norm.includes('/node_modules/next/dist/compiled/next-server/')) {
    // Keep only non-experimental, non-turbo production runtimes inside compiled/next-server
    const base = path.basename(norm);
    if (base && (base.includes('.dev.') || base.includes('-turbo') || base.includes('-experimental'))) {
      return true;
    }
  }
  for (const dir of nextCompiledSkipDirs) {
    if (norm.includes(dir)) return true;
  }
  return false;
}

function findPackageDir(pkgName, fromDir) {
  let cur = fromDir;
  while (cur && cur.startsWith(rootDir)) {
    const candidate = path.join(cur, 'node_modules', ...pkgName.split('/'));
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  const topCandidate = path.join(rootModules, ...pkgName.split('/'));
  if (fs.existsSync(path.join(topCandidate, 'package.json'))) {
    return topCandidate;
  }
  return null;
}

while (queue.length > 0) {
  const pkgName = queue.shift();
  if (!pkgName || visited.has(pkgName) || skipPackages.has(pkgName)) continue;
  if (pkgName.startsWith('@img/') || pkgName.startsWith('@next/swc-') || pkgName.startsWith('@types/')) {
    continue;
  }
  visited.add(pkgName);

  const srcPkgDir = findPackageDir(pkgName, rootDir);
  if (!srcPkgDir) continue;

  const relFromModules = path.relative(rootModules, srcPkgDir);
  const dstPkgDir = path.join(dstModules, relFromModules);

  try {
    fs.cpSync(srcPkgDir, dstPkgDir, {
      recursive: true,
      force: true,
      filter: (src) => !shouldSkipPath(src),
    });
  } catch (err) {
    console.warn(`prepare-standalone warning copying ${pkgName}:`, err.message);
  }

  try {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(srcPkgDir, 'package.json'), 'utf8'));
    const deps = {
      ...(pkgJson.dependencies || {}),
      ...(pkgJson.optionalDependencies || {}),
    };
    for (const dep of Object.keys(deps)) {
      if (!visited.has(dep) && !skipPackages.has(dep)) {
        queue.push(dep);
      }
    }
  } catch {
    // Ignore malformed package.json
  }
}
