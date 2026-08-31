/**
 * Cloud-hosted Vite configuration.
 *
 * God's Eye View implements its live-data proxies in Vite's server middleware,
 * so the server must remain active. These settings remove development-only
 * behavior that is wasteful or unstable inside a managed container.
 */
import baseConfig from './vite.config.js';

export default async (configEnv) => {
  const config = await baseConfig(configEnv);
  config.server = config.server || {};
  config.server.allowedHosts = true;
  config.server.hmr = false;
  config.server.watch = null;
  return config;
};
