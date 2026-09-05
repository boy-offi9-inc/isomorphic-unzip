/**
 * @param {string} input
 * @returns {never}
 */
function readPath(input) {
  throw new TypeError(
    "String input to Unzip is treated as a Node filesystem path, which isn't available in browser environments. " +
      "Pass a File/Blob, Uint8Array, or ArrayBuffer instead."
  );
}

/**
 * Yields chunks of a Blob/File via its native .stream(), for true streaming
 * (bounded memory regardless of archive size) rather than reading the whole
 * Blob into an ArrayBuffer up front. Falls back to manual .slice() reads on
 * the rare environment where Blob.stream() isn't available.
 *
 * @param {Blob} input
 * @param {number} chunkSize
 */
async function* streamInput(input, chunkSize) {
  if (typeof input === "string") {
    throw new TypeError(
      "String input is treated as a Node filesystem path, which isn't available in browser environments. " +
        "Pass a File/Blob for streaming."
    );
  }

  if (typeof input.stream === "function") {
    const reader = input.stream().getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value instanceof Uint8Array ? value : new Uint8Array(value);
      }
    } finally {
      if (reader.releaseLock) reader.releaseLock();
    }
    return;
  }

  // Fallback for environments without Blob.stream() (older Safari).
  let offset = 0;
  while (offset < input.size) {
    const slice = input.slice(offset, offset + chunkSize);
    const buf = await slice.arrayBuffer();
    yield new Uint8Array(buf);
    offset += chunkSize;
  }
}

module.exports = { readPath, streamInput };
