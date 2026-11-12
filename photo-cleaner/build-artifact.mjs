// index.html・cleaner.js・app.js を 1 つの HTML にまとめ、claude.ai のアーティファクトとして
// 公開できる形にする。
//   node photo-cleaner/build-artifact.mjs [出力先]   (既定: photo-cleaner/dist/artifact.html)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(dir, "dist", "artifact.html");
const html = readFileSync(path.join(dir, "index.html"), "utf8");
const pick = (re) => {
  const m = re.exec(html);
  if (!m) throw new Error(`見つかりません: ${re}`);
  return m[0];
};
const inline = (file) => `<script>\n${readFileSync(path.join(dir, file), "utf8").replace(/<\/script/gi, "<\\/script")}\n</script>`;

const page = [
  pick(/<title>[\s\S]*?<\/title>/),
  pick(/<meta name="claude:viewport-fit-sides"[^>]*>/),
  pick(/<style>[\s\S]*?<\/style>/),
  pick(/<main>[\s\S]*?<\/main>/),
  inline("cleaner.js"),
  inline("app.js"),
].join("\n");

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, page + "\n");
console.log(`${out} (${(page.length / 1024).toFixed(0)} KB)`);
