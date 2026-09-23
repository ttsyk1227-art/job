import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 生徒の個人写真アップロードに対応するため上限を引き上げる
      bodySizeLimit: "5mb",
    },
  },
  images: {
    localPatterns: [
      {
        // 写真差し替え時のキャッシュ回避用に ?v=タイムスタンプ を付与しているため
        // search を指定せず全クエリを許可する(対象パスは自前のアップロード先のみ)
        pathname: "/uploads/students/**",
      },
    ],
  },
};

export default nextConfig;
