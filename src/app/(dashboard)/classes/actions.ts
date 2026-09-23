"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function createClass(formData: FormData) {
  await requireRole("ADMIN");

  const year = Number(formData.get("year"));
  const grade = Number(formData.get("grade"));
  const name = String(formData.get("name") ?? "").trim();
  const homeroomTeacherId =
    String(formData.get("homeroomTeacherId") ?? "") || null;

  if (!year || !grade || !name) {
    throw new Error("年度・学年・クラス名を入力してください。");
  }

  const existing = await prisma.classGroup.findUnique({
    where: { year_grade_name: { year, grade, name } },
  });
  if (existing) {
    throw new Error("同じ年度・学年・クラス名の組み合わせが既に存在します。");
  }

  await prisma.classGroup.create({
    data: { year, grade, name, homeroomTeacherId },
  });

  revalidatePath("/classes");
}

export async function updateClassHomeroom(formData: FormData) {
  await requireRole("ADMIN");

  const classId = String(formData.get("classId") ?? "");
  const homeroomTeacherId =
    String(formData.get("homeroomTeacherId") ?? "") || null;

  await prisma.classGroup.update({
    where: { id: classId },
    data: { homeroomTeacherId },
  });

  revalidatePath("/classes");
}
