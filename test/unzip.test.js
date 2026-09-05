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

test("zipEntries creates an archive that Unzip can read back", async () => {
  const { zipEntries } = require("../src/index");

  const zipBytes = await new Promise((resolve, reject) => {
    zipEntries(
      {
        "hello.txt": "hello world",
        "data.json": strToU8('{"ok":true}'),
      },
      (err, bytes) => (err ? reject(err) : resolve(bytes))
    );
  });

  assert.ok(zipBytes instanceof Buffer || zipBytes instanceof Uint8Array);

  const unzip = new Unzip(zipBytes);
  const buffers = await unzip.getBufferAsync(["hello.txt", "data.json"]);
  assert.equal(buffers["hello.txt"].toString(), "hello world");
  assert.equal(buffers["data.json"].toString(), '{"ok":true}');
});

test("zipEntriesAsync round-trips through Unzip and respects a compression level option", async () => {
  const { zipEntriesAsync } = require("../src/index");

  const zipBytes = await zipEntriesAsync(
    { "note.txt": "stored, not compressed" },
    { level: 0 }
  );

  const unzip = new Unzip(zipBytes);
  const buffers = await unzip.getBufferAsync(["note.txt"]);
  assert.equal(buffers["note.txt"].toString(), "stored, not compressed");
});

test("zipEntries rejects an unsupported entry value type", async () => {
  const { zipEntriesAsync } = require("../src/index");
  await assert.rejects(
    () => zipEntriesAsync({ "bad.txt": 12345 }),
    /Unsupported entry value/
  );
});

test("Unzip.getBuffer calls onProgress once per matched entry", async () => {
  const zipBytes = makeTestZip();
  const unzip = new Unzip(zipBytes);
  const seen = [];

  const buffers = await unzip.getBufferAsync(
    [/^assets\//, "resources.arsc"],
    (entryName) => seen.push(entryName)
  );

  assert.equal(Object.keys(buffers).length, 2);
  assert.deepEqual(seen.sort(), ["assets/data.json", "resources.arsc"].sort());
});

test("Unzip.getBuffer does not call onProgress for entries that don't match", async () => {
  const zipBytes = makeTestZip();
  const unzip = new Unzip(zipBytes);
  const seen = [];

  await unzip.getBufferAsync(["resources.arsc"], (entryName) => seen.push(entryName));

  assert.deepEqual(seen, ["resources.arsc"]);
});

test("src/unzip.js dead file was removed (only src/core.js implements Unzip)", () => {
  const fs = require("fs");
  const path = require("path");
  assert.equal(fs.existsSync(path.join(__dirname, "..", "src", "unzip.js")), false);
});

test("Unzip.extractStream emits matched entries in chunks from an in-memory Buffer", async () => {
  const zipBytes = makeTestZip();
  const unzip = new Unzip(zipBytes);

  const entries = [];
  const collected = {};

  await unzip.extractStream([/^assets\//, "resources.arsc"], {
    onEntry(name) {
      entries.push(name);
      collected[name] = [];
    },
    onData(name, chunk) {
      collected[name].push(chunk);
    },
  });

  assert.deepEqual(entries.sort(), ["assets/data.json", "resources.arsc"].sort());
  assert.equal(Buffer.concat(collected["assets/data.json"]).toString(), '{"hello":"world"}');
  assert.equal(Buffer.concat(collected["resources.arsc"]).toString(), "fake resources binary");
});

test("Unzip.extractStream true-streams from a file path (fs.createReadStream), not a full read", async () => {
  const zipBytes = makeTestZip();
  const tmpFile = path.join(os.tmpdir(), `iu-stream-test-${Date.now()}.zip`);
  fs.writeFileSync(tmpFile, zipBytes);

  try {
    const unzip = new Unzip(tmpFile);
    const chunks = [];
    await unzip.extractStream(["AndroidManifest.xml"], {
      onData(name, chunk, isLast) {
        chunks.push(chunk);
        if (isLast) {
          assert.equal(Buffer.concat(chunks).toString(), "<manifest>fake manifest content</manifest>");
        }
      },
    });
    assert.ok(chunks.length > 0);
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test("Unzip.extractStream calls onEnd once all matched entries finish", async () => {
  const zipBytes = makeTestZip();
  const unzip = new Unzip(zipBytes);
  let ended = false;
  let entriesFinished = 0;

  await unzip.extractStream([/^META-INF\//, "resources.arsc"], {
    onData(name, chunk, isLast) {
      if (isLast) entriesFinished++;
    },
    onEnd() {
      ended = true;
      assert.equal(entriesFinished, 2, "onEnd should fire only after all matched entries are done");
    },
  });

  assert.ok(ended);
});

test("extractToDir writes matched entries to disk and returns their paths", async () => {
  const { extractToDir } = require("../src/index");
  const zipBytes = makeTestZip();
  const unzip = new Unzip(zipBytes);
  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), "iu-extract-"));

  try {
    const written = await extractToDir(unzip, ["AndroidManifest.xml", /^assets\//], destDir);
    assert.equal(written.length, 2);

    const manifestPath = path.join(destDir, "AndroidManifest.xml");
    const dataPath = path.join(destDir, "assets", "data.json");
    assert.equal(fs.readFileSync(manifestPath, "utf8"), "<manifest>fake manifest content</manifest>");
    assert.equal(fs.readFileSync(dataPath, "utf8"), '{"hello":"world"}');
  } finally {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
});

test("extractToDir refuses zip-slip entries (names that escape destDir)", async () => {
  const { extractToDir, zipEntriesAsync } = require("../src/index");

  // A hand-crafted "malicious" entry name — fflate will happily zip whatever
  // string key we give it, same as any zip tool would.
  const maliciousZip = await zipEntriesAsync({
    "../../evil.txt": "should never be written outside destDir",
  });
  const unzip = new Unzip(maliciousZip);
  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), "iu-slip-"));

  try {
    await assert.rejects(
      () => extractToDir(unzip, ["../../evil.txt"], destDir),
      /zip-slip|resolves outside/
    );
    // Confirm nothing leaked outside destDir.
    const escapedPath = path.resolve(destDir, "..", "..", "evil.txt");
    assert.equal(fs.existsSync(escapedPath), false);
  } finally {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
});

test("extractToDir is not exported from the browser entry point", () => {
  const UnzipBrowser = require("../src/index.browser");
  assert.equal(UnzipBrowser.extractToDir, undefined);
});

test("browser streamInput rejects a Node file-path string with a clear error", async () => {
  const UnzipBrowser = require("../src/index.browser");
  const unzip = new UnzipBrowser("/some/path.zip");
  await assert.rejects(
    () => unzip.extractStream(["anything"], {}),
    /isn't available in browser environments/
  );
});
