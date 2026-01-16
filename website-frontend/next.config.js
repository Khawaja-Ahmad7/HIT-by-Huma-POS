/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export',
    trailingSlash: true,
    images: {
        unoptimized: true,
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'res.cloudinary.com',
            },
            {
                protocol: 'https',
                hostname: '*.cloudinary.com',
            },
        ],
    },
    env: {
        // Force the production URL when building, regardless of .env.local
        NEXT_PUBLIC_API_URL: process.env.NODE_ENV === 'production'
            ? 'https://hitbyhuma.com/api'
            : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'),
    },
};

module.exports = nextConfig;
