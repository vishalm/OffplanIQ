/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'images.propertyfinder.ae',
      'bayut-production.s3.eu-central-1.amazonaws.com',
      'cdn.offplaniq.com',
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['@supabase/supabase-js'],
  },
}

module.exports = nextConfig
