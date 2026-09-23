import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createStudent } from "./actions";

export default async function NewStudentPage() {
  await requireRole("ADMIN");

  const classes = await prisma.classGroup.findMany({
    orderBy: [{ year: "desc" }, { grade: "asc" }, { name: "asc" }],
  });

  const currentYear = new Date().getFullYear();

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-gray-900">生徒を登録</h1>

      <form
        action={createStudent}
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              氏名
            </label>
            <input
              name="name"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              ふりがな
            </label>
            <input
              name="nameKana"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              学籍番号
            </label>
            <input
              name="studentNumber"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              入学年度
            </label>
            <input
              type="number"
              name="admissionYear"
              defaultValue={currentYear}
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              クラス
            </label>
            <select
              name="classId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">未所属</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.year}年度 {c.grade}年{c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              出席番号
            </label>
            <input
              type="number"
              name="attendanceNumber"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">
              連絡先
            </label>
            <input
              name="contactInfo"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
        >
          登録する
        </button>
      </form>
    </div>
  );
}
