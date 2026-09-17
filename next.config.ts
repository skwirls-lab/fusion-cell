import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite ships a WASM binary and native-ish loaders; keep it out of the
  // bundler and let Node resolve it at runtime. Same for pg.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // Reseed reads data/seed/*.json from disk at request time; serverless bundles
  // only include files the tracer can see, so name them explicitly.
  outputFileTracingIncludes: { '/api/admin/reseed': ['./data/seed/**', './supabase/migrations/**'] },
  experimental: {
    // deck.gl / cytoscape are large; keep server bundle lean
    optimizePackageImports: ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/react'],
  },
};

export default nextConfig;
