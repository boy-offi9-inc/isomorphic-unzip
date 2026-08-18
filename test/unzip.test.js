const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { zipSync, strToU8 } = require("fflate");
const { Unzip } = require("../src/index");
const UnzipDefault = require("../src/index");

function makeTestZip() {
  return zipSync({
    "AndroidManifest.xml": strToU8("<manifest>fake manifest content</manifest>"),
    "resources.arsc": strToU8("fake resources binary"),
    "META-INF/CERT.RSA": strToU8("fake cert bytes"),
    "assets/data.json": strToU8('{"hello":"world"}'),
  });
}

test("Unzip.getBuffer extracts a single named entry (case-insensitive)", async () => {
  const zipBytes = makeTestZip();
  const unzip = new Unzip(zipBytes);

  const buffers = await new Promise((resolve, reject) => {
    unzip.getBuffer(["androidmanifest.xml"], (err, result) => (err ? reject(err) : resolve(result)));
  });

  assert.ok(buffers["AndroidManifest.xml"]);
  assert.equal(buffers["AndroidManifest.xml"].toString(), "<manifest>fake manifest content</manifest>");
});

test("Unzip.getBuffer supports RegExp matching", async () => {
  const zipBytes = makeTestZip();
  const unzip = new Unzip(zipBytes);

  const buffers = await new Promise((resolve, reject) => {
    unzip.getBuffer([/^META-INF\//], (err, result) => (err ? reject(err) : resolve(result)));
  });

  assert.ok(buffers["META-INF/CERT.RSA"]);
  assert.equal(Object.keys(buffers).length, 1);
});

test("Unzip.getBuffer supports a predicate function", async () => {
  const zipBytes = makeTestZip();
  const unzip = new Unzip(zipBytes);

  const buffers = await new Promise((resolve, reject) => {
    unzip.getBuffer([(name) => name.endsWith(".json")], (err, result) => (err ? reject(err) : resolve(result)));
  });

  assert.ok(buffers["assets/data.json"]);
  assert.deepEqual(JSON.parse(buffers["assets/data.json"].toString()), { hello: "world" });
});

test("Unzip.getBuffer returns only requested entries, not the whole archive", async () => {
  const zipBytes = makeTestZip();
  const unzip = new Unzip(zipBytes);

  const buffers = await new Promise((resolve, reject) => {
    unzip.getBuffer(["resources.arsc"], (err, result) => (err ? reject(err) : resolve(result)));
  });

  assert.equal(Object.keys(buffers).length, 1);
  assert.ok(buffers["resources.arsc"]);
});

test("Unzip.getBuffer returns Buffer instances in Node", async () => {
  const zipBytes = makeTestZip();
  const unzip = new Unzip(zipBytes);

  const buffers = await new Promise((resolve, reject) => {
    unzip.getBuffer(["resources.arsc"], (err, result) => (err ? reject(err) : resolve(result)));
  });

  assert.ok(Buffer.isBuffer(buffers["resources.arsc"]));
});

test("Unzip.getBufferAsync works as a Promise-based equivalent", async () => {
  const zipBytes = makeTestZip();
  const unzip = new Unzip(zipBytes);

  const buffers = await unzip.getBufferAsync(["assets/data.json"]);
  assert.ok(buffers["assets/data.json"]);
});

test("Unzip.getEntries lists every entry name", async () => {
  const zipBytes = makeTestZip();
  const unzip = new Unzip(zipBytes);

  const entries = await unzip.getEntries();
  assert.equal(entries.length, 4);
  assert.ok(entries.includes("AndroidManifest.xml"));
  assert.ok(entries.includes("META-INF/CERT.RSA"));
});

test("Unzip accepts a Node file path (string input)", async () => {
  const zipBytes = makeTestZip();
  const tmpFile = path.join(os.tmpdir(), `reqkit-test-${Date.now()}.zip`);
  fs.writeFileSync(tmpFile, zipBytes);

  try {
    const unzip = new Unzip(tmpFile);
    const buffers = await unzip.getBufferAsync(["resources.arsc"]);
    assert.ok(buffers["resources.arsc"]);
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test("Unzip.getBuffer errors out on a malformed zip instead of hanging", async () => {
  const notAZip = Buffer.from("this is definitely not a zip file");
  const unzip = new Unzip(notAZip);

  await assert.rejects(() => unzip.getBufferAsync(["anything"]));
});

test("default export (module.exports) is directly usable as the constructor, matching original drop-in usage", async () => {
  const zipBytes = makeTestZip();
  const unzip = new UnzipDefault(zipBytes);
  const buffers = await unzip.getBufferAsync(["resources.arsc"]);
  assert.ok(buffers["resources.arsc"]);
});

test("constructor throws a clear error on unsupported input types", async () => {
  const unzip = new Unzip(12345);
  await assert.rejects(() => unzip.getBufferAsync(["anything"]), /Unsupported input type/);
});

test("browser entry point works on real inputs (Buffer) without touching fs", async () => {
  const UnzipBrowser = require("../src/index.browser");
  const zipBytes = makeTestZip();
  const unzip = new UnzipBrowser(zipBytes);

  const buffers = await unzip.getBufferAsync(["resources.arsc"]);
  assert.ok(buffers["resources.arsc"]);
});

test("browser entry point rejects string (file path) input with a clear error, not a crash", async () => {
  const UnzipBrowser = require("../src/index.browser");
  const unzip = new UnzipBrowser("/some/path.zip");

  await assert.rejects(() => unzip.getBufferAsync(["anything"]), /isn't available in browser environments/);
});
