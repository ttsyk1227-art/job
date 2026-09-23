"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/constants";
import type { EnrollmentStatus } from "@prisma/client";

export async function updateStudent(formData: FormData) {
  await requireRole("ADMIN");

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const nameKana = String(formData.get("nameKana") ?? "").trim();
  const studentNumber = String(formData.get("studentNumber") ?? "").trim();
  const admissionYear = Number(formData.get("admissionYear"));
  const attendanceNumberRaw = formData.get("attendanceNumber");
  const attendanceNumber = attendanceNumberRaw
    ? Number(attendanceNumberRaw)
    : null;
  const classId = String(formData.get("classId") ?? "") || null;
  const status = String(
    formData.get("status") ?? "ENROLLED"
  ) as EnrollmentStatus;
  const contactInfo = String(formData.get("contactInfo") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!id || !name || !nameKana || !studentNumber || !admissionYear) {
    throw new Error("必須項目が入力されていません。");
  }
  if (!(status in ENROLLMENT_STATUS_LABEL)) {
    throw new Error("不正な在籍状況です。");
  }

  await prisma.student.update({
    where: { id },
    data: {
      name,
      nameKana,
      studentNumber,
      admissionYear,
      attendanceNumber,
      classId,
      status,
      contactInfo,
      note,
    },
  });

  revalidatePath(`/students/${id}`);
  revalidatePath("/students");
  redirect(`/students/${id}`);
}
