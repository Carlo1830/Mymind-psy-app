import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  serverExternalPackages: ['pg'],
  outputFileTracingIncludes: { '/*': ['./database/certs/supabase-ca.crt'] },
};
export default nextConfig;
