const { Unzip: FflateStreamUnzip, UnzipInflate } = require("fflate");
const { matchesWhatYouNeed } = require("./match");

/**
 * Splits an already-in-memory Uint8Array into chunks. Used when the input
 * to extractStream is a Buffer/Uint8Array/ArrayBuffer rather than a file
 * path or Blob — the compressed source is already fully resident in memory
 * (nothing to be done about that, the caller loaded it that way), but this
 * keeps the rest of the pipeline identical to the true-streaming case: matched
 * entries are still emitted incrementally via onData instead of being
 * buffered into one big returned object, so extracting many/large entries
 * doesn't hold them all in memory simultaneously.
 */
function* chunkBytes(bytes, chunkSize) {
  for (let i = 0; i < bytes.length; i += chunkSize) {
    yield bytes.subarray(i, i + chunkSize);
  }
}

// See core.js's rethrowWithContext — same reasoning, duplicated here rather
// than shared because the streaming error surface (per-chunk callback) is
// different enough from the sync throw that sharing the call site added more
// indirection than it removed.
function contextualizeError(err) {
  const message = String((err && err.message) || err);
  if (/unsupported compression|invalid zip|invalid stored/i.test(message)) {
    const wrapped = new Error(
      `${message} — this archive may be password-protected or use a compression method fflate doesn't support. ` +
        "Encrypted/password-protected zip entries are not supported (fflate has no zip-encryption implementation)."
    );
    wrapped.cause = err;
    return wrapped;
  }
  return err instanceof Error ? err : new Error(message);
}

/**
 * Streams matched entries out of a zip archive without buffering the whole
 * archive or the whole set of decompressed outputs in memory at once.
 *
 * @param {AsyncIterable<Uint8Array> | Iterable<Uint8Array>} chunks
 *   The compressed zip bytes, in order, as they become available.
 * @param {(string | RegExp | ((entryName: string) => boolean))[]} whatYouNeed
 * @param {{
 *   onEntry?: (entryName: string) => void,
 *   onData?: (entryName: string, chunk: Uint8Array, isLast: boolean) => void,
 *   onEnd?: () => void,
 * }} handlers
 * @returns {Promise<void>}
 */
function streamExtract(chunks, whatYouNeed, handlers) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settleReject = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    const unzipper = new FflateStreamUnzip();
    unzipper.register(UnzipInflate);

    let pendingFiles = 0;
    let sourceEnded = false;

    const maybeResolve = () => {
      if (settled) return;
      if (sourceEnded && pendingFiles === 0) {
        settled = true;
        if (handlers.onEnd) handlers.onEnd();
        resolve();
      }
    };

    unzipper.onfile = (file) => {
      if (!matchesWhatYouNeed(file.name, whatYouNeed)) return;
      pendingFiles++;
      if (handlers.onEntry) handlers.onEntry(file.name);

      file.ondata = (err, chunk, final) => {
        if (err) {
          settleReject(contextualizeError(err));
          return;
        }
        if (handlers.onData) handlers.onData(file.name, chunk, final);
        if (final) {
          pendingFiles--;
          maybeResolve();
        }
      };

      file.start();
    };

    (async () => {
      try {
        for await (const chunk of chunks) {
          if (settled) return;
          unzipper.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk), false);
        }
        if (settled) return;
        unzipper.push(new Uint8Array(0), true);
        sourceEnded = true;
        maybeResolve();
      } catch (err) {
        settleReject(contextualizeError(err));
      }
    })();
  });
}

module.exports = { streamExtract, chunkBytes };
