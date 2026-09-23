import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clubWhereForSession } from "@/lib/permissions";

export default async function ClubsPage() {
  const session = await requireSession();

  const clubs = await prisma.club.findMany({
    where: clubWhereForSession(session),
    include: {
      advisor: { select: { name: true } },
      _count: { select: { members: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">部活動</h1>
        {session.role === "ADMIN" && (
          <Link
            href="/clubs/new"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            部活動を登録
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clubs.map((club) => (
          <Link
            key={club.id}
            href={`/clubs/${club.id}`}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-gray-300"
          >
            <h2 className="text-base font-semibold text-gray-900">
              {club.name}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              顧問: {club.advisor?.name ?? "未設定"}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              部員数: {club._count.members}人
            </p>
          </Link>
        ))}
        {clubs.length === 0 && (
          <p className="text-sm text-gray-500">
            表示できる部活動がありません。
          </p>
        )}
      </div>
    </div>
  );
}
