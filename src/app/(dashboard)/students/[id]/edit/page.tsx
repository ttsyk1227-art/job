import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/constants";
import { updateStudent } from "./actions";

export default async function EditStudentPage(
  props: PageProps<"/students/[id]/edit">
) {
  await requireRole("ADMIN");
  const { id } = await props.params;

  const [student, classes] = await Promise.all([
    prisma.student.findUnique({ where: { id } }),
    prisma.classGroup.findMany({
      orderBy: [{ year: "desc" }, { grade: "asc" }, { name: "asc" }],
    }),
  ]);

  if (!student) {
    notFound();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-gray-900">基本情報の編集</h1>

      <form
        action={updateStudent}
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="id" value={student.id} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              氏名
            </label>
            <input
              name="name"
              defaultValue={student.name}
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
              defaultValue={student.nameKana}
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
              defaultValue={student.studentNumber}
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
              defaultValue={student.admissionYear}
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
              defaultValue={student.classId ?? ""}
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
              defaultValue={student.attendanceNumber ?? ""}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              在籍状況
            </label>
            <select
              name="status"
              defaultValue={student.status}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              {Object.entries(ENROLLMENT_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              連絡先
            </label>
            <input
              name="contactInfo"
              defaultValue={student.contactInfo ?? ""}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            メモ
          </label>
          <textarea
            name="note"
            defaultValue={student.note ?? ""}
            rows={3}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
        >
          保存する
        </button>
      </form>
    </div>
  );
}
