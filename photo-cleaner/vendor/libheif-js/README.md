# libheif-js 1.18.2(同梱)

HEIC/HEIF 画像をブラウザで読み込むためのライブラリです。Safari 以外のブラウザ(Chrome・Edge・Firefox)は
HEIC を表示できないため、HEIC を JPEG に変換するときにこのライブラリで読み込みます。

- 配布元: npm パッケージ [`libheif-js@1.18.2`](https://www.npmjs.com/package/libheif-js/v/1.18.2) の `libheif-wasm/libheif-bundle.js`(無改変)
- ライセンス: LGPL-3.0(`LICENSE`)。含まれる libheif・libde265 などのライセンスは `LICENSE-libheif-wasm`
- SHA-384: `tLy8T9fQEbFqGjC3ZYyRb5S+qhtywfU6rsjUf3nN1g4q2cvTmV43XN0xdtDYp1tx`

ネットワークからは読み込まず、このファイルをそのまま使います(オフラインでも動作し、外部のサイトに依存しません)。
差し替えるときは同じ場所に置き換え、上の版数とハッシュを更新してください。
