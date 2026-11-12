/* 写真メタデータ削除ツール — 画面の処理 */
(function () {
  "use strict";
  const PC = window.PhotoCleaner;
  const $ = (id) => document.getElementById(id);
  // claude.ai のアーティファクトなど iframe 内ではフォルダへの直接保存が使えないため ZIP 保存にする
  const inFrame = (() => {
    try {
      return window.top !== window.self;
    } catch {
      return true;
    }
  })();
  const hasFsApi = typeof window.showDirectoryPicker === "function" && !inFrame;

  const MEDIA_EXT = new Set(["jpg", "jpeg", "jpe", "jfif", "png", "webp", "heic", "heif", "hif", "avif", "mp4", "mov", "m4v", "3gp", "3g2", "qt"]);
  // 1 件だけのとき、ZIP にせずそのまま保存する拡張子
  const DIRECT_SAVE_EXT = new Set(["jpg", "jpeg", "png", "webp", "mp4"]);

  /** @type {{path: string, getFile: () => Promise<File>, handle?: FileSystemFileHandle, kind: string}[]} */
  let entries = [];
  let rootHandle = null;
  let busy = false;
  let pendingSave = null; // {filename, blob}

  if (!hasFsApi) {
    $("noFsApi").classList.remove("hidden");
    $("pick").classList.remove("primary");
    $("pickFiles").classList.add("primary");
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

  function showMsg(text, kind = "") {
    const m = $("msg");
    m.textContent = text;
    m.className = `msg ${kind}`;
    m.classList.toggle("hidden", !text);
  }

  // ------------------------------------------------------------ 選択

  $("pick").addEventListener("click", async () => {
    if (busy) return;
    showMsg("");
    if (!hasFsApi) {
      $("dirInput").click();
      return;
    }
    try {
      rootHandle = await window.showDirectoryPicker({ id: "photo-cleaner-src", mode: "read" });
    } catch (e) {
      if (e.name !== "AbortError") showMsg(`フォルダを開けませんでした: ${e.message}`, "err");
      return;
    }
    entries = [];
    $("pickedName").textContent = `「${rootHandle.name}」を読み込み中…`;
    await walkDir(rootHandle, "");
    onPicked(`「${rootHandle.name}」`);
  });

  $("pickFiles").addEventListener("click", () => {
    if (busy) return;
    showMsg("");
    $("fileInput").click();
  });

  async function walkDir(dir, prefix) {
    for await (const [name, handle] of dir.entries()) {
      if (isHidden(name)) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "directory") await walkDir(handle, path);
      else entries.push({ path, handle, getFile: () => handle.getFile(), kind: classify(name) });
    }
  }

  function fromFileList(files, stripTop) {
    rootHandle = null;
    return files
      .filter((f) => !(f.webkitRelativePath || f.name).split("/").some(isHidden))
      .map((f) => {
        const full = f.webkitRelativePath || f.name;
        const rel = stripTop ? full.split("/").slice(1).join("/") || f.name : full;
        return { path: rel, getFile: async () => f, kind: classify(f.name) };
      });
  }

  $("dirInput").addEventListener("change", (ev) => {
    const files = Array.from(ev.target.files || []);
    ev.target.value = "";
    if (!files.length) return;
    const top = (files[0].webkitRelativePath || files[0].name).split("/")[0];
    entries = fromFileList(files, true);
    onPicked(`「${top}」`);
  });

  $("fileInput").addEventListener("change", (ev) => {
    const files = Array.from(ev.target.files || []);
    ev.target.value = "";
    if (!files.length) return;
    entries = fromFileList(files, false);
    onPicked("選んだファイル");
  });

  // ドラッグ&ドロップ(フォルダごとでも可)
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((t) =>
    drop.addEventListener(t, (e) => {
      e.preventDefault();
      drop.classList.add("over");
    })
  );
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    if (busy) return;
    showMsg("");
    const items = Array.from(e.dataTransfer.items || []).map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
    const result = [];
    if (items.length && items.every(Boolean)) {
      for (const it of items) await walkEntry(it, "", result);
    } else {
      for (const f of Array.from(e.dataTransfer.files || [])) result.push({ path: f.name, file: f });
    }
    rootHandle = null;
    entries = result
      .filter((r) => !r.path.split("/").some(isHidden))
      .map((r) => ({ path: r.path, getFile: async () => r.file, kind: classify(r.path) }));
    onPicked("ドロップしたファイル");
  });

  async function walkEntry(entry, prefix, out) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      out.push({ path, file: await new Promise((res, rej) => entry.file(res, rej)) });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) {
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const child of batch) await walkEntry(child, path, out);
      }
    }
  }

  function onPicked(name) {
    entries.sort((a, b) => a.path.localeCompare(b.path, "ja"));
    const media = entries.filter((e) => e.kind === "media").length;
    $("pickedName").textContent = `${name} — 対象 ${media} 件 / 全 ${entries.length} ファイル`;
    $("scan").disabled = media === 0;
    $("run").disabled = media === 0;
    $("resultPanel").classList.add("hidden");
    $("saveBox").classList.add("hidden");
    $("confirmBox").classList.add("hidden");
    pendingSave = null;
    if (!media) showMsg("対応している写真・動画が見つかりませんでした。", "err");
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
    for (const id of ["pick", "pickFiles", "scan", "run"]) {
      $(id).disabled = v || ((id === "scan" || id === "run") && !entries.some((e) => e.kind === "media"));
    }
  }

  // ------------------------------------------------------------ 確認(スキャン)

  $("scan").addEventListener("click", async () => {
    setBusy(true);
    showMsg("");
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
    showMsg("");
    $("saveBox").classList.add("hidden");
    pendingSave = null;
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const targets = entries.filter((e) => e.kind === "media");

    if (mode === "folder") {
      let outDir;
      try {
        outDir = await window.showDirectoryPicker({ id: "photo-cleaner-dst", mode: "readwrite" });
      } catch (e) {
        if (e.name !== "AbortError") showMsg(`保存先を開けませんでした: ${e.message}`, "err");
        return;
      }
      if (rootHandle && (await outDir.isSameEntry(rootHandle))) {
        showMsg("保存先に元のフォルダと同じフォルダが選ばれています。別のフォルダを選ぶか「元のファイルを上書き」を選んでください。", "err");
        return;
      }
      await processFiles(targets, mode, outDir);
    } else if (mode === "overwrite") {
      if (!rootHandle) {
        showMsg("上書きは「フォルダを選択…」で選んだときだけ使えます。", "err");
        return;
      }
      $("confirmText").textContent = `${targets.length} 件のファイルを上書きします。元に戻すことはできません。よろしいですか?`;
      $("confirmBox").classList.remove("hidden");
    } else {
      await processFiles(targets, mode, null);
    }
  });

  $("confirmNo").addEventListener("click", () => $("confirmBox").classList.add("hidden"));
  $("confirmYes").addEventListener("click", async () => {
    $("confirmBox").classList.add("hidden");
    const perm = await rootHandle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      showMsg("書き込みの許可が得られませんでした。", "err");
      return;
    }
    await processFiles(entries.filter((e) => e.kind === "media"), "overwrite", null);
  });

  async function processFiles(targets, mode, outDir) {
    setBusy(true);
    startResults("削除結果");
    const stats = { done: 0, withInfo: 0, gps: 0, errors: 0 };
    const outputs = [];

    for (let i = 0; i < targets.length; i++) {
      const e = targets[i];
      try {
        const file = await e.getFile();
        const keepDates = $("keepDates").checked;
        const res = await PC.clean(file, { keepDates });
        // 削除後のファイルをもう一度解析し、残すと決めたもの以外が残っていないことを確認する
        const verify = await PC.clean(res.blob, { keepDates });
        const residual = verify.found.filter((f) => f !== "EXIF" && !(keepDates && /^(撮影日時|作成・更新日時)/.test(f)));
        if (residual.length) throw new Error(`削除しきれない情報があります: ${residual.join(", ")}`);

        if (mode === "folder") await writeTo(outDir, e.path, res.blob);
        else if (mode === "overwrite") await writeHandle(e.handle, res.blob);
        else outputs.push({ path: e.path, blob: res.blob });

        stats.done++;
        if (res.found.length) stats.withInfo++;
        if (res.found.some((f) => f.startsWith("GPS"))) stats.gps++;
        const kept = res.kept.length ? `(${res.kept.join("・")}を保持)` : "";
        addRow(e.path, res.label, res.found, (res.found.length ? "✓ 削除しました" : "✓ 情報なし") + kept, "ok");
      } catch (err) {
        stats.errors++;
        addRow(e.path, "", [], `✗ ${err.message}`, "err");
      }
      $("progress").value = (i + 1) / targets.length;
      setSummary(stats);
    }

    $("resultTitle").textContent = `削除結果 — ${stats.done} 件完了${stats.errors ? `、${stats.errors} 件エラー` : ""}`;
    if (mode === "zip" && outputs.length) {
      try {
        if (outputs.length === 1 && DIRECT_SAVE_EXT.has(extOf(outputs[0].path))) {
          pendingSave = { filename: outputs[0].path.split("/").pop(), blob: outputs[0].blob };
        } else {
          pendingSave = { filename: "metadata-removed.zip", blob: await buildZip(outputs) };
        }
        $("saveInfo").textContent = `${pendingSave.filename}(${formatSize(pendingSave.blob.size)})`;
        $("saveBox").classList.remove("hidden");
        showMsg("処理が終わりました。「保存する」を押して保存してください。", "ok");
      } catch (err) {
        showMsg(`ZIP の作成に失敗しました: ${err.message}`, "err");
      }
    } else if (stats.done) {
      showMsg(`${stats.done} 件を保存しました。`, "ok");
    }
    setBusy(false);
  }

  // 「撮影日時を残す」の選択をこのブラウザに覚えておく
  try {
    $("keepDates").checked = localStorage.getItem("photo-cleaner:keepDates") === "1";
  } catch {
    /* 保存できない環境では毎回オフから */
  }
  $("keepDates").addEventListener("change", () => {
    try {
      localStorage.setItem("photo-cleaner:keepDates", $("keepDates").checked ? "1" : "0");
    } catch {
      /* noop */
    }
  });

  const formatSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  // claude.ai 上では downloads 機能、それ以外では通常のダウンロードで保存する
  let downloadsApi;
  const getDownloads = () => {
    if (downloadsApi === undefined) {
      downloadsApi = window.claude && typeof window.claude.use === "function" ? window.claude.use("downloads").catch(() => null) : Promise.resolve(null);
    }
    return downloadsApi;
  };
  if (inFrame) getDownloads();

  $("save").addEventListener("click", async () => {
    if (!pendingSave) return;
    const { filename, blob } = pendingSave;
    const dl = await getDownloads();
    if (dl) {
      try {
        await dl.save({ filename, data: blob });
        showMsg(`${filename} を保存しました。`, "ok");
      } catch (err) {
        const code = err && err.code;
        if (code === "declined") showMsg("保存をキャンセルしました。もう一度「保存する」を押すと保存できます。", "");
        else if (code === "rate_limited") showMsg("保存の確認画面がすでに開いています。少し待ってからもう一度押してください。", "err");
        else showMsg(`この画面では保存できませんでした(${code || err.message})。`, "err");
      }
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
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

  async function buildZip(list) {
    if (list.length > 0xffff) throw new Error("ZIP に入れられるファイル数(65535)を超えます。");
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const { path, blob } of list) {
      if (offset + blob.size >= 0xffffffff) {
        throw new Error("ZIP の上限(4GB)を超えます。パソコン版の Chrome / Edge でフォルダに直接保存するか、何回かに分けてください。");
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
      parts.push(local.buffer, name, blob);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
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
    return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
  }

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
