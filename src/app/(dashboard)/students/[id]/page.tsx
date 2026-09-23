import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessStudent } from "@/lib/permissions";
import {
  ENROLLMENT_STATUS_LABEL,
  RECORD_CATEGORIES,
  RECORD_CATEGORY_LABEL,
} from "@/lib/constants";
import { addDailyRecord, uploadStudentPhoto } from "./actions";

export default async function StudentDetailPage(
  props: PageProps<"/students/[id]">
) {
  const session = await requireSession();
  const { id } = await props.params;

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      classGroup: { include: { homeroomTeacher: true } },
      clubs: { include: { club: { include: { advisor: true } } } },
      dailyRecords: {
        orderBy: { recordDate: "desc" },
        include: { author: { select: { name: true } } },
      },
    },
  });

  if (!student || !canAccessStudent(session, student)) {
    notFound();
  }

  const canEditProfile = session.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {student.photoUrl ? (
            <Image
              src={student.photoUrl}
              alt={student.name}
              width={80}
              height={80}
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-200 text-2xl text-gray-500">
              {student.name.slice(0, 1)}
            </span>
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {student.name}
            </h1>
            <p className="text-sm text-gray-500">{student.nameKana}</p>
            <p className="mt-1 text-xs text-gray-400">
              学籍番号: {student.studentNumber}
            </p>
          </div>
        </div>
        {canEditProfile && (
          <Link
            href={`/students/${student.id}/edit`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            基本情報を編集
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">基本情報</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">クラス</dt>
                <dd className="text-gray-900">
                  {student.classGroup
                    ? `${student.classGroup.grade}年${student.classGroup.name}`
                    : "未所属"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">出席番号</dt>
                <dd className="text-gray-900">
                  {student.attendanceNumber ?? "-"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">入学年度</dt>
                <dd className="text-gray-900">{student.admissionYear}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">在籍状況</dt>
                <dd className="text-gray-900">
                  {ENROLLMENT_STATUS_LABEL[student.status]}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">連絡先</dt>
                <dd className="text-gray-900">
                  {student.contactInfo ?? "-"}
                </dd>
              </div>
              {student.note && (
                <div>
                  <dt className="text-gray-500">メモ</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-gray-900">
                    {student.note}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">部活動</h2>
            {student.clubs.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                所属している部活動はありません。
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {student.clubs.map((sc) => (
                  <li key={sc.id} className="flex items-center justify-between">
                    <Link
                      href={`/clubs/${sc.club.id}`}
                      className="text-gray-900 hover:underline"
                    >
                      {sc.club.name}
                    </Link>
                    {sc.position && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {sc.position}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">写真の更新</h2>
            <form
              action={uploadStudentPhoto}
              className="mt-3 space-y-3"
            >
              <input type="hidden" name="studentId" value={student.id} />
              <input
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp"
                required
                className="block w-full text-sm text-gray-600"
              />
              <button
                type="submit"
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
              >
                アップロード
              </button>
              <p className="text-xs text-gray-400">
                JPEG・PNG・WEBP形式、5MBまで。
              </p>
            </form>
          </section>
        </div>

        <div className="lg:col-span-2">
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-900">
                日常記録・メモ
              </h2>
            </div>

            <form
              action={addDailyRecord}
              className="space-y-3 border-b border-gray-100 px-5 py-4"
            >
              <input type="hidden" name="studentId" value={student.id} />
              <div className="flex flex-wrap gap-3">
                <select
                  name="category"
                  defaultValue="OTHER"
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                >
                  {RECORD_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {RECORD_CATEGORY_LABEL[category]}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                name="content"
                required
                rows={3}
                placeholder="記録内容を入力してください"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
              >
                記録を追加
              </button>
            </form>

            {student.dailyRecords.length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-500">
                まだ記録がありません。
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {student.dailyRecords.map((record) => (
                  <li key={record.id} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {RECORD_CATEGORY_LABEL[record.category]}
                      </span>
                      <span className="text-xs text-gray-400">
                        {record.recordDate.toLocaleString("ja-JP")}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                      {record.content}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      記入者: {record.author.name}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
