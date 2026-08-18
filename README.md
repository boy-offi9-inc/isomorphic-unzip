<div align="center">
  <img src="https://i.ibb.co/hxd66XLj/file-000000008f8081f4bd2ad19dc26151ca.png" width="80" alt="isomorphic-unzip icon" />

  # isomorphic-unzip

  [![npm version](https://img.shields.io/npm/v/%40boy-offi9-inc%2Fisomorphic-unzip.svg)](https://www.npmjs.com/package/@boy-offi9-inc/isomorphic-unzip)
  [![npm downloads](https://img.shields.io/npm/dm/%40boy-offi9-inc%2Fisomorphic-unzip.svg)](https://www.npmjs.com/package/@boy-offi9-inc/isomorphic-unzip)
  [![license](https://img.shields.io/npm/l/%40boy-offi9-inc%2Fisomorphic-unzip.svg)](./LICENSE)
  [![node engine](https://img.shields.io/node/v/%40boy-offi9-inc%2Fisomorphic-unzip.svg)](./package.json)
</div>

A maintained drop-in replacement for [`isomorphic-unzip`](https://www.npmjs.com/package/isomorphic-unzip), which has been unmaintained since 2019 and never actually finished what it set out to do — by its own README: *"we haven't made it totally consistent between NodeJS/browser yet, maybe later."*

Same public API. Same call shape. Different internals: one real isomorphic implementation ([`fflate`](https://www.npmjs.com/package/fflate)) instead of gluing together two separate libraries (`yauzl` for Node, `zip.js` for browser) that never reached behavioral parity.

**Why not just switch to `unzipit`/`fflate` directly instead?** You can, and for new code that's probably the better call. This package exists specifically for projects that already depend on `isomorphic-unzip`'s API and want to fix the underlying breakage (e.g. the Vite/browser-env incompatibility reported against `app-info-parser` and others) without rewriting their call sites.

---

## Migration from `isomorphic-unzip`

```diff
- const Unzip = require('isomorphic-unzip');
+ const Unzip = require('@boy-offi9-inc/isomorphic-unzip');
```

That's it for most usage. The `getBuffer` call shape is unchanged:

```js
const unzip = new Unzip(pathOrBytesOrBlob);

unzip.getBuffer(['androidmanifest.xml', 'resources.arsc'], (err, buffers) => {
  if (err) throw err;
  // buffers is { 'AndroidManifest.xml': Buffer, 'resources.arsc': Buffer }
  console.log(buffers);
});
```

**One behavior change worth knowing about:** `getEntries()` now works identically in both Node and browser. The original only supported it reliably in Node — that inconsistency was part of what made it unmaintained in the first place.

---

## Install

```bash
npm install @boy-offi9-inc/isomorphic-unzip
```

## Usage

### Node — file path

```js
const Unzip = require('@boy-offi9-inc/isomorphic-unzip');

const unzip = new Unzip('/path/to/file.apk');
unzip.getBuffer(['AndroidManifest.xml'], (err, buffers) => {
  if (err) throw err;
  console.log(buffers['AndroidManifest.xml'].toString());
});
```

### Node — Buffer/Uint8Array

```js
const bytes = fs.readFileSync('/path/to/file.apk');
const unzip = new Unzip(bytes);
```

### Browser — File/Blob

```js
const unzip = new Unzip(fileInput.files[0]);
unzip.getBuffer(['manifest.json'], (err, buffers) => {
  if (err) throw err;
  console.log(buffers['manifest.json']); // Uint8Array in browser
});
```

### Promise-based (not in the original, added since it's the more natural fit today)

```js
const buffers = await unzip.getBufferAsync(['AndroidManifest.xml']);
```

### Matching entries

`whatYouNeed` accepts strings (case-insensitive exact match — matches the original's behavior), `RegExp`, or predicate functions:

```js
unzip.getBuffer([
  'AndroidManifest.xml',        // exact (case-insensitive)
  /^META-INF\//,                 // RegExp
  (name) => name.endsWith('.json'), // predicate
], callback);
```

### Listing all entries

```js
const entries = await unzip.getEntries(); // string[]
```

---

## Design notes

- **Zero-config isomorphism.** One code path reads the input (file path, Buffer, Uint8Array, ArrayBuffer, or Blob/File) into bytes, then hands off to `fflate`'s `unzipSync`. No environment-specific branches in the unzip logic itself — that's the actual fix over the original.
- **`fs` never reaches a browser bundle.** The one genuinely platform-specific piece — reading a file path in Node — lives in its own file, wired in only through the Node entry point. Bundlers that respect the `"browser"` export condition (Vite, webpack 5+, Rollup) never see `fs` referenced at all, so there's nothing to externalize or warn about — verified against a real Vite production build.
- **`fflate` as the only runtime dependency.** Zero-dependency itself, actively maintained, genuinely the same implementation in Node and browser.
- **CJS + ESM entry points**, TypeScript types included.
- **Real, verified test suite** — every test builds an actual zip in memory via `fflate` and round-trips it through the `Unzip` class, not mocked.