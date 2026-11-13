/** cleaner.js(写真・動画メタデータ削除エンジン)の型定義 */

export type MediaType = "jpeg" | "png" | "webp" | "heif" | "video";

export interface CleanOptions {
  /** 撮影日時を残す */
  keepDates?: boolean;
  /** 位置情報(緯度・経度・高度)を残す */
  keepLocation?: boolean;
}

export interface CleanResult {
  /** 中身から判定したファイル形式 */
  type: MediaType;
  /** 表示用の形式名 */
  label: string;
  /** メタデータを削除したデータ */
  blob: Blob;
  /** 元ファイルに含まれていた情報(表示用) */
  found: string[];
  /** 残した項目(「向き」「撮影日時」「位置情報」) */
  kept: string[];
  /** 縮小・再圧縮した画像に付け直す EXIF(TIFF 構造)。残すものがなければ null */
  reencodeExif: Uint8Array | null;
  /**
   * 元のメタデータ(「メタデータを削除しない」で縮小・変換した画像に付け直す用)。
   * tiff は Orientation を 1 にした EXIF。動画では null
   */
  original: { tiff: Uint8Array | null; xmp: Uint8Array | null; iptc: Uint8Array | null } | null;
}

/** メタデータを削除する。対応していない形式・壊れたファイルでは例外を投げる */
export function clean(blob: Blob, options?: CleanOptions): Promise<CleanResult>;

/** 縮小・再圧縮した画像に EXIF(と任意で XMP・IPTC)を差し込む */
export function insertExif(
  u8: Uint8Array,
  type: "jpeg" | "png" | "webp",
  tiff: Uint8Array | null,
  width: number,
  height: number,
  extra?: { xmp?: Uint8Array | null; iptc?: Uint8Array | null }
): Uint8Array;

/** ファイルの中身から形式を判定する。対応外なら null */
export function detectType(blob: Blob): Promise<MediaType | null>;

export function crc32(u8: Uint8Array, crc?: number): number;

export const UNSUPPORTED_EXT: Set<string>;
export const SIDECAR_EXT: Set<string>;
export const TYPE_LABELS: Record<MediaType, string>;
