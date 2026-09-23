import type { Prisma } from "@prisma/client";
import type { SessionTeacher } from "@/lib/auth";

/**
 * ログイン中の教員が閲覧できる生徒を絞り込む Prisma の where 条件。
 * ADMIN は全生徒、STAFF は「自分が担任するクラス」または
 * 「自分が顧問を務める部活動」に所属する生徒のみ。
 */
export function studentWhereForSession(
  session: SessionTeacher
): Prisma.StudentWhereInput {
  if (session.role === "ADMIN") {
    return {};
  }
  return {
    OR: [
      { classGroup: { homeroomTeacherId: session.id } },
      { clubs: { some: { club: { advisorId: session.id } } } },
    ],
  };
}

type StudentForPermissionCheck = {
  classGroup: { homeroomTeacherId: string | null } | null;
  clubs: { club: { advisorId: string | null } }[];
};

/** 特定の生徒1件に対して、ログイン中の教員がアクセス可能かを判定する。 */
export function canAccessStudent(
  session: SessionTeacher,
  student: StudentForPermissionCheck
): boolean {
  if (session.role === "ADMIN") return true;
  if (student.classGroup?.homeroomTeacherId === session.id) return true;
  return student.clubs.some((sc) => sc.club.advisorId === session.id);
}

/** 部活動一覧の絞り込み。ADMIN は全部活動、STAFF は自分が顧問の部活動のみ。 */
export function clubWhereForSession(
  session: SessionTeacher
): Prisma.ClubWhereInput {
  if (session.role === "ADMIN") return {};
  return { advisorId: session.id };
}

export function canAccessClub(
  session: SessionTeacher,
  club: { advisorId: string | null }
): boolean {
  if (session.role === "ADMIN") return true;
  return club.advisorId === session.id;
}
