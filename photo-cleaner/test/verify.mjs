// 動作確認スクリプト: ffmpeg と exiftool でテスト用ファイルを作り、削除処理後に
// 個人情報タグが残っていないこと・ファイルが壊れていないことを確認する。
//
//   node photo-cleaner/test/verify.mjs
//
// 必要なもの: Node.js 18+, ffmpeg/ffprobe, exiftool
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PhotoCleaner = require("../cleaner.js");

const dir = mkdtempSync(path.join(tmpdir(), "photo-cleaner-"));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
const ff = (args) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

const PERSONAL = [
  "-GPSLatitude=35.6812", "-GPSLatitudeRef=N", "-GPSLongitude=139.7671", "-GPSLongitudeRef=E",
  "-Make=TestMaker", "-Model=TestCam X100", "-LensModel=Super Lens 50mm F1.4", "-LensMake=LensCo",
  "-SerialNumber=SN12345", "-LensSerialNumber=LSN999", "-OwnerName=Yamada Taro", "-Artist=Yamada Taro",
  "-Copyright=Yamada", "-DateTimeOriginal=2024:05:01 10:20:30", "-Software=SecretApp 1.0",
  "-XMP:Creator=Yamada Taro", "-XMP:City=Tokyo", "-IPTC:By-line=Yamada", "-Comment=private comment",
];
const SENSITIVE = /GPS|Make|Model|Lens|Serial|Owner|Artist|Creator|Copyright|DateTimeOriginal|CreateDate|Software|City|By-line|Comment|Yamada|TestCam|Tokyo|Location|Author|ContentIdentifier/i;

function tagsOf(file) {
  const json = JSON.parse(run("exiftool", ["-j", "-a", "-G1", "-n", file]))[0];
  return Object.entries(json).filter(([k]) => !/^(SourceFile|ExifTool:|System:|File:)/.test(k));
}

let failed = 0;
async function check(name, file, { decode = "image", expectOrientation, keepDates = false, expectDate } = {}) {
  const before = tagsOf(file).filter(([k, v]) => SENSITIVE.test(k) || SENSITIVE.test(String(v)));
  const buf = readFileSync(file);
  const res = await PhotoCleaner.clean(new Blob([buf]), { keepDates });
  const outFile = file.replace(/(\.\w+)$/, keepDates ? ".keepdate$1" : ".clean$1");
  writeFileSync(outFile, Buffer.from(await res.blob.arrayBuffer()));
  const after = tagsOf(outFile).filter(([k, v]) => {
    if (/Date|Time/i.test(k) && /^0000:00:00|^1904:01:01|^0$/.test(String(v))) return false; // 0 埋め済みの日時
    if (keepDates && /^(ExifIFD:(DateTimeOriginal|CreateDate)|QuickTime:CreateDate|QuickTime:ModifyDate|Track\d+:(Track|Media)(Create|Modify)Date)$/.test(k)) return false;
    return SENSITIVE.test(k) || SENSITIVE.test(String(v));
  });
  let ok = after.length === 0;
  try {
    if (decode === false) run("exiftool", ["-validate", "-warning", "-error", outFile]);
    else if (decode === "image") ff(["-i", outFile, "-f", "null", "-"]);
    else {
      run("ffprobe", ["-v", "error", "-show_streams", outFile]);
      ff(["-i", outFile, "-f", "null", "-"]);
    }
  } catch (e) {
    ok = false;
    console.log(`   デコード失敗: ${e.stderr}`);
  }
  if (expectDate) {
    const t = Object.fromEntries(tagsOf(outFile));
    const got = t["ExifIFD:DateTimeOriginal"] || t["QuickTime:CreateDate"];
    if (got !== expectDate) {
      ok = false;
      console.log(`   撮影日時が保持されていません: ${got}`);
    }
  }
  if (expectOrientation) {
    const o = JSON.parse(run("exiftool", ["-j", "-n", "-Orientation", outFile]))[0].Orientation;
    if (o !== expectOrientation) {
      ok = false;
      console.log(`   Orientation が保持されていません: ${o}`);
    }
  }
  console.log(`${ok ? "OK  " : "NG  "} ${name}  (削除前の該当タグ ${before.length} 件 → 削除後 ${after.length} 件)`);
  console.log(`     検出: ${res.found.join(" / ")}`);
  if (after.length) console.log("     残存:", after);
  if (!ok) failed++;
}

