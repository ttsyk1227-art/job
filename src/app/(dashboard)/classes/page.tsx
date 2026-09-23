import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createClass, updateClassHomeroom } from "./actions";

export default async function ClassesPage() {
  await requireRole("ADMIN");

  const currentYear = new Date().getFullYear();

  const [classes, teachers] = await Promise.all([
    prisma.classGroup.findMany({
      include: {
        homeroomTeacher: true,
        _count: { select: { students: true } },
      },
      orderBy: [{ year: "desc" }, { grade: "asc" }, { name: "asc" }],
    }),
    prisma.teacher.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">クラス管理</h1>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">新規クラス</h2>
        <form
          action={createClass}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-600">
              年度
            </label>
            <input
              type="number"
              name="year"
              defaultValue={currentYear}
              required
              className="mt-1 w-28 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              学年
            </label>
            <input
              type="number"
              name="grade"
              min={1}
              max={6}
              required
              className="mt-1 w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              クラス名
            </label>
            <input
              name="name"
              placeholder="A組"
              required
              className="mt-1 w-28 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              担任
            </label>
            <select
              name="homeroomTeacherId"
              defaultValue=""
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">未設定</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            作成
          </button>
        </form>
      </section>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
            <tr>
              <th className="px-4 py-3">年度</th>
              <th className="px-4 py-3">学年・クラス</th>
              <th className="px-4 py-3">生徒数</th>
              <th className="px-4 py-3">担任</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {classes.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 text-gray-700">{c.year}</td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {c.grade}年{c.name}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {c._count.students}人
                </td>
                <td className="px-4 py-3">
                  <form
                    action={updateClassHomeroom}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="classId" value={c.id} />
                    <select
                      name="homeroomTeacherId"
                      defaultValue={c.homeroomTeacherId ?? ""}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="">未設定</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="text-xs text-gray-500 underline hover:text-gray-900"
                    >
                      更新
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {classes.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  クラスがまだ登録されていません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
