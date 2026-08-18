const { unzipSync } = require("fflate");

/**
 * Reads `input` into a single Uint8Array, regardless of what shape it came in
 * as. This is the actual fix over the original isomorphic-unzip: one code
 * path handles Node file paths, Buffers, Uint8Arrays, and browser
 * Blob/File objects, instead of gluing together two separate libraries
 * (yauzl for Node, zip.js for browser) that never reached behavioral parity.
 */
async function readInputAsBytes(input) {
  if (typeof input === "string") {
    // Treat as a Node filesystem path — matches the original API.
    const fs = require("fs");
    return new Uint8Array(fs.readFileSync(input));
  }

  if (input instanceof Uint8Array) {
    return input;
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) {
    return new Uint8Array(input);
  }

  if (typeof Blob !== "undefined" && input instanceof Blob) {
    const arrayBuffer = await input.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  throw new TypeError(
    "Unsupported input type for Unzip — expected a file path (Node), Buffer, Uint8Array, ArrayBuffer, or Blob/File (browser)."
  );
}

/**
 * Matches an entry name against the `whatYouNeed` list. Supports string
 * (case-insensitive, matching the original library's behavior — its own
 * examples pass lowercase names against mixed-case real entries like
 * "AndroidManifest.xml"), RegExp, and predicate function.
 */
function matchesWhatYouNeed(entryName, whatYouNeed) {
  return whatYouNeed.some((want) => {
    if (typeof want === "string") {
      return entryName.toLowerCase() === want.toLowerCase();
    }
    if (want instanceof RegExp) {
      return want.test(entryName);
    }
    if (typeof want === "function") {
      return want(entryName) === true;
    }
    return false;
  });
}

function toOutputBuffer(bytes) {
  // Return a real Buffer in Node (matches the original library's output
  // shape, so existing consumers doing Buffer-specific things keep working),
  // a plain Uint8Array in browser environments where Buffer doesn't exist.
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes);
  }
  return bytes;
}

class Unzip {
  /**
   * @param {string | Buffer | Uint8Array | ArrayBuffer | Blob} input
   *   Node: a file path (string), or raw bytes (Buffer/Uint8Array/ArrayBuffer).
   *   Browser: a File or Blob, or raw bytes.
   */
  constructor(input) {
    this.input = input;
    this._bytesPromise = null;
  }

  _getBytes() {
    if (!this._bytesPromise) {
      this._bytesPromise = readInputAsBytes(this.input);
    }
    return this._bytesPromise;
  }

  /**
   * Extracts specific entries by name/pattern.
   *
   * @param {(string | RegExp | ((entryName: string) => boolean))[]} whatYouNeed
   * @param {(err: Error | null, buffers?: Record<string, Buffer | Uint8Array>) => void} callback
   */
  getBuffer(whatYouNeed, callback) {
    this._getBytes()
      .then((bytes) => {
        let unzipped;
        try {
          unzipped = unzipSync(bytes, {
            filter: (file) => matchesWhatYouNeed(file.name, whatYouNeed),
          });
        } catch (err) {
          callback(err);
          return;
        }

        const buffers = {};
        for (const [name, data] of Object.entries(unzipped)) {
          buffers[name] = toOutputBuffer(data);
        }
        callback(null, buffers);
      })
      .catch((err) => callback(err));
  }

  /**
   * Promise-based equivalent of getBuffer, for callers who'd rather not deal
   * with the callback style. Not part of the original API, added since it's
   * the more natural fit for how most code is written today.
   */
  getBufferAsync(whatYouNeed) {
    return new Promise((resolve, reject) => {
      this.getBuffer(whatYouNeed, (err, buffers) => {
        if (err) reject(err);
        else resolve(buffers);
      });
    });
  }

  /**
   * Lists every entry name in the archive. The original library only
   * supported this reliably in Node — here it works identically everywhere,
   * since both environments now go through the same read-then-unzip path.
   */
  async getEntries() {
    const bytes = await this._getBytes();
    const unzipped = unzipSync(bytes);
    return Object.keys(unzipped);
  }
}

module.exports = { Unzip };
module.exports.default = Unzip;
