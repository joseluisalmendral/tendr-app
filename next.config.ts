import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next dev blocks cross-origin requests to its dev resources by default.
  // The local Supabase auth flow redirects through 127.0.0.1 (site_url), so
  // allow it in development to keep hydration working on that origin.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
