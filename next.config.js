// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // don’t fail deploys on Prettier/ESLint warnings
  },
  webpack: (config) => {
    // ignore problematic test/data folders from some libs
    config.externals.push({
      fs: "commonjs fs", // stop bundling node 'fs' module
    });
    return config;
  },
};

module.exports = nextConfig;