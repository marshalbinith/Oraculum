/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // stellar-sdk pulls optional native deps it doesn't need in the browser.
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    return config;
  },
};

export default nextConfig;
