const { createUnzipClass, zipEntries, zipEntriesAsync } = require("./core");
const { readPath, streamInput } = require("./platform-node");
const { extractToDir } = require("./extract-to-dir");

const Unzip = createUnzipClass(readPath, streamInput);

// The original isomorphic-unzip is used as `var Unzip = require('isomorphic-unzip')`
// then `new Unzip(...)` — i.e. the module.exports itself is the constructor.
// Preserved here for true drop-in compatibility, with a named export too for
// anyone who prefers `const { Unzip } = require(...)`.
module.exports = Unzip;
module.exports.Unzip = Unzip;
module.exports.zipEntries = zipEntries;
module.exports.zipEntriesAsync = zipEntriesAsync;
module.exports.extractToDir = extractToDir;
