import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { clean } from "../../photo-cleaner/cleaner.js";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "students");

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** ファイルの中身から判定した形式 → 保存時の拡張子 */
const EXT_BY_DETECTED_TYPE: Record<string, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * 写真から位置情報(GPS)・撮影日時・カメラ/レンズの機種名・シリアル番号・作成者などの
 * メタデータを削除する。写真の向き(Orientation)だけは表示が崩れないよう残す。
 * 削除後にもう一度解析し、情報が残っていれば保存せずにエラーにする。
 */
export async function removePhotoMetadata(
  data: Blob
): Promise<{ bytes: Buffer; ext: string; removed: string[] }> {
  let result;
  try {
    result = await clean(data);
  } catch {
    throw new Error("写真ファイルを読み込めませんでした。別の写真を選んでください。");
  }
  const ext = EXT_BY_DETECTED_TYPE[result.type];
  if (!ext) {
    throw new Error("写真はJPEG・PNG・WEBP形式のみ対応しています。");
  }

  const verify = await clean(result.blob);
  const residual = verify.found.filter((item) => item !== "EXIF");
  if (residual.length > 0) {
    throw new Error("写真の撮影情報を削除できなかったため、保存を中止しました。");
  }

  return {
    bytes: Buffer.from(await result.blob.arrayBuffer()),
    ext,
    // 向きだけの EXIF は個人情報ではないので「削除した情報」に含めない
    removed: result.found.filter((item) => item !== "EXIF"),
  };
}

/**
 * 生徒の個人写真からメタデータを削除して public/uploads/students に保存し、参照用パスを返す。
 */
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
  if (!ALLOWED_TYPES[file.type]) {
    throw new Error("写真はJPEG・PNG・WEBP形式のみ対応しています。");
  }

  // 拡張子はブラウザの申告(file.type)ではなく、ファイルの中身から判定した形式で決める
  const { bytes, ext } = await removePhotoMetadata(file);

  await mkdir(UPLOAD_DIR, { recursive: true });
  // 形式が変わった場合に古い拡張子のファイルが残らないよう、別形式の旧ファイルは削除する
  await removeOtherFormats(studentId, ext);
  const filename = `${studentId}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, filename), bytes);

  // クエリでキャッシュを無効化し、差し替え後すぐに新しい写真が表示されるようにする
  return `/uploads/students/${filename}?v=${Date.now()}`;
}

async function removeOtherFormats(studentId: string, keepExt: string) {
  for (const ext of new Set(Object.values(ALLOWED_TYPES))) {
    if (ext === keepExt) continue;
    await rm(path.join(UPLOAD_DIR, `${studentId}.${ext}`), { force: true });
  }
}
