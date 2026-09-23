import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessClub } from "@/lib/permissions";
import { addClubMember, removeClubMember, setClubAdvisor } from "./actions";

export default async function ClubDetailPage(
  props: PageProps<"/clubs/[id]">
) {
  const session = await requireSession();
  const { id } = await props.params;

  const club = await prisma.club.findUnique({
    where: { id },
    include: {
      advisor: true,
      members: {
        include: { student: true },
        orderBy: { student: { name: "asc" } },
      },
    },
  });

  if (!club || !canAccessClub(session, club)) {
    notFound();
  }

  const memberStudentIds = club.members.map((m) => m.studentId);

  const [availableStudents, teachers] = await Promise.all([
    prisma.student.findMany({
      where: {
        status: "ENROLLED",
        id: { notIn: memberStudentIds },
      },
      orderBy: { name: "asc" },
    }),
    session.role === "ADMIN"
      ? prisma.teacher.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{club.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          顧問: {club.advisor?.name ?? "未設定"}
        </p>
      </div>

      {session.role === "ADMIN" && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">顧問の設定</h2>
          <form
            action={setClubAdvisor}
            className="mt-3 flex flex-wrap items-center gap-3"
          >
            <input type="hidden" name="clubId" value={club.id} />
            <select
              name="advisorId"
              defaultValue={club.advisorId ?? ""}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
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
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              更新
            </button>
          </form>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">
            部員一覧({club.members.length}人)
          </h2>
        </div>

        <form
          action={addClubMember}
          className="flex flex-wrap items-end gap-3 border-b border-gray-100 px-5 py-4"
        >
          <input type="hidden" name="clubId" value={club.id} />
          <div>
            <label className="block text-xs font-medium text-gray-600">
              生徒を追加
            </label>
            <select
              name="studentId"
              required
              defaultValue=""
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="" disabled>
                選択してください
              </option>
              {availableStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}({s.studentNumber})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              役職(任意)
            </label>
            <input
              name="position"
              placeholder="部長 など"
              className="mt-1 w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            追加
          </button>
        </form>

        {club.members.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">部員がいません。</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {club.members.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between px-5 py-3"
              >
                <div>
                  <Link
                    href={`/students/${member.student.id}`}
                    className="text-sm font-medium text-gray-900 hover:underline"
                  >
                    {member.student.name}
                  </Link>
                  {member.position && (
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {member.position}
                    </span>
                  )}
                </div>
                <form action={removeClubMember}>
                  <input type="hidden" name="clubId" value={club.id} />
                  <input
                    type="hidden"
                    name="membershipId"
                    value={member.id}
                  />
                  <button
                    type="submit"
                    className="text-xs text-gray-400 underline hover:text-red-600"
                  >
                    削除
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
