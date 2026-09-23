import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_LABEL } from "@/lib/constants";
import { createTeacher, updateTeacherRole } from "./actions";

export default async function TeachersPage() {
  const session = await requireRole("ADMIN");

  const teachers = await prisma.teacher.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">教員アカウント管理</h1>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">
          新しい教員アカウントを追加
        </h2>
        <form
          action={createTeacher}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-600">
              氏名
            </label>
            <input
              name="name"
              required
              className="mt-1 w-40 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              メールアドレス
            </label>
            <input
              type="email"
              name="email"
              required
              className="mt-1 w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              初期パスワード
            </label>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              className="mt-1 w-40 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              ロール
            </label>
            <select
              name="role"
              defaultValue="STAFF"
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="STAFF">教員</option>
              <option value="ADMIN">管理者</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            追加
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          パスワードは本人に安全な方法で伝え、初回ログイン後の変更を案内してください(現バージョンにパスワード変更画面はありません)。
        </p>
      </section>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
            <tr>
              <th className="px-4 py-3">氏名</th>
              <th className="px-4 py-3">メールアドレス</th>
              <th className="px-4 py-3">ロール</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {teachers.map((teacher) => (
              <tr key={teacher.id}>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {teacher.name}
                </td>
                <td className="px-4 py-3 text-gray-700">{teacher.email}</td>
                <td className="px-4 py-3">
                  {teacher.id === session.id ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {ROLE_LABEL[teacher.role]}(自分)
                    </span>
                  ) : (
                    <form
                      action={updateTeacherRole}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="hidden"
                        name="teacherId"
                        value={teacher.id}
                      />
                      <select
                        name="role"
                        defaultValue={teacher.role}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      >
                        <option value="STAFF">教員</option>
                        <option value="ADMIN">管理者</option>
                      </select>
                      <button
                        type="submit"
                        className="text-xs text-gray-500 underline hover:text-gray-900"
                      >
                        更新
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
