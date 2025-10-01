// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // don’t break build on lint/prettier warnings
  },
  typescript: {
    ignoreBuildErrors: true, // don’t break build on missing types
  },
  webpack: (config) => {
    // Prevent libraries from trying to read local test/data files
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };
    return config;
  },
};

module.exports = nextConfig;