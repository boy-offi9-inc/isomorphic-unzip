const fs = require("fs");

/** @param {string} input - a Node filesystem path */
function readPath(input) {
  return new Uint8Array(fs.readFileSync(input));
}

module.exports = { readPath };