// ---- JPEG
const jpg = path.join(dir, "photo.jpg");
ff(["-f", "lavfi", "-i", "testsrc=size=320x240", "-frames:v", "1", jpg]);
run("exiftool", ["-overwrite_original", ...PERSONAL, "-Orientation#=6", "-ThumbnailImage<=" + jpg, jpg]);
await check("JPEG", jpg, { expectOrientation: 6 });
await check("JPEG(撮影日時を残す)", jpg, { expectOrientation: 6, keepDates: true, expectDate: "2024:05:01 10:20:30" });

// ---- PNG
const png = path.join(dir, "image.png");
ff(["-f", "lavfi", "-i", "testsrc=size=160x120", "-frames:v", "1", png]);
run("exiftool", ["-overwrite_original", "-PNG:Author=Yamada Taro", "-PNG:Comment=private comment", "-XMP:Creator=Yamada Taro", "-EXIF:Model=TestCam X100", "-EXIF:GPSLatitude=35.6", "-EXIF:GPSLatitudeRef=N", "-EXIF:DateTimeOriginal=2024:05:01 10:20:30", png]);
await check("PNG", png);
await check("PNG(撮影日時を残す)", png, { keepDates: true, expectDate: "2024:05:01 10:20:30" });

// ---- WebP
const webp = path.join(dir, "image.webp");
try {
  ff(["-f", "lavfi", "-i", "testsrc=size=160x120", "-frames:v", "1", "-c:v", "libwebp", webp]);
  run("exiftool", ["-overwrite_original", "-EXIF:Model=TestCam X100", "-EXIF:GPSLatitude=35.6", "-EXIF:GPSLatitudeRef=N", "-XMP:Creator=Yamada Taro", "-EXIF:DateTimeOriginal=2024:05:01 10:20:30", webp]);
  await check("WebP", webp);
  await check("WebP(撮影日時を残す)", webp, { keepDates: true, expectDate: "2024:05:01 10:20:30" });
} catch (e) {
  console.log("SKIP WebP (エンコーダなし)", e.message.split("\n")[0]);
}

// ---- MP4
const mp4 = path.join(dir, "video.mp4");
ff(["-f", "lavfi", "-i", "testsrc=size=320x240:duration=1", "-f", "lavfi", "-i", "sine=duration=1", "-c:v", "libx264", "-c:a", "aac", "-shortest",
  "-metadata", "location=+35.6812+139.7671/", "-metadata", "make=TestMaker", "-metadata", "model=TestCam X100", "-metadata", "creation_time=2024-05-01T10:20:30Z",
  "-metadata", "artist=Yamada Taro", "-metadata", "comment=private comment", "-movflags", "+faststart", mp4]);
run("exiftool", ["-overwrite_original", "-XMP:Creator=Yamada Taro", "-UserData:Make=TestMaker", "-UserData:Model=TestCam X100", mp4]);
await check("MP4", mp4, { decode: "video" });
await check("MP4(撮影日時を残す)", mp4, { decode: "video", keepDates: true, expectDate: "2024:05:01 10:20:30" });

// ---- MOV (Apple 形式の keys/ilst メタデータ)
const mov = path.join(dir, "video.mov");
ff(["-f", "lavfi", "-i", "testsrc=size=320x240:duration=1", "-c:v", "libx264", "-movflags", "use_metadata_tags",
  "-metadata", "com.apple.quicktime.location.ISO6709=+35.6812+139.7671+010.000/", "-metadata", "com.apple.quicktime.make=Apple",
  "-metadata", "com.apple.quicktime.model=iPhone 15 Pro", "-metadata", "com.apple.quicktime.creationdate=2024-05-01T10:20:30+0900", mov]);
await check("MOV", mov, { decode: "video" });

// ---- HEIC (exiftool で EXIF/XMP を書き込める HEIF を ffmpeg で作れない環境もあるため任意)
const heic = process.env.HEIC_SAMPLE;
if (heic) {
  await check("HEIC", heic, { decode: false }); // ffmpeg は HEIC を読めないため exiftool で構造検証
  if (process.env.HEIC_DATE) await check("HEIC(撮影日時を残す)", heic, { decode: false, keepDates: true, expectDate: process.env.HEIC_DATE });
}
else console.log("SKIP HEIC (環境変数 HEIC_SAMPLE に実ファイルのパスを指定すると検証します)");

rmSync(dir, { recursive: true, force: true });
if (failed) {
  console.log(`\n${failed} 件失敗`);
  process.exit(1);
}
console.log("\nすべて成功");
