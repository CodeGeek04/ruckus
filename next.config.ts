import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev overlay floats over the phone UI, which is small enough that it
  // covers real controls, and automated runs click it by mistake.
  devIndicators: false,
  /* config options here */
};

export default nextConfig;
