/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  headers: async () => [
    {
      source: '/firebase-messaging-sw.js',
      headers: [{ key: 'Service-Worker-Allowed', value: '/' }],
    },
  ],
};
export default nextConfig;
