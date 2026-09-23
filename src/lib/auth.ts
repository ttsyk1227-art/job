import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const SESSION_COOKIE = "session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12; // 12時間(勤務時間程度でログアウト)

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET が設定されていません。.env を確認してください。");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionCookie(teacherId: string) {
  const token = await new SignJWT({})
    .setSubject(teacherId)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function destroySessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export type SessionTeacher = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/** Cookie の JWT を検証し、最新の教員情報を DB から取得する。未ログイン/無効なら null。 */
export async function getSession(): Promise<SessionTeacher | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const teacherId = payload.sub;
    if (!teacherId) return null;

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, name: true, email: true, role: true },
    });
    return teacher;
  } catch {
    return null;
  }
}

/** ログイン必須ページ用。未ログインならログイン画面へリダイレクト。 */
export async function requireSession(): Promise<SessionTeacher> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/** 指定ロールのみアクセス可能なページ用。 */
export async function requireRole(
  ...roles: Role[]
): Promise<SessionTeacher> {
  const session = await requireSession();
  if (!roles.includes(session.role)) {
    redirect("/");
  }
  return session;
}
