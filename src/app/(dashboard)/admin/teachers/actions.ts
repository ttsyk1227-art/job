"use server";

import { revalidatePath } from "next/cache";
import { requireRole, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

export async function createTeacher(formData: FormData) {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "STAFF") as Role;

  if (!name || !email || !password) {
    throw new Error("氏名・メールアドレス・パスワードを入力してください。");
  }
  if (password.length < 8) {
    throw new Error("パスワードは8文字以上にしてください。");
  }
  if (role !== "ADMIN" && role !== "STAFF") {
    throw new Error("不正なロールです。");
  }

  const existing = await prisma.teacher.findUnique({ where: { email } });
  if (existing) {
    throw new Error("このメールアドレスは既に使用されています。");
  }

  const passwordHash = await hashPassword(password);
  await prisma.teacher.create({
    data: { name, email, passwordHash, role },
  });

  revalidatePath("/admin/teachers");
}

export async function updateTeacherRole(formData: FormData) {
  const session = await requireRole("ADMIN");

  const teacherId = String(formData.get("teacherId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;

  if (role !== "ADMIN" && role !== "STAFF") {
    throw new Error("不正なロールです。");
  }
  if (teacherId === session.id && role !== "ADMIN") {
    throw new Error("自分自身の管理者権限は削除できません。");
  }

  await prisma.teacher.update({
    where: { id: teacherId },
    data: { role },
  });

  revalidatePath("/admin/teachers");
}
