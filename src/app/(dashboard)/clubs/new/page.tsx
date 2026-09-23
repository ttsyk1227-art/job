import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createClub } from "./actions";

export default async function NewClubPage() {
  await requireRole("ADMIN");

  const teachers = await prisma.teacher.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-bold text-gray-900">部活動を登録</h1>

      <form
        action={createClub}
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700">
            部活動名
          </label>
          <input
            name="name"
            required
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            顧問
          </label>
          <select
            name="advisorId"
            defaultValue=""
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
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
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
        >
          登録する
        </button>
      </form>
    </div>
  );
}
