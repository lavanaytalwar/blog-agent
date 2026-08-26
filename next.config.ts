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
};

export default config;
