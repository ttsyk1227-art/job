"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessStudent } from "@/lib/permissions";
import { saveStudentPhoto } from "@/lib/photo";
import { RECORD_CATEGORIES } from "@/lib/constants";
import type { RecordCategory } from "@prisma/client";

async function loadStudentForPermissionCheck(studentId: string) {
  return prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      classGroup: { select: { homeroomTeacherId: true } },
      clubs: { select: { club: { select: { advisorId: true } } } },
    },
  });
}

export async function addDailyRecord(formData: FormData) {
  const session = await requireSession();
  const studentId = String(formData.get("studentId") ?? "");
  const student = await loadStudentForPermissionCheck(studentId);
  if (!student || !canAccessStudent(session, student)) {
    throw new Error("この生徒の記録を追加する権限がありません。");
  }

  const category = String(
    formData.get("category") ?? "OTHER"
  ) as RecordCategory;
  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    throw new Error("記録内容を入力してください。");
  }
  if (!RECORD_CATEGORIES.includes(category)) {
    throw new Error("不正なカテゴリです。");
  }

  await prisma.dailyRecord.create({
    data: {
      studentId,
      authorId: session.id,
      category,
      content,
    },
  });

  revalidatePath(`/students/${studentId}`);
}

export async function uploadStudentPhoto(formData: FormData) {
  const session = await requireSession();
  const studentId = String(formData.get("studentId") ?? "");
  const student = await loadStudentForPermissionCheck(studentId);
  if (!student || !canAccessStudent(session, student)) {
    throw new Error("この生徒の写真を更新する権限がありません。");
  }

  const file = formData.get("photo");
  if (!(file instanceof File)) {
    throw new Error("写真ファイルを選択してください。");
  }

  const photoUrl = await saveStudentPhoto(studentId, file);
  await prisma.student.update({
    where: { id: studentId },
    data: { photoUrl },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}
