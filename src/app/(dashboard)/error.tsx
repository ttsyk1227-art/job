"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-6">
      <h2 className="text-sm font-semibold text-red-800">
        エラーが発生しました
      </h2>
      <p className="text-sm text-red-700">{error.message}</p>
      <div className="flex gap-3">
        <button
          onClick={() => retry()}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
        >
          再試行
        </button>
        <Link
          href="/"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
        >
          ダッシュボードへ戻る
        </Link>
      </div>
    </div>
  );
}
