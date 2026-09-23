"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function createClub(formData: FormData) {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const advisorId = String(formData.get("advisorId") ?? "") || null;

  if (!name) {
    throw new Error("部活動名を入力してください。");
  }

  const existing = await prisma.club.findUnique({ where: { name } });
  if (existing) {
    throw new Error("同名の部活動が既に存在します。");
  }

  const club = await prisma.club.create({ data: { name, advisorId } });

  revalidatePath("/clubs");
  redirect(`/clubs/${club.id}`);
}
