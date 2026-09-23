import Link from "next/link";
import Image from "next/image";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { studentWhereForSession } from "@/lib/permissions";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/constants";

export default async function StudentsPage(props: PageProps<"/students">) {
  const session = await requireSession();
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const classId =
    typeof searchParams.classId === "string" ? searchParams.classId : "";

  const baseWhere = studentWhereForSession(session);

  const filters = [
    baseWhere,
    classId ? { classId } : {},
    q
      ? {
          OR: [
            { name: { contains: q } },
            { nameKana: { contains: q } },
            { studentNumber: { contains: q } },
          ],
        }
      : {},
  ];

  const [students, classes] = await Promise.all([
    prisma.student.findMany({
      where: { AND: filters },
      include: {
        classGroup: true,
        clubs: { include: { club: true } },
      },
      orderBy: [
        { classGroup: { grade: "asc" } },
        { classGroup: { name: "asc" } },
        { attendanceNumber: "asc" },
      ],
    }),
    prisma.classGroup.findMany({
      where: session.role === "ADMIN" ? {} : { students: { some: baseWhere } },
      orderBy: [{ year: "desc" }, { grade: "asc" }, { name: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">生徒名簿</h1>
        {session.role === "ADMIN" && (
          <Link
            href="/students/new"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            生徒を登録
          </Link>
        )}
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-gray-600">
            氏名・かな・学籍番号で検索
          </label>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="例: 佐藤 / さとう / 2026-0201"
            className="mt-1 w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">
            クラス
          </label>
          <select
            name="classId"
            defaultValue={classId}
            className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">すべて</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.year}年度 {c.grade}年{c.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          絞り込む
        </button>
        {(q || classId) && (
          <Link
            href="/students"
            className="text-sm text-gray-500 underline hover:text-gray-900"
          >
            条件をクリア
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
            <tr>
              <th className="px-4 py-3">写真</th>
              <th className="px-4 py-3">氏名</th>
              <th className="px-4 py-3">クラス</th>
              <th className="px-4 py-3">部活動</th>
              <th className="px-4 py-3">状態</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.map((student) => (
              <tr key={student.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/students/${student.id}`}>
                    {student.photoUrl ? (
                      <Image
                        src={student.photoUrl}
                        alt={student.name}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-500">
                        {student.name.slice(0, 1)}
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/students/${student.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {student.name}
                  </Link>
                  <p className="text-xs text-gray-400">{student.nameKana}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {student.classGroup
                    ? `${student.classGroup.grade}年${student.classGroup.name}`
                    : "未所属"}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {student.clubs.length > 0
                    ? student.clubs.map((sc) => sc.club.name).join("、")
                    : "-"}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {ENROLLMENT_STATUS_LABEL[student.status]}
                  </span>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  条件に一致する生徒がいません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
