/*
 * 写真・動画メタデータ削除エンジン
 *
 * ブラウザ（および Node.js 18 以降）の Blob API だけで動作し、ファイルを外部に送信しません。
 *
 * 対応形式と削除内容:
 *   JPEG : EXIF(GPS・撮影日時・カメラ/レンズ機種・シリアル番号・メーカーノート・サムネイル)、
 *          XMP、IPTC/Photoshop、コメント、MPF、その他 APPn、EOI 以降の付加データ(モーションフォト等)
 *          ※写真の向き(Orientation)だけは表示が崩れないよう最小限の EXIF として残します
 *   PNG  : tEXt / zTXt / iTXt / eXIf / tIME チャンク
 *   WebP : EXIF / XMP チャンク
 *   HEIC/HEIF/AVIF : Exif アイテム・XMP アイテムを空データで上書き
 *   MP4/MOV/M4V/3GP: moov 内の meta / udta / uuid ボックス(位置情報・機種名・作成日時など)を無効化し、
 *          mvhd/tkhd/mdhd の作成・更新日時を 0 に、時系列メタデータトラック(GPS 等)のサンプルを 0 埋め
 *
 * 画像・映像のデータ部分には一切手を加えないため、画質の劣化はありません。
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------- 共通ユーティリティ

  const textDecoder = new TextDecoder("utf-8", { fatal: false });
  const latin1 = (u8, start, len) => {
    let s = "";
    for (let i = 0; i < len && start + i < u8.length; i++) {
      s += String.fromCharCode(u8[start + i]);
    }
    return s;
  };
  const u16be = (u8, p) => (u8[p] << 8) | u8[p + 1];
  const u32be = (u8, p) =>
    ((u8[p] << 24) >>> 0) + (u8[p + 1] << 16) + (u8[p + 2] << 8) + u8[p + 3];
  const u64be = (u8, p) => u32be(u8, p) * 4294967296 + u32be(u8, p + 4);
  const u32le = (u8, p) =>
    u8[p] + (u8[p + 1] << 8) + (u8[p + 2] << 16) + ((u8[p + 3] << 24) >>> 0);
  const readUintBE = (u8, p, size) => {
    let v = 0;
    for (let i = 0; i < size; i++) v = v * 256 + u8[p + i];
    return v;
  };
  const setU32be = (u8, p, v) => {
    u8[p] = (v >>> 24) & 0xff;
    u8[p + 1] = (v >>> 16) & 0xff;
    u8[p + 2] = (v >>> 8) & 0xff;
    u8[p + 3] = v & 0xff;
  };
  const setU32le = (u8, p, v) => {
    u8[p] = v & 0xff;
    u8[p + 1] = (v >>> 8) & 0xff;
    u8[p + 2] = (v >>> 16) & 0xff;
    u8[p + 3] = (v >>> 24) & 0xff;
  };
  const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  const startsWith = (u8, p, s) => {
    if (p + s.length > u8.length) return false;
    for (let i = 0; i < s.length; i++) {
      if (u8[p + i] !== s.charCodeAt(i)) return false;
    }
    return true;
  };
  const indexOfBytes = (u8, s, from = 0) => {
    const first = s.charCodeAt(0);
    for (let i = from; i <= u8.length - s.length; i++) {
      if (u8[i] === first && startsWith(u8, i, s)) return i;
    }
    return -1;
  };
  async function readBytes(blob, start, end) {
    return new Uint8Array(await blob.slice(start, end).arrayBuffer());
  }
  function concat(chunks) {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const c of chunks) {
      out.set(c, p);
      p += c.length;
    }
    return out;
  }

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  /** CRC32。crc に前回の戻り値を渡すと連続計算できる。 */
  function crc32(u8, crc = 0) {
    let c = (crc ^ 0xffffffff) >>> 0;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** 検出結果をまとめるクラス。found = 元ファイルに含まれていた情報の一覧 */
  class Report {
    constructor() {
      this.found = [];
      this.orientation = 1;
      this.dates = {}; // 0x9003 撮影日時 / 0x9004 デジタル化日時(元の文字列)
      this.keepDates = false;
      this.kept = new Set(); // 残した項目(表示用)
    }
    add(label, value) {
      const text = value ? `${label}: ${value}` : label;
      if (!this.found.includes(text)) this.found.push(text);
    }
  }

  // ---------------------------------------------------------------- EXIF(TIFF) 解析

  const EXIF_TAGS = {
    0x010f: "メーカー",
    0x0110: "カメラ機種",
    0x0131: "ソフトウェア",
    0x013b: "作成者",
    0x8298: "著作権",
    0x9003: "撮影日時",
    0x0132: "更新日時",
    0xa430: "所有者名",
    0xa431: "カメラのシリアル番号",
    0xa433: "レンズメーカー",
    0xa434: "レンズ機種",
    0xa435: "レンズのシリアル番号",
    0x9c9b: "タイトル",
    0x9c9d: "作成者",
    0x9c9c: "コメント",
    0x9286: "ユーザーコメント",
    0x010e: "説明",
    0xa420: "画像固有ID",
    0x927c: "メーカーノート",
    0xc614: "カメラ固有名",
  };

  /**
   * TIFF 構造(EXIF 本体)を読み取り、報告用の情報と Orientation を返す。
   * u8 の start 位置に "II*\0" または "MM\0*" がある前提。
   */
  function parseTiff(u8, start, report) {
    if (start + 8 > u8.length) return;
    const le = u8[start] === 0x49;
    const r16 = (p) => (le ? u8[p] | (u8[p + 1] << 8) : u16be(u8, p));
    const r32 = (p) => (le ? u32le(u8, p) : u32be(u8, p));
    const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const visited = new Set();
    const gps = {};

    const readIfd = (ifdOffset, kind) => {
      const p0 = start + ifdOffset;
      if (visited.has(p0) || p0 + 2 > u8.length) return 0;
      visited.add(p0);
      const count = r16(p0);
      for (let i = 0; i < count; i++) {
        const e = p0 + 2 + i * 12;
        if (e + 12 > u8.length) break;
        const tag = r16(e);
        const type = r16(e + 2);
        const n = r32(e + 4);
        const size = (TYPE_SIZE[type] || 1) * n;
        const vp = size <= 4 ? e + 8 : start + r32(e + 8);
        if (vp + Math.min(size, 1) > u8.length) continue;
        const str = () =>
          textDecoder
            .decode(u8.subarray(vp, Math.min(vp + n, u8.length)))
            .replace(/\0+$/, "")
            .trim();
        const rational = (k) => {
          const q = vp + k * 8;
          const d = r32(q + 4);
          return d ? r32(q) / d : 0;
        };

        if (kind === "gps") {
          if (tag === 1 || tag === 3) gps[tag] = str();
          else if ((tag === 2 || tag === 4) && n >= 3)
            gps[tag] = rational(0) + rational(1) / 60 + rational(2) / 3600;
          continue;
        }
        if ((tag === 0x9003 || tag === 0x9004) && type === 2 && n >= 19 && n <= 32) {
          const v = str();
          if (/^\d{4}:\d\d:\d\d \d\d:\d\d:\d\d$/.test(v)) report.dates[tag] = v;
        }
        if (tag === 0x0112) report.orientation = r16(vp) || 1;
        else if (tag === 0x8769) readIfd(r32(e + 8), "exif");
        else if (tag === 0x8825) {
          report.add("GPS位置情報");
          readIfd(r32(e + 8), "gps");
        } else if (tag === 0xa005) report.add("互換性情報(Interop)");
        else if (tag === 0x927c) report.add("メーカーノート(機種固有の詳細情報)");
        else if (tag === 0x9c9b || tag === 0x9c9d || tag === 0x9c9c || tag === 0x9286) report.add(EXIF_TAGS[tag]);
        else if (EXIF_TAGS[tag] && (type === 2 || type === 7)) {
          const v = str();
          if (v && !/^[\s\0]*$/.test(v)) report.add(EXIF_TAGS[tag], v.slice(0, 80));
        } else if (EXIF_TAGS[tag]) report.add(EXIF_TAGS[tag]);
      }
      const next = p0 + 2 + count * 12;
      return next + 4 <= u8.length ? r32(next) : 0;
    };

    try {
      const ifd1 = readIfd(r32(start + 4), "ifd0");
      if (ifd1) report.add("サムネイル画像");
    } catch {
      /* 壊れた EXIF は無視(どのみち削除する) */
    }
    if (gps[2] !== undefined && gps[4] !== undefined) {
      const lat = (gps[1] === "S" ? -1 : 1) * gps[2];
      const lon = (gps[3] === "W" ? -1 : 1) * gps[4];
      report.found = report.found.filter((f) => f !== "GPS位置情報");
      report.add("GPS位置情報", `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    }
  }

  /**
   * 残す項目(写真の向き、撮影日時)だけを含む最小の TIFF 構造を作る(ビッグエンディアン)。
   * 残すものがなければ null。
   */
  function buildTiff(report) {
    const ifd0 = [];
    const exif = [];
    if (report.orientation > 1 && report.orientation <= 8) ifd0.push({ tag: 0x0112, type: 3, short: report.orientation });
    if (report.keepDates) {
      for (const tag of [0x9003, 0x9004]) {
        if (report.dates[tag]) exif.push({ tag, type: 2, text: report.dates[tag] });
      }
    }
    if (!ifd0.length && !exif.length) return null;
    if (exif.length) ifd0.push({ tag: 0x8769, type: 4, pointer: true });

    const ifd0Size = 2 + ifd0.length * 12 + 4;
    const exifOffset = 8 + ifd0Size;
    const exifSize = exif.length ? 2 + exif.length * 12 + 4 : 0;
    let dataOffset = exifOffset + exifSize;
    const total = dataOffset + exif.reduce((n, e) => n + e.text.length + 1 + ((e.text.length + 1) & 1), 0);
    const t = new Uint8Array(total);
    t.set(ascii("MM\0*"), 0);
    setU32be(t, 4, 8);
    const writeIfd = (at, list) => {
      t[at] = 0;
      t[at + 1] = list.length;
      list.forEach((e, i) => {
        const q = at + 2 + i * 12;
        t[q] = e.tag >> 8;
        t[q + 1] = e.tag & 0xff;
        t[q + 3] = e.type;
        if (e.type === 3) {
          setU32be(t, q + 4, 1);
          t[q + 9] = e.short;
        } else if (e.pointer) {
          setU32be(t, q + 4, 1);
          setU32be(t, q + 8, exifOffset);
        } else {
          setU32be(t, q + 4, e.text.length + 1);
          setU32be(t, q + 8, dataOffset);
          t.set(ascii(e.text), dataOffset);
          dataOffset += e.text.length + 1 + ((e.text.length + 1) & 1);
        }
      });
    };
    writeIfd(8, ifd0);
    if (exif.length) writeIfd(exifOffset, exif);
    if (report.orientation > 1 && report.orientation <= 8) report.kept.add("向き");
    if (exif.length) report.kept.add("撮影日時");
    return t;
  }

  // ---------------------------------------------------------------- JPEG

  function cleanJpeg(u8, report) {
    if (u8[0] !== 0xff || u8[1] !== 0xd8) throw new Error("JPEG として読み込めません");
    const head = [];
    const body = [];
    let p = 2;
    let ended = false;

    while (p + 1 < u8.length) {
      if (u8[p] !== 0xff) throw new Error(`JPEG 構造が不正です (offset ${p})`);
      while (u8[p + 1] === 0xff) p++; // フィルバイト
      const m = u8[p + 1];
      if (m === 0xd9) {
        body.push(u8.subarray(p, p + 2));
        p += 2;
        ended = true;
        break;
      }
      if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) {
        body.push(u8.subarray(p, p + 2));
        p += 2;
        continue;
      }
      const segEnd = p + 2 + u16be(u8, p + 2);
      if (segEnd > u8.length) throw new Error("JPEG セグメントが途中で切れています");
      const seg = u8.subarray(p, segEnd);
      const pl = p + 4; // ペイロード開始

      if (m === 0xda) {
        // SOS: 画像データ。EOI まで(プログレッシブの途中セグメント含め)そのまま保持
        let q = segEnd;
        for (;;) {
          while (q + 1 < u8.length && !(u8[q] === 0xff && u8[q + 1] !== 0 && !(u8[q + 1] >= 0xd0 && u8[q + 1] <= 0xd7))) q++;
          if (q + 1 >= u8.length) {
            q = u8.length;
            break;
          }
          let mk = u8[q + 1];
          while (mk === 0xff && q + 2 < u8.length) {
            q++;
            mk = u8[q + 1];
          }
          if (mk === 0xd9) {
            q += 2;
            ended = true;
            break;
          }
          const len = u16be(u8, q + 2);
          q += 2 + len;
        }
        body.push(u8.subarray(p, q));
        p = q;
        break;
      }

      if (m === 0xe0) {
        if (startsWith(u8, pl, "JFIF\0") && segEnd - pl >= 12) {
          // JFIF は保持(埋め込みサムネイルがあれば除去)
          const jfif = new Uint8Array(18);
          jfif.set([0xff, 0xe0, 0x00, 0x10]);
          jfif.set(u8.subarray(pl, pl + 12), 4);
          if (u8[pl + 12] || u8[pl + 13]) report.add("サムネイル画像");
          head.unshift(jfif);
        } else {
          report.add("JFIF拡張(サムネイル)");
        }
      } else if (m === 0xe1) {
        if (startsWith(u8, pl, "Exif\0")) {
          report.add("EXIF");
          parseTiff(u8.subarray(0, segEnd), pl + 6, report);
        } else if (startsWith(u8, pl, "http://ns.adobe.com/xap/1.0/") || startsWith(u8, pl, "http://ns.adobe.com/xmp/extension/")) {
          report.add("XMP");
          detectXmp(u8.subarray(pl, segEnd), report);
        } else report.add("APP1 その他メタデータ");
      } else if (m === 0xe2) {
        if (startsWith(u8, pl, "ICC_PROFILE\0")) body.push(seg); // 色再現に必要
        else if (startsWith(u8, pl, "MPF\0")) report.add("MPF(複数画像情報)");
        else report.add("APP2 その他メタデータ");
      } else if (m === 0xed) {
        report.add("IPTC/Photoshop情報");
      } else if (m === 0xee) {
        if (startsWith(u8, pl, "Adobe")) body.push(seg); // 色変換に必要
        else report.add("APP14 その他メタデータ");
      } else if (m >= 0xe3 && m <= 0xef) {
        report.add(`APP${m - 0xe0} メーカー独自データ`);
      } else if (m === 0xfe) {
        const c = textDecoder.decode(u8.subarray(pl, segEnd)).replace(/\0+$/, "").trim();
        report.add("コメント", c ? c.slice(0, 60) : "");
      } else {
        body.push(seg); // DQT, SOF, DHT, DRI など画像の復元に必要なもの
      }
      p = segEnd;
    }

    if (p < u8.length && ended) {
      report.add("画像末尾の付加データ(モーションフォト・追加画像等)", `${u8.length - p} バイト`);
    }

    const parts = [u8.subarray(0, 2), ...head];
    const tiff = buildTiff(report);
    if (tiff) {
      const app1 = new Uint8Array(4 + 6 + tiff.length);
      app1.set([0xff, 0xe1, ((app1.length - 2) >> 8) & 0xff, (app1.length - 2) & 0xff]);
      app1.set(ascii("Exif\0\0"), 4);
      app1.set(tiff, 10);
      parts.push(app1);
    }
    return concat(parts.concat(body));
  }

  function detectXmp(u8, report) {
    const s = textDecoder.decode(u8);
    const checks = [
      [/exif:GPS|GPSLatitude|GPSLongitude/i, "GPS位置情報(XMP)"],
      [/tiff:Model|tiff:Make/i, "カメラ機種(XMP)"],
      [/aux:Lens|exifEX:Lens|LensModel/i, "レンズ機種(XMP)"],
      [/SerialNumber/i, "シリアル番号(XMP)"],
      [/dc:creator|photoshop:Author/i, "作成者(XMP)"],
      [/DateTimeOriginal|xmp:CreateDate|photoshop:DateCreated/i, "撮影日時(XMP)"],
      [/Iptc4xmpCore:Location|photoshop:City|photoshop:Country|Iptc4xmpExt:Location/i, "撮影場所(XMP)"],
      [/mwg-rs:Regions|MPRI:Regions/i, "顔・人物の領域情報(XMP)"],
      [/GCamera:MotionPhoto|GCamera:MicroVideo|Container:Directory/i, "モーションフォト情報(XMP)"],
    ];
    for (const [re, label] of checks) if (re.test(s)) report.add(label);
  }

  // ---------------------------------------------------------------- PNG

  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const PNG_DROP = { tEXt: "テキスト情報", zTXt: "テキスト情報(圧縮)", iTXt: "テキスト情報(国際化)", eXIf: "EXIF", tIME: "更新日時" };

  function makePngChunk(type, data) {
    const c = new Uint8Array(12 + data.length);
    setU32be(c, 0, data.length);
    c.set(ascii(type), 4);
    c.set(data, 8);
    setU32be(c, 8 + data.length, crc32(c.subarray(4, 8 + data.length)));
    return c;
  }

  function cleanPng(u8, report) {
    for (let i = 0; i < 8; i++) if (u8[i] !== PNG_SIG[i]) throw new Error("PNG として読み込めません");
    const parts = [u8.subarray(0, 8)];
    let p = 8;
    let sawIend = false;
    while (p + 12 <= u8.length) {
      const len = u32be(u8, p);
      const type = latin1(u8, p + 4, 4);
      const end = p + 12 + len;
      if (end > u8.length) throw new Error("PNG チャンクが途中で切れています");
      if (PNG_DROP[type]) {
        if (type === "tEXt" || type === "iTXt" || type === "zTXt") {
          const kwEnd = u8.indexOf(0, p + 8);
          const kw = kwEnd > 0 && kwEnd < end ? latin1(u8, p + 8, kwEnd - p - 8) : "";
          report.add(PNG_DROP[type], kw);
          if (/XML:com\.adobe\.xmp/.test(kw)) detectXmp(u8.subarray(p + 8, end - 4), report);
        } else if (type === "eXIf") {
          report.add("EXIF");
          parseTiff(u8.subarray(p + 8, end - 4), 0, report);
        } else report.add(PNG_DROP[type]);
      } else {
        if (type === "IDAT" && !parts.exifDone) {
          const tiff = buildTiff(report);
          if (tiff) parts.push(makePngChunk("eXIf", tiff));
          parts.exifDone = true;
        }
        parts.push(u8.subarray(p, end));
      }
      p = end;
      if (type === "IEND") {
        sawIend = true;
        break;
      }
    }
    if (sawIend && p < u8.length) report.add("画像末尾の付加データ", `${u8.length - p} バイト`);
    return concat(parts);
  }

  // ---------------------------------------------------------------- WebP

  function cleanWebp(u8, report) {
    if (!startsWith(u8, 0, "RIFF") || !startsWith(u8, 8, "WEBP")) throw new Error("WebP として読み込めません");
    const riffEnd = Math.min(u8.length, 8 + u32le(u8, 4));
    const parts = [];
    let vp8x = null;
    let p = 12;
    while (p + 8 <= riffEnd) {
      const type = latin1(u8, p, 4);
      const size = u32le(u8, p + 4);
      const end = Math.min(riffEnd, p + 8 + size + (size & 1));
      if (type === "EXIF") {
        report.add("EXIF");
        const d = p + 8;
        parseTiff(u8.subarray(0, end), startsWith(u8, d, "Exif\0\0") ? d + 6 : d, report);
      } else if (type === "XMP ") {
        report.add("XMP");
        detectXmp(u8.subarray(p + 8, end), report);
      } else {
        const chunk = u8.slice(p, end);
        if (type === "VP8X") vp8x = chunk;
        parts.push(chunk);
      }
      p = end;
    }
    if (vp8x) {
      vp8x[8] &= ~(0x08 | 0x04); // EXIF / XMP フラグを下ろす
      // 撮影日時を残す場合は、日時だけの EXIF チャンクを付け直す(拡張形式 VP8X のファイルのみ)
      const tiff = report.keepDates && report.dates[0x9003] ? buildTiff({ ...report, orientation: 1 }) : null;
      if (tiff) {
        const chunk = new Uint8Array(8 + tiff.length + (tiff.length & 1));
        chunk.set(ascii("EXIF"), 0);
        setU32le(chunk, 4, tiff.length);
        chunk.set(tiff, 8);
        parts.push(chunk);
        vp8x[8] |= 0x08;
        report.kept.add("撮影日時");
      }
    }
    const header = new Uint8Array(12);
    header.set(ascii("RIFF"), 0);
    setU32le(header, 4, 4 + parts.reduce((n, c) => n + c.length, 0));
    header.set(ascii("WEBP"), 8);
    if (riffEnd < u8.length) report.add("画像末尾の付加データ", `${u8.length - riffEnd} バイト`);
    return concat([header, ...parts]);
  }

  // ---------------------------------------------------------------- ISO BMFF (MP4/MOV/HEIC)

  const HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs", "mif1", "msf1", "avif", "avis", "mif2", "jpeg"]);
  const XMP_UUID = "be7acfcb97a942e89c71999491e3afac";
  const CONTAINER_IN_MOOV = new Set(["trak", "mdia", "minf", "stbl", "edts", "dinf"]);
  const TIME_BOXES = new Set(["mvhd", "tkhd", "mdhd"]);
  const META_BOXES = new Set(["meta", "udta", "uuid", "XMP_", "ilst"]);

  const hex = (u8, p, n) => Array.from(u8.subarray(p, p + n), (b) => b.toString(16).padStart(2, "0")).join("");

  /** バッファ内のボックスを列挙する */
  function boxesIn(u8, start, end) {
    const list = [];
    let p = start;
    while (p + 8 <= end) {
      let size = u32be(u8, p);
      const type = latin1(u8, p + 4, 4);
      let hdr = 8;
      if (size === 1) {
        if (p + 16 > end) break;
        size = u64be(u8, p + 8);
        hdr = 16;
      } else if (size === 0) size = end - p;
      if (size < hdr || p + size > end) break;
      list.push({ type, start: p, end: p + size, body: p + hdr });
      p += size;
    }
    return list;
  }

  /** ファイル(Blob)の最上位ボックスを、ヘッダだけ読んで列挙する */
  async function topLevelBoxes(blob) {
    const list = [];
    let p = 0;
    while (p + 8 <= blob.size) {
      const h = await readBytes(blob, p, Math.min(blob.size, p + 32));
      let size = u32be(h, 0);
      const type = latin1(h, 4, 4);
      let hdr = 8;
      if (size === 1) {
        size = u64be(h, 8);
        hdr = 16;
      } else if (size === 0) size = blob.size - p;
      if (size < hdr || p + size > blob.size) {
        if (list.length === 0) throw new Error("MP4/MOV/HEIC として読み込めません");
        break; // 末尾のゴミ・切れたボックスはそのまま残す
      }
      const box = { type, start: p, end: p + size, body: p + hdr };
      if (type === "uuid") box.uuid = hex(h, hdr, 16);
      list.push(box);
      p += size;
    }
    return list;
  }

  /** QuickTime / iTunes 形式のメタデータから報告用の値を拾う */
  function describeMetadataBox(u8, start, end, report) {
    try {
      describeMetadataBoxUnsafe(u8, start, end, report);
    } catch {
      /* 表示用の解析に失敗しても削除処理は続行する */
    }
  }

  function describeMetadataBoxUnsafe(u8, start, end, report) {
    const s = latin1(u8, start, end - start);
    const pick = (re) => {
      const m = re.exec(s);
      return m ? m[1] : "";
    };
    if (/location\.ISO6709|\xa9xyz|loci/.test(s)) {
      const loc = pick(/([+-]\d{1,2}\.\d+[+-]\d{1,3}\.\d+(?:[+-][\d.]+)?\/?)/);
      report.add("GPS位置情報", loc);
    }
    const keys = parseQtKeys(u8, start, end);
    for (const [k, v] of Object.entries(keys)) {
      const label = {
        "com.apple.quicktime.make": "メーカー",
        "com.apple.quicktime.model": "カメラ機種",
        "com.apple.quicktime.software": "ソフトウェア",
        "com.apple.quicktime.creationdate": "撮影日時",
        "com.apple.quicktime.author": "作成者",
        "com.apple.quicktime.artist": "作成者",
        "com.apple.quicktime.camera.lens_model": "レンズ機種",
        "com.apple.quicktime.camera.identifier": "カメラ識別子",
        "com.apple.quicktime.content.identifier": "コンテンツID",
        "com.android.manufacturer": "メーカー",
        "com.android.model": "カメラ機種",
        "com.android.version": "ソフトウェア",
      }[k];
      if (label) report.add(label, v.slice(0, 80));
    }
    const qt = { "\xa9mak": "メーカー", "\xa9mod": "カメラ機種", "\xa9swr": "ソフトウェア", "\xa9day": "撮影日時", "\xa9ART": "作成者", "\xa9aut": "作成者", "\xa9cmt": "コメント" };
    for (const [tag, label] of Object.entries(qt)) {
      const i = s.indexOf(tag);
      if (i < 4) continue;
      const v = readQtString(u8, start + i - 4);
      report.add(label, v.slice(0, 80));
    }
    if (/CNTH|CNCV|CMT1|CNMN/.test(s)) report.add("カメラ固有情報(Canon)");
    if (/FIRM|CAME|LENS|MUID|GPMF/.test(s)) report.add("カメラ固有情報(GoPro等)");
    if (/manu|modl|USMT|MTDT/.test(s)) report.add("カメラ固有情報");
  }

  function readQtString(u8, p) {
    try {
      const size = u32be(u8, p);
      const end = p + size;
      if (size < 12 || end > u8.length) return "";
      if (startsWith(u8, p + 12, "data")) return textDecoder.decode(u8.subarray(p + 24, end)).replace(/\0+$/, "");
      const len = u16be(u8, p + 8);
      if (p + 12 + len <= end) return textDecoder.decode(u8.subarray(p + 12, p + 12 + len)).replace(/\0+$/, "");
    } catch {
      /* noop */
    }
    return "";
  }

  /** Apple 形式 (keys + ilst) のメタデータを {キー名: 値} に変換 */
  function parseQtKeys(u8, start, end) {
    const out = {};
    const k = indexOfBytes(u8.subarray(start, end), "keys");
    const i = indexOfBytes(u8.subarray(start, end), "ilst");
    if (k < 4 || i < 4) return out;
    const kp = start + k - 4;
    const keysEnd = kp + u32be(u8, kp);
    const names = [];
    let p = kp + 16;
    const count = u32be(u8, kp + 12);
    for (let n = 0; n < count && p + 8 <= keysEnd; n++) {
      const sz = u32be(u8, p);
      if (sz < 8) break;
      names.push(latin1(u8, p + 8, sz - 8));
      p += sz;
    }
    const ip = start + i - 4;
    for (const item of boxesIn(u8, ip + 8, Math.min(end, ip + u32be(u8, ip)))) {
      const idx = u32be(u8, item.start + 4);
      const name = names[idx - 1];
      if (!name) continue;
      for (const d of boxesIn(u8, item.body, item.end)) {
        if (d.type === "data" && u32be(u8, d.body) === 1) {
          out[name] = textDecoder.decode(u8.subarray(d.body + 8, d.end));
        }
      }
    }
    return out;
  }

  /** ボックスを "free" に書き換え、中身を 0 で埋める(サイズは変えない) */
  function neutralize(u8, box) {
    u8.set(ascii("free"), box.start + 4);
    const bodyStart = box.body;
    u8.fill(0, bodyStart, box.end);
  }

  function zeroTimes(u8, box) {
    const v = u8[box.body];
    const p = box.body + 4;
    const hadTime = v === 1 ? u64be(u8, p) !== 0 : u32be(u8, p) !== 0;
    u8.fill(0, p, p + (v === 1 ? 16 : 8));
    return hadTime;
  }

  /**
   * moov ボックス(メモリ上)を処理する。
   * 戻り値: 時系列メタデータトラックのサンプル位置 [{offset, length}]
   */
  function processMoov(u8, moov, report) {
    const zeroRanges = [];
    const walk = (start, end, trackInfo) => {
      for (const box of boxesIn(u8, start, end)) {
        if (TIME_BOXES.has(box.type)) {
          if (report.keepDates) report.kept.add("撮影日時");
          else if (zeroTimes(u8, box)) report.add("作成・更新日時(動画)");
        } else if (META_BOXES.has(box.type)) {
          describeMetadataBox(u8, box.body, box.end, report);
          report.add(box.type === "uuid" ? "メーカー独自データ(uuid)" : `メタデータ(${box.type})`);
          neutralize(u8, box);
        } else if (box.type === "trak") {
          const info = { handler: "", codec: "" };
          walk(box.body, box.end, info);
          if (info.handler === "meta" || info.handler === "camm" || info.codec === "gpmd" || info.codec === "camm" || info.codec === "mett") {
            const ranges = sampleRanges(u8, box);
            if (ranges.length) {
              report.add("時系列メタデータ(GPS・センサー等)", info.codec || info.handler);
              zeroRanges.push(...ranges);
            }
          }
        } else if (CONTAINER_IN_MOOV.has(box.type)) {
          walk(box.body, box.end, trackInfo);
        } else if (box.type === "hdlr" && trackInfo) {
          trackInfo.handler = latin1(u8, box.body + 8, 4);
        } else if (box.type === "stsd" && trackInfo) {
          trackInfo.codec = latin1(u8, box.body + 12, 4);
        }
      }
    };
    walk(moov.body, moov.end, null);
    return zeroRanges;
  }

  /** トラックの全サンプルのファイル内位置を、チャンク単位で求める */
  function sampleRanges(u8, trak) {
    let stbl = null;
    const find = (start, end) => {
      for (const b of boxesIn(u8, start, end)) {
        if (b.type === "stbl") stbl = b;
        else if (["mdia", "minf"].includes(b.type)) find(b.body, b.end);
      }
    };
    find(trak.body, trak.end);
    if (!stbl) return [];
    let stsz = null;
    let stsc = null;
    let stco = null;
    let co64 = false;
    for (const b of boxesIn(u8, stbl.body, stbl.end)) {
      if (b.type === "stsz") stsz = b;
      else if (b.type === "stsc") stsc = b;
      else if (b.type === "stco") stco = b;
      else if (b.type === "co64") {
        stco = b;
        co64 = true;
      }
    }
    if (!stsz || !stsc || !stco) return [];
    const fixed = u32be(u8, stsz.body + 4);
    const sampleCount = u32be(u8, stsz.body + 8);
    const sizeOf = (i) => (fixed ? fixed : u32be(u8, stsz.body + 12 + i * 4));
    const chunkCount = u32be(u8, stco.body + 4);
    const chunkOffset = (i) => (co64 ? u64be(u8, stco.body + 8 + i * 8) : u32be(u8, stco.body + 8 + i * 4));
    const scCount = u32be(u8, stsc.body + 4);
    const sc = [];
    for (let i = 0; i < scCount; i++) {
      const q = stsc.body + 8 + i * 12;
      sc.push([u32be(u8, q), u32be(u8, q + 4)]);
    }
    const ranges = [];
    let sample = 0;
    for (let c = 0; c < chunkCount && sample < sampleCount; c++) {
      let perChunk = 0;
      for (const [first, n] of sc) if (first <= c + 1) perChunk = n;
      let len = 0;
      for (let k = 0; k < perChunk && sample < sampleCount; k++, sample++) len += sizeOf(sample);
      if (len > 0) ranges.push({ offset: chunkOffset(c), length: len });
    }
    return ranges;
  }

  /** HEIF の meta ボックス(メモリ上)から Exif / XMP アイテムの位置を求める */
  function heifMetadataItems(u8, meta) {
    const children = boxesIn(u8, meta.body + 4, meta.end);
    const iinf = children.find((b) => b.type === "iinf");
    const iloc = children.find((b) => b.type === "iloc");
    const idat = children.find((b) => b.type === "idat");
    if (!iinf || !iloc) return [];

    const targets = new Map(); // item_ID -> "exif" | "xmp"
    const iv = u8[iinf.body];
    const first = iinf.body + 4 + (iv === 0 ? 2 : 4);
    for (const infe of boxesIn(u8, first, iinf.end)) {
      if (infe.type !== "infe") continue;
      const v = u8[infe.body];
      let p = infe.body + 4;
      if (v >= 2) {
        const id = v === 2 ? u16be(u8, p) : u32be(u8, p);
        p += v === 2 ? 4 : 6;
        const itemType = latin1(u8, p, 4);
        p += 4;
        const nameEnd = u8.indexOf(0, p);
        const contentType = itemType === "mime" && nameEnd > 0 ? latin1(u8, nameEnd + 1, Math.max(0, u8.indexOf(0, nameEnd + 1) - nameEnd - 1)) : "";
        if (itemType === "Exif") targets.set(id, "exif");
        else if (itemType === "mime" && /xmp|rdf\+xml/i.test(contentType)) targets.set(id, "xmp");
      }
    }
    if (!targets.size) return [];

    const lv = u8[iloc.body];
    let p = iloc.body + 4;
    const offsetSize = u8[p] >> 4;
    const lengthSize = u8[p] & 15;
    const baseSize = u8[p + 1] >> 4;
    const indexSize = lv >= 1 ? u8[p + 1] & 15 : 0;
    p += 2;
    const itemCount = lv < 2 ? u16be(u8, p) : u32be(u8, p);
    p += lv < 2 ? 2 : 4;
    const items = [];
    for (let i = 0; i < itemCount; i++) {
      const id = lv < 2 ? u16be(u8, p) : u32be(u8, p);
      p += lv < 2 ? 2 : 4;
      let method = 0;
      if (lv >= 1) {
        method = u16be(u8, p) & 15;
        p += 2;
      }
      p += 2; // data_reference_index
      const base = readUintBE(u8, p, baseSize);
      p += baseSize;
      const extentCount = u16be(u8, p);
      p += 2;
      const extents = [];
      for (let e = 0; e < extentCount; e++) {
        p += indexSize;
        const off = readUintBE(u8, p, offsetSize);
        p += offsetSize;
        const len = readUintBE(u8, p, lengthSize);
        p += lengthSize;
        extents.push({ offset: base + off, length: len });
      }
      const kind = targets.get(id);
      if (!kind) continue;
      if (method === 1) {
        if (!idat) continue;
        for (const ex of extents) ex.inMeta = idat.body + ex.offset - meta.start;
      } else if (method !== 0) continue;
      items.push({ kind, extents });
    }
    return items;
  }

  function emptyXmp(length) {
    const xml = '<x:xmpmeta xmlns:x="adobe:ns:meta/"/>';
    const out = new Uint8Array(length).fill(0x20);
    if (length >= xml.length) out.set(ascii(xml), 0);
    return out;
  }

  function emptyExifItem(length, report) {
    const out = new Uint8Array(length);
    const tiff = report.keepDates ? buildTiff({ ...report, orientation: 1, kept: report.kept }) : null;
    if (tiff && length >= 4 + tiff.length) {
      out.set(tiff, 4); // exif_tiff_header_offset = 0, 続けて撮影日時だけの TIFF
    } else if (length >= 4 + 14) {
      // exif_tiff_header_offset = 0, 続けて空の TIFF (IFD エントリ 0 件)
      out.set(ascii("MM\0*"), 4);
      setU32be(out, 8, 8);
    }
    return out;
  }

  async function cleanIsoBmff(blob, report) {
    const boxes = await topLevelBoxes(blob);
    const ftyp = boxes.find((b) => b.type === "ftyp");
    let isHeif = false;
    if (ftyp) {
      const h = await readBytes(blob, ftyp.body, Math.min(ftyp.end, ftyp.body + 64));
      isHeif = HEIF_BRANDS.has(latin1(h, 0, 4));
    }
    const patches = []; // {offset, data}

    for (const box of boxes) {
      if (box.type === "moov") {
        const u8 = await readBytes(blob, box.start, box.end);
        const local = { ...box, start: 0, end: u8.length, body: box.body - box.start };
        const ranges = processMoov(u8, local, report);
        patches.push({ offset: box.start, data: u8 });
        let zero = null;
        for (const r of ranges) {
          if (r.offset + r.length > blob.size) continue;
          if (!zero || zero.length < r.length) zero = new Uint8Array(Math.max(r.length, 65536));
          patches.push({ offset: r.offset, data: zero.subarray(0, r.length) });
        }
      } else if (box.type === "meta" && isHeif) {
        const u8 = await readBytes(blob, box.start, box.end);
        const local = { ...box, start: 0, end: u8.length, body: box.body - box.start };
        const items = heifMetadataItems(u8, local);
        let metaChanged = false;
        for (const item of items) {
          const total = item.extents.reduce((n, e) => n + e.length, 0);
          const original = [];
          for (const ex of item.extents) {
            if (ex.inMeta !== undefined) original.push(u8.subarray(ex.inMeta, ex.inMeta + ex.length));
            else original.push(await readBytes(blob, ex.offset, ex.offset + ex.length));
          }
          const data = concat(original);
          if (item.kind === "exif") {
            report.add("EXIF");
            const tiffStart = data.length >= 4 ? 4 + u32be(data, 0) : 0;
            if (startsWith(data, tiffStart, "MM\0*") || startsWith(data, tiffStart, "II*\0")) parseTiff(data, tiffStart, report);
          } else if (/<[a-z]+:[a-z]+[\s>][\s\S]*\S/i.test(textDecoder.decode(data).replace(/<x:xmpmeta xmlns:x="adobe:ns:meta\/"\/>/, ""))) {
            report.add("XMP");
            detectXmp(data, report);
          }
          const replacement = item.kind === "exif" ? emptyExifItem(total, report) : emptyXmp(total);
          let q = 0;
          for (const ex of item.extents) {
            const piece = replacement.subarray(q, q + ex.length);
            q += ex.length;
            const inMeta = ex.inMeta !== undefined ? ex.inMeta : ex.offset >= box.start && ex.offset + ex.length <= box.end ? ex.offset - box.start : undefined;
            if (inMeta !== undefined) {
              u8.set(piece, inMeta);
              metaChanged = true;
            } else patches.push({ offset: ex.offset, data: piece });
          }
        }
        if (metaChanged) patches.push({ offset: box.start, data: u8 });
      } else if (box.type === "meta" || box.type === "udta" || (box.type === "uuid" && !isHeif) || (box.type === "uuid" && box.uuid === XMP_UUID)) {
        const len = box.end - box.start;
        if (len > 64 * 1024 * 1024) continue; // 異常に大きいものは対象外
        const u8 = await readBytes(blob, box.start, box.end);
        const local = { ...box, start: 0, end: u8.length, body: box.body - box.start };
        describeMetadataBox(u8, local.body, local.end, report);
        if (box.uuid === XMP_UUID) {
          report.add("XMP");
          detectXmp(u8, report);
        } else report.add(box.type === "uuid" ? "メーカー独自データ(uuid)" : `メタデータ(${box.type})`);
        neutralize(u8, local);
        patches.push({ offset: box.start, data: u8 });
      }
    }
    return applyPatches(blob, patches);
  }

  function applyPatches(blob, patches) {
    patches.sort((a, b) => a.offset - b.offset);
    const parts = [];
    let p = 0;
    for (const { offset, data } of patches) {
      if (offset < p) continue; // 重なりは安全側でスキップ
      if (offset > p) parts.push(blob.slice(p, offset));
      parts.push(data);
      p = offset + data.length;
    }
    if (p < blob.size) parts.push(blob.slice(p));
    return new Blob(parts, { type: blob.type });
  }

  // ---------------------------------------------------------------- 形式判定と公開 API

  async function detectType(blob) {
    const h = await readBytes(blob, 0, Math.min(blob.size, 16));
    if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return "jpeg";
    if (PNG_SIG.every((b, i) => h[i] === b)) return "png";
    if (startsWith(h, 0, "RIFF") && startsWith(h, 8, "WEBP")) return "webp";
    const t = latin1(h, 4, 4);
    if (t === "ftyp" && /^(crx |CR3 )$/.test(latin1(h, 8, 4))) return null; // Canon RAW (CR3) は未対応
    if (["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot"].includes(t)) {
      if (t === "ftyp" && HEIF_BRANDS.has(latin1(h, 8, 4))) return "heif";
      return "video";
    }
    return null;
  }

  const TYPE_LABELS = { jpeg: "JPEG", png: "PNG", webp: "WebP", heif: "HEIC/HEIF", video: "動画(MP4/MOV)" };

  /** 既知だが未対応の形式(メタデータを含む可能性があるため注意を促す) */
  const UNSUPPORTED_EXT = new Set(["tif", "tiff", "dng", "cr2", "cr3", "crw", "nef", "nrw", "arw", "srf", "sr2", "raf", "orf", "rw2", "pef", "srw", "x3f", "gif", "bmp", "avi", "mts", "m2ts", "wmv", "mkv", "webm", "mpg", "mpeg", "jxl"]);
  const SIDECAR_EXT = new Set(["xmp", "aae", "thm", "xml", "lrv"]);

  /**
   * メタデータを削除する。
   * @param {Blob} blob 元ファイル
   * @param {{keepDates?: boolean}} [options] keepDates: 撮影日時を残す
   * @returns {Promise<{type: string, label: string, blob: Blob, found: string[], kept: string[]}>}
   */
  async function clean(blob, options = {}) {
    if (blob.size === 0) throw new Error("空のファイルです");
    const type = await detectType(blob);
    if (!type) throw new Error("対応していないファイル形式です");
    const report = new Report();
    report.keepDates = !!options.keepDates;
    let out;
    if (type === "jpeg" || type === "png" || type === "webp") {
      const u8 = new Uint8Array(await blob.arrayBuffer());
      const fn = { jpeg: cleanJpeg, png: cleanPng, webp: cleanWebp }[type];
      out = new Blob([fn(u8, report)], { type: blob.type });
    } else {
      out = await cleanIsoBmff(blob, report);
    }
    return { type, label: TYPE_LABELS[type], blob: out, found: report.found, kept: Array.from(report.kept) };
  }

  const api = { clean, detectType, crc32, UNSUPPORTED_EXT, SIDECAR_EXT, TYPE_LABELS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PhotoCleaner = api;
})(typeof self !== "undefined" ? self : this);
