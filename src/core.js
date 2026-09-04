const { unzipSync, zipSync, strToU8 } = require("fflate");

/**
 * Matches an entry name against the `whatYouNeed` list. Supports string
 * (case-insensitive, matching the original library's behavior), RegExp,
 * and predicate function.
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
  // shape), a plain Uint8Array in browser environments where Buffer
  // doesn't exist.
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes);
  }
  return bytes;
}

function toInputBytes(value) {
  if (typeof value === "string") return strToU8(value);
  if (value instanceof Uint8Array) return value;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError(
    "Unsupported entry value for zipping — expected a string, Buffer, Uint8Array, or ArrayBuffer."
  );
}

// fflate throws plain Errors with no stable .code for malformed/unsupported
// archives, so we pattern-match the message. Encrypted (password-protected)
// zip entries are the most common cause a caller hits this — fflate doesn't
// implement zip encryption at all, so there's no way to support it here
// short of a different underlying library. We turn the opaque failure into
// an explicit, documented limitation instead of a confusing stack trace.
function rethrowWithContext(err) {
  const message = String((err && err.message) || err);
  if (/unsupported compression|invalid zip|invalid stored/i.test(message)) {
    const wrapped = new Error(
      `${message} — this archive may be password-protected or use a compression method fflate doesn't support. ` +
        "Encrypted/password-protected zip entries are not supported (fflate has no zip-encryption implementation)."
    );
    wrapped.cause = err;
    throw wrapped;
  }
  throw err;
}

/**
 * Builds the Unzip class, given a `readPath(input)` function that knows how
 * to turn a string input into bytes for the current platform. This is the
 * one seam between platforms: everything else lives here, in a file that
 * never references `fs`.
 *
 * @param {(input: string) => Uint8Array} readPath
 */
function createUnzipClass(readPath) {
  async function readInputAsBytes(input) {
    if (typeof input === "string") {
      return readPath(input);
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

  class Unzip {
    /**
     * @param {string | Buffer | Uint8Array | ArrayBuffer | Blob} input
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
     * @param {(entryName: string) => void} [onProgress]
     *   Optional. Called once per entry as it's matched and decompressed —
     *   fires by entry, not by byte, since fflate's sync API doesn't expose
     *   byte-level progress.
     */
    getBuffer(whatYouNeed, callback, onProgress) {
      this._getBytes()
        .then((bytes) => {
          let unzipped;
          try {
            unzipped = unzipSync(bytes, {
              filter: (file) => {
                const matched = matchesWhatYouNeed(file.name, whatYouNeed);
                if (matched && typeof onProgress === "function") {
                  onProgress(file.name);
                }
                return matched;
              },
            });
          } catch (err) {
            try {
              rethrowWithContext(err);
            } catch (contextualized) {
              callback(contextualized);
              return;
            }
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
     * Promise-based equivalent of getBuffer.
     *
     * @param {(string | RegExp | ((entryName: string) => boolean))[]} whatYouNeed
     * @param {(entryName: string) => void} [onProgress]
     */
    getBufferAsync(whatYouNeed, onProgress) {
      return new Promise((resolve, reject) => {
        this.getBuffer(
          whatYouNeed,
          (err, buffers) => {
            if (err) reject(err);
            else resolve(buffers);
          },
          onProgress
        );
      });
    }

    /**
     * Lists every entry name in the archive.
     */
    async getEntries() {
      const bytes = await this._getBytes();
      try {
        const unzipped = unzipSync(bytes);
        return Object.keys(unzipped);
      } catch (err) {
        rethrowWithContext(err);
      }
    }
  }

  return Unzip;
}

/**
 * Creates a zip archive from a flat map of entry name -> content.
 * Not part of the original isomorphic-unzip API (which was extract-only) —
 * added so this package can also close the loop on simple zip creation.
 *
 * @param {Record<string, string | Buffer | Uint8Array | ArrayBuffer>} entries
 * @param {{ level?: number }} [options] level: 0 (store) to 9 (max). Default fflate behavior (6) if omitted.
 * @param {(err: Error | null, bytes?: Buffer | Uint8Array) => void} callback
 */
function zipEntries(entries, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  options = options || {};

  try {
    const input = {};
    for (const [name, value] of Object.entries(entries)) {
      const bytes = toInputBytes(value);
      input[name] = typeof options.level === "number" ? [bytes, { level: options.level }] : bytes;
    }
    const zipped = zipSync(input);
    callback(null, toOutputBuffer(zipped));
  } catch (err) {
    callback(err);
  }
}

/**
 * Promise-based equivalent of zipEntries.
 *
 * @param {Record<string, string | Buffer | Uint8Array | ArrayBuffer>} entries
 * @param {{ level?: number }} [options]
 * @returns {Promise<Buffer | Uint8Array>}
 */
function zipEntriesAsync(entries, options) {
  return new Promise((resolve, reject) => {
    zipEntries(entries, options, (err, bytes) => {
      if (err) reject(err);
      else resolve(bytes);
    });
  });
}

module.exports = { createUnzipClass, zipEntries, zipEntriesAsync };
