import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "students");

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

/** 生徒の個人写真を public/uploads/students に保存し、参照用パスを返す。 */
export async function saveStudentPhoto(
  studentId: string,
  file: File
): Promise<string> {
  if (file.size === 0) {
    throw new Error("写真ファイルが選択されていません。");
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error("写真ファイルは5MB以下にしてください。");
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    throw new Error("写真はJPEG・PNG・WEBP形式のみ対応しています。");
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${studentId}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  // クエリでキャッシュを無効化し、差し替え後すぐに新しい写真が表示されるようにする
  return `/uploads/students/${filename}?v=${Date.now()}`;
}
