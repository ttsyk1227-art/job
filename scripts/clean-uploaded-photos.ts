/**
 * アップロード済みの生徒写真(public/uploads/students)からメタデータを削除する。
 * メタデータ削除を組み込む前にアップロードされた写真に、位置情報などが残っているため。
 *
 *   npm run photos:clean            # 削除して上書き
 *   npm run photos:clean -- --dry   # 確認のみ(ファイルは変更しない)
 *   npm run photos:clean -- --dir <フォルダ>   # 対象フォルダを指定(既定: public/uploads/students)
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { removePhotoMetadata } from "../src/lib/photo";

const dirIndex = process.argv.indexOf("--dir");
const UPLOAD_DIR =
  dirIndex > 0 && process.argv[dirIndex + 1]
    ? path.resolve(process.argv[dirIndex + 1])
    : path.join(process.cwd(), "public", "uploads", "students");
const dryRun = process.argv.includes("--dry");

async function main() {
  const names = (await readdir(UPLOAD_DIR)).filter((n) => /\.(jpe?g|png|webp)$/i.test(n));
  let cleaned = 0;
  let failed = 0;
  for (const name of names) {
    const file = path.join(UPLOAD_DIR, name);
    const original = await readFile(file);
    try {
      const { bytes, removed } = await removePhotoMetadata(new Blob([original]));
      if (removed.length === 0) {
        console.log(`  そのまま  ${name}`);
        continue;
      }
      if (!dryRun) await writeFile(file, bytes);
      cleaned++;
      console.log(`${dryRun ? "  削除対象" : "  削除済み"}  ${name}: ${removed.join(" / ")}`);
    } catch (err) {
      failed++;
      console.log(`  エラー    ${name}: ${(err as Error).message}`);
    }
  }
  console.log(
    `\n${names.length} 件中 ${cleaned} 件${dryRun ? "にメタデータがあります(--dry のため変更していません)" : "からメタデータを削除しました"}${failed ? `、${failed} 件エラー` : ""}`
  );
  if (failed) process.exitCode = 1;
}

main();
