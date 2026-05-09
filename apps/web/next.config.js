// Load env from the monorepo root so we keep a single .env at the workspace root.
// @next/env is bundled with Next.js — no extra dep.
const path = require('path')
require('@next/env').loadEnvConfig(path.resolve(__dirname, '../..'))

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
