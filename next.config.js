/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // ジャケット画像はCSVで指定された任意のホストから読み込むため、
    // 最適化(next/image)は使わずに<img>で直接表示する方針にしています。
    unoptimized: true,
  },
};

module.exports = nextConfig;
