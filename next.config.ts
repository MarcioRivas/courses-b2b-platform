import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The free-course catalog is now the "Disponibles" view of the single /learn screen.
  async redirects() {
    return [{ source: "/learn/catalog", destination: "/learn?vista=disponibles", permanent: false }];
  },
};

export default nextConfig;
