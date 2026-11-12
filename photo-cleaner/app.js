/* 写真メタデータ削除ツール — 画面の処理 */
(function () {
  "use strict";
  const PC = window.PhotoCleaner;
  const $ = (id) => document.getElementById(id);
  const hasFsApi = typeof window.showDirectoryPicker === "function";

  const MEDIA_EXT = new Set(["jpg", "jpeg", "jpe", "jfif", "png", "webp", "heic", "heif", "hif", "avif", "mp4", "mov", "m4v", "3gp", "3g2", "qt"]);

  /** @type {{path: string, getFile: () => Promise<File>, handle?: FileSystemFileHandle, kind: string}[]} */
  let entries = [];
  let rootHandle = null;
  let busy = false;

  if (!hasFsApi) {
    $("noFsApi").classList.remove("hidden");
    document.querySelector('[data-mode="folder"]').classList.add("hidden");
    document.querySelector('[data-mode="overwrite"]').classList.add("hidden");
    document.querySelector('input[value="zip"]').checked = true;
  }

  const extOf = (name) => (name.includes(".") ? name.split(".").pop().toLowerCase() : "");
  const classify = (name) => {
    const ext = extOf(name);
    if (MEDIA_EXT.has(ext)) return "media";
    if (PC.UNSUPPORTED_EXT.has(ext)) return "unsupported";
    if (PC.SIDECAR_EXT.has(ext)) return "sidecar";
    return "other";
  };
  const isHidden = (name) => name.startsWith(".") || name === "Thumbs.db" || name === "desktop.ini";

  // ------------------------------------------------------------ フォルダ選択

  $("pick").addEventListener("click", async () => {
    if (busy) return;
    if (!hasFsApi) {
      $("dirInput").click();
      return;
    }
    try {
      rootHandle = await window.showDirectoryPicker({ id: "photo-cleaner-src", mode: "read" });
    } catch (e) {
      if (e.name !== "AbortError") alert(`フォルダを開けませんでした: ${e.message}`);
      return;
    }
    entries = [];
    $("pickedName").textContent = `「${rootHandle.name}」を読み込み中…`;
    await walkDir(rootHandle, "");
    onPicked(rootHandle.name);
  });

  async function walkDir(dir, prefix) {
    for await (const [name, handle] of dir.entries()) {
      if (isHidden(name)) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "directory") await walkDir(handle, path);
      else entries.push({ path, handle, getFile: () => handle.getFile(), kind: classify(name) });
    }
  }

  $("dirInput").addEventListener("change", (ev) => {
    const files = Array.from(ev.target.files || []);
    if (!files.length) return;
    const top = (files[0].webkitRelativePath || files[0].name).split("/")[0];
    entries = files
      .filter((f) => !(f.webkitRelativePath || f.name).split("/").some(isHidden))
      .map((f) => {
        const rel = (f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name;
        return { path: rel, getFile: async () => f, kind: classify(f.name) };
      });
    onPicked(top);
  });

  function onPicked(name) {
    entries.sort((a, b) => a.path.localeCompare(b.path, "ja"));
    const media = entries.filter((e) => e.kind === "media").length;
    $("pickedName").textContent = `「${name}」 — 対象 ${media} 件 / 全 ${entries.length} ファイル`;
    $("scan").disabled = media === 0;
    $("run").disabled = media === 0;
    $("resultPanel").classList.add("hidden");
  }

  // ------------------------------------------------------------ 表示

  function chipsFor(found) {
    const box = document.createElement("div");
    box.className = "chips";
    if (!found.length) {
      box.innerHTML = '<span class="muted">なし</span>';
      return box;
    }
    for (const f of found) {
      const c = document.createElement("span");
      c.className = "chip" + (/GPS|位置|撮影場所/.test(f) ? " gps" : "");
      c.textContent = f;
      box.appendChild(c);
    }
    return box;
  }

  function addRow(path, typeLabel, found, statusText, statusClass) {
    const tr = document.createElement("tr");
    const td = (cls) => {
      const el = document.createElement("td");
      if (cls) el.className = cls;
      tr.appendChild(el);
      return el;
    };
    td("path").textContent = path;
    td().textContent = typeLabel || "—";
    td().appendChild(chipsFor(found));
    const st = td("status " + statusClass);
    st.textContent = statusText;
    $("rows").appendChild(tr);
  }

  function startResults(title) {
    $("resultPanel").classList.remove("hidden");
    $("resultTitle").textContent = title;
    $("rows").innerHTML = "";
    $("summary").innerHTML = "";
    $("progress").value = 0;
    const skipped = entries.filter((e) => e.kind === "unsupported" || e.kind === "sidecar");
    if (skipped.length) {
      $("skippedBox").classList.remove("hidden");
      $("skippedSummary").textContent = `処理対象外のファイル ${skipped.length} 件(RAW・GIF・付属ファイルなど。これらにも撮影情報が含まれている場合があります)`;
      $("skippedList").innerHTML = "";
      for (const e of skipped) {
        const li = document.createElement("li");
        li.textContent = `${e.path}${e.kind === "sidecar" ? "(メタデータの付属ファイル)" : "(未対応形式)"}`;
        $("skippedList").appendChild(li);
      }
    } else $("skippedBox").classList.add("hidden");
  }

  function setSummary(stats) {
    const items = [
      ["処理済み", stats.done, "ok"],
      ["情報が見つかったファイル", stats.withInfo, ""],
      ["GPS位置情報あり", stats.gps, "err"],
      ["エラー", stats.errors, "err"],
    ];
    $("summary").innerHTML = "";
    for (const [label, n, cls] of items) {
      const s = document.createElement("span");
      s.innerHTML = `${label}: <b class="${n ? cls : ""}">${n}</b>`;
      $("summary").appendChild(s);
    }
  }

  function setBusy(v) {
    busy = v;
    for (const id of ["pick", "scan", "run"]) $(id).disabled = v || (id !== "pick" && !entries.some((e) => e.kind === "media"));
  }

  // ------------------------------------------------------------ 確認(スキャン)

  $("scan").addEventListener("click", async () => {
    setBusy(true);
    const targets = entries.filter((e) => e.kind === "media");
    startResults("確認結果(ファイルは変更していません)");
    const stats = { done: 0, withInfo: 0, gps: 0, errors: 0 };
    for (let i = 0; i < targets.length; i++) {
      const e = targets[i];
      try {
        const res = await PC.clean(await e.getFile());
        stats.done++;
        if (res.found.length) stats.withInfo++;
        if (res.found.some((f) => f.startsWith("GPS"))) stats.gps++;
        addRow(e.path, res.label, res.found, res.found.length ? "削除対象あり" : "問題なし", res.found.length ? "skip" : "ok");
      } catch (err) {
        stats.errors++;
        addRow(e.path, "", [], `読み込めません: ${err.message}`, "err");
      }
      $("progress").value = (i + 1) / targets.length;
      setSummary(stats);
    }
    setBusy(false);
  });

  // ------------------------------------------------------------ 削除して保存

  $("run").addEventListener("click", async () => {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const targets = entries.filter((e) => e.kind === "media");
    let outDir = null;

    if (mode === "folder") {
      try {
        outDir = await window.showDirectoryPicker({ id: "photo-cleaner-dst", mode: "readwrite" });
      } catch (e) {
        if (e.name !== "AbortError") alert(`保存先を開けませんでした: ${e.message}`);
        return;
      }
      if (rootHandle && (await outDir.isSameEntry(rootHandle))) {
        alert("保存先に元のフォルダと同じフォルダが選ばれています。別のフォルダを選ぶか「元のファイルを上書き」を選んでください。");
        return;
      }
    } else if (mode === "overwrite") {
      if (!confirm(`${targets.length} 件のファイルを上書きします。元に戻すことはできません。よろしいですか?`)) return;
      const perm = await rootHandle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        alert("書き込みの許可が得られませんでした。");
        return;
      }
    }

    setBusy(true);
    startResults("削除結果");
    const stats = { done: 0, withInfo: 0, gps: 0, errors: 0 };
    const zipEntries = [];

    for (let i = 0; i < targets.length; i++) {
      const e = targets[i];
      try {
        const file = await e.getFile();
        const res = await PC.clean(file);
        // 削除後のファイルをもう一度解析し、情報が残っていないことを確認する
        const verify = await PC.clean(res.blob);
        const residual = verify.found.filter((f) => f !== "EXIF");
        if (residual.length) throw new Error(`削除しきれない情報があります: ${residual.join(", ")}`);

        if (mode === "folder") await writeTo(outDir, e.path, res.blob);
        else if (mode === "overwrite") await writeHandle(e.handle, res.blob);
        else zipEntries.push({ path: e.path, blob: res.blob });

        stats.done++;
        if (res.found.length) stats.withInfo++;
        if (res.found.some((f) => f.startsWith("GPS"))) stats.gps++;
        const kept = res.orientationKept > 1 ? "(向き情報のみ保持)" : "";
        addRow(e.path, res.label, res.found, (res.found.length ? "✓ 削除しました" : "✓ 情報なし") + kept, "ok");
      } catch (err) {
        stats.errors++;
        addRow(e.path, "", [], `✗ ${err.message}`, "err");
      }
      $("progress").value = (i + 1) / targets.length;
      setSummary(stats);
    }

    if (mode === "zip" && zipEntries.length) {
      try {
        $("resultTitle").textContent = "ZIP ファイルを作成中…";
        const zip = await PC_ZIP.build(zipEntries);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(zip);
        a.download = "metadata-removed.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      } catch (err) {
        alert(`ZIP の作成に失敗しました: ${err.message}`);
      }
    }
    $("resultTitle").textContent = `削除結果 — ${stats.done} 件完了${stats.errors ? `、${stats.errors} 件エラー` : ""}`;
    setBusy(false);
  });

  async function writeTo(dir, path, blob) {
    const parts = path.split("/");
    const name = parts.pop();
    let d = dir;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create: true });
    await writeHandle(await d.getFileHandle(name, { create: true }), blob);
  }

  async function writeHandle(handle, blob) {
    const w = await handle.createWritable();
    try {
      await w.write(blob);
      await w.close();
    } catch (e) {
      await w.abort().catch(() => {});
      throw e;
    }
  }

  // ------------------------------------------------------------ ZIP(無圧縮)作成

  const PC_ZIP = {
    async build(list) {
      const enc = new TextEncoder();
      const parts = [];
      const central = [];
      let offset = 0;
      const now = new Date();
      const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
      const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
      for (const { path, blob } of list) {
        if (blob.size >= 0xffffffff || offset + blob.size >= 0xffffffff) {
          throw new Error("ZIP の上限(4GB)を超えます。Chrome / Edge でフォルダに直接保存してください。");
        }
        const name = enc.encode(path);
        const crc = await crcOfBlob(blob);
        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true); // UTF-8 ファイル名
        local.setUint16(8, 0, true); // 無圧縮
        local.setUint16(10, dosTime, true);
        local.setUint16(12, dosDate, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, blob.size, true);
        local.setUint32(22, blob.size, true);
        local.setUint16(26, name.length, true);
        local.setUint16(28, 0, true);
        parts.push(local.buffer, name, blob);

        const cd = new DataView(new ArrayBuffer(46));
        cd.setUint32(0, 0x02014b50, true);
        cd.setUint16(4, 20, true);
        cd.setUint16(6, 20, true);
        cd.setUint16(8, 0x0800, true);
        cd.setUint16(10, 0, true);
        cd.setUint16(12, dosTime, true);
        cd.setUint16(14, dosDate, true);
        cd.setUint32(16, crc, true);
        cd.setUint32(20, blob.size, true);
        cd.setUint32(24, blob.size, true);
        cd.setUint16(28, name.length, true);
        cd.setUint32(42, offset, true);
        central.push(cd.buffer, name);
        offset += 30 + name.length + blob.size;
      }
      const cdSize = central.reduce((n, b) => n + b.byteLength, 0);
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(8, list.length, true);
      end.setUint16(10, list.length, true);
      end.setUint32(12, cdSize, true);
      end.setUint32(16, offset, true);
      if (list.length > 0xffff) throw new Error("ZIP に入れられるファイル数(65535)を超えます。");
      return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
    },
  };

  async function crcOfBlob(blob) {
    let crc = 0;
    const reader = blob.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      crc = PC.crc32(value, crc);
    }
    return crc;
  }
})();
