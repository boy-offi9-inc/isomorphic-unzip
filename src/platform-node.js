const fs = require("fs");

/** @param {string} input - a Node filesystem path */
function readPath(input) {
  return new Uint8Array(fs.readFileSync(input));
}

/**
 * Yields chunks of a file path via fs.createReadStream, for true streaming
 * (bounded memory regardless of archive size) rather than reading the whole
 * file up front. This is the Node half of extractStream's platform seam —
 * core.js only calls this when the input is a string path; Buffer/Uint8Array
 * input is chunked generically in stream.js instead, since that doesn't
 * need any platform-specific I/O.
 *
 * @param {string} input - a Node filesystem path
 * @param {number} chunkSize
 */
async function* streamInput(input, chunkSize) {
  if (typeof input !== "string") {
    throw new TypeError(
      "Streaming a Blob/File is not supported in Node — pass a file path (string), or use extractStream with in-memory bytes."
    );
  }
  const stream = fs.createReadStream(input, { highWaterMark: chunkSize });
  for await (const chunk of stream) {
    yield chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
  }
}

module.exports = { readPath, streamInput };
