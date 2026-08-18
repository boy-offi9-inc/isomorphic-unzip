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

module.exports = { readPath };
