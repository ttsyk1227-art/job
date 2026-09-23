"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSessionCookie } from "@/lib/auth";

function safeRedirectTarget(from: FormDataEntryValue | null): string {
  const value = typeof from === "string" ? from : "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function login(formData: FormData) {
  const from = safeRedirectTarget(formData.get("from"));
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(`/login?error=1&from=${encodeURIComponent(from)}`);
  }

  const teacher = await prisma.teacher.findUnique({ where: { email } });
  const valid = teacher
    ? await verifyPassword(password, teacher.passwordHash)
    : false;

  if (!teacher || !valid) {
    redirect(`/login?error=1&from=${encodeURIComponent(from)}`);
  }

  await createSessionCookie(teacher.id);
  redirect(from);
}
