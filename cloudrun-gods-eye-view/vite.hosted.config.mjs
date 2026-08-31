/**
 * Low-memory hosted configuration for God's Eye View.
 *
 * The upstream Vite plugins are still loaded because they ARE the live-data
 * backend. The browser bundle, however, is compiled once during the Docker
 * build and served directly from dist/. That avoids runtime esbuild transforms,
 * which are the expensive part on a 512 MB free container.
 */
import fs from 'node:fs';
import path from 'node:path';
import baseConfig from './vite.config.js';

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'],
  ['.wasm', 'application/wasm'],
  ['.xml', 'application/xml'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

function prebuiltFrontendPlugin() {
  const distRoot = path.resolve(process.cwd(), 'dist');
  const indexPath = path.join(distRoot, 'index.html');

  return {
    name: 'gev-prebuilt-frontend',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        try {
          const url = new URL(req.url || '/', 'http://localhost');
          const pathname = decodeURIComponent(url.pathname);

          // The upstream plugins own every API route.
          if (pathname === '/api' || pathname.startsWith('/api/')) return next();

          const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
          let candidate = path.resolve(distRoot, relative);

          // Never allow a URL to escape dist/.
          if (candidate !== distRoot && !candidate.startsWith(`${distRoot}${path.sep}`)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
          }

          try {
            if (fs.statSync(candidate).isDirectory()) candidate = path.join(candidate, 'index.html');
          } catch {
            // Share links and client-side routes should still open the app shell.
            candidate = indexPath;
          }

          if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return next();

          const type = MIME.get(path.extname(candidate).toLowerCase()) || 'application/octet-stream';
          res.statusCode = 200;
          res.setHeader('Content-Type', type);
          res.setHeader('Cache-Control', candidate === indexPath
            ? 'no-cache'
            : 'public, max-age=31536000, immutable');
          fs.createReadStream(candidate).pipe(res);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default async (configEnv) => {
  const config = await baseConfig(configEnv);
  config.server = config.server || {};
  config.server.allowedHosts = true;
  config.server.hmr = false;
  config.server.watch = null;

  // There is nothing left for Vite to discover or transform in the browser.
  config.appType = 'custom';
  config.optimizeDeps = {
    ...(config.optimizeDeps || {}),
    noDiscovery: true,
    include: [],
  };
  config.plugins = [prebuiltFrontendPlugin(), ...(config.plugins || [])];
  return config;
};
