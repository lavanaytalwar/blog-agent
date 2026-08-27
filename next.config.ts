import type { NextConfig } from 'next';

const config: NextConfig = {
  // lib/ and scripts/ run under tsx as ESM, so their relative imports carry the
  // .js extension the runtime expects. Webpack needs to be told those resolve
  // back to the .ts sources.
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return webpackConfig;
  },
  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
  // config/*.json is the source of truth for the keyword list and every gate,
  // and loadConfig() reads it at runtime through a path built from an env var.
  // The tracer cannot follow that, so on Vercel the files were simply absent
  // and every screen touching the keyword list returned a 500. Tracing is per
  // route, and the loaders reach the gates from enough entry points that
  // naming them individually would rot; '/**' covers the lot.
  outputFileTracingIncludes: {
    '/**': ['./config/*.json'],
  },
};

export default config;
