import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { studentWhereForSession, clubWhereForSession } from "@/lib/permissions";
import { RECORD_CATEGORY_LABEL } from "@/lib/constants";

export default async function DashboardPage() {
  const session = await requireSession();
  const studentWhere = studentWhereForSession(session);
  const clubWhere = clubWhereForSession(session);

  const [studentCount, clubCount, recentRecords] = await Promise.all([
    prisma.student.count({
      where: { ...studentWhere, status: "ENROLLED" },
    }),
    prisma.club.count({ where: clubWhere }),
    prisma.dailyRecord.findMany({
      where: { student: studentWhere },
      orderBy: { recordDate: "desc" },
      take: 8,
      include: {
        student: { select: { id: true, name: true } },
        author: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="mt-1 text-sm text-gray-500">
          {session.name} さん、お疲れさまです。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/students"
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-gray-300"
        >
          <p className="text-sm text-gray-500">閲覧可能な在籍生徒数</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">
            {studentCount}
            <span className="ml-1 text-base font-normal text-gray-500">
              人
            </span>
          </p>
        </Link>
        <Link
          href="/clubs"
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-gray-300"
        >
          <p className="text-sm text-gray-500">担当部活動数</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">
            {clubCount}
            <span className="ml-1 text-base font-normal text-gray-500">
              部
            </span>
          </p>
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">
            最近の日常記録
          </h2>
        </div>
        {recentRecords.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">
            まだ記録がありません。
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentRecords.map((record) => (
              <li key={record.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/students/${record.student.id}`}
                    className="text-sm font-medium text-gray-900 hover:underline"
                  >
                    {record.student.name}
                  </Link>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {RECORD_CATEGORY_LABEL[record.category]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-700">{record.content}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {record.recordDate.toLocaleString("ja-JP")} ・{" "}
                  {record.author.name}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
