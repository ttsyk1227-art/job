"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function createStudent(formData: FormData) {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const nameKana = String(formData.get("nameKana") ?? "").trim();
  const studentNumber = String(formData.get("studentNumber") ?? "").trim();
  const admissionYear = Number(formData.get("admissionYear"));
  const attendanceNumberRaw = formData.get("attendanceNumber");
  const attendanceNumber = attendanceNumberRaw
    ? Number(attendanceNumberRaw)
    : null;
  const classId = String(formData.get("classId") ?? "") || null;
  const contactInfo = String(formData.get("contactInfo") ?? "").trim() || null;

  if (!name || !nameKana || !studentNumber || !admissionYear) {
    throw new Error("必須項目が入力されていません。");
  }

  const existing = await prisma.student.findUnique({
    where: { studentNumber },
  });
  if (existing) {
    throw new Error("この学籍番号は既に使用されています。");
  }

  const student = await prisma.student.create({
    data: {
      name,
      nameKana,
      studentNumber,
      admissionYear,
      attendanceNumber,
      classId,
      contactInfo,
    },
  });

  revalidatePath("/students");
  redirect(`/students/${student.id}`);
}
