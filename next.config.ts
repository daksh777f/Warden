import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Pin the tracing root to THIS project directory.
  // Without this, Next.js detects the package-lock.json at C:\Users\iamda\
  // and incorrectly infers the workspace root as C:\Users\iamda\, which
  // causes /_next/static/chunks/main-app.js to return 404 and breaks
  // React hydration entirely (event handlers never attach, inputs are dead).
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
