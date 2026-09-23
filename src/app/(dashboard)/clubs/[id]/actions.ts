"use server";

import { revalidatePath } from "next/cache";
import { requireSession, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessClub } from "@/lib/permissions";

async function assertClubAccess(clubId: string) {
  const session = await requireSession();
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, advisorId: true },
  });
  if (!club || !canAccessClub(session, club)) {
    throw new Error("この部活動を編集する権限がありません。");
  }
  return club;
}

export async function addClubMember(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  await assertClubAccess(clubId);

  const studentId = String(formData.get("studentId") ?? "");
  const position = String(formData.get("position") ?? "").trim() || null;
  if (!studentId) {
    throw new Error("生徒を選択してください。");
  }

  const existing = await prisma.studentClub.findUnique({
    where: { studentId_clubId: { studentId, clubId } },
  });
  if (existing) {
    throw new Error("この生徒は既に部員として登録されています。");
  }

  await prisma.studentClub.create({
    data: { studentId, clubId, position },
  });

  revalidatePath(`/clubs/${clubId}`);
}

export async function removeClubMember(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  await assertClubAccess(clubId);

  const membershipId = String(formData.get("membershipId") ?? "");
  await prisma.studentClub.delete({ where: { id: membershipId } });

  revalidatePath(`/clubs/${clubId}`);
}

export async function setClubAdvisor(formData: FormData) {
  await requireRole("ADMIN");

  const clubId = String(formData.get("clubId") ?? "");
  const advisorId = String(formData.get("advisorId") ?? "") || null;

  await prisma.club.update({
    where: { id: clubId },
    data: { advisorId },
  });

  revalidatePath(`/clubs/${clubId}`);
}
