const { createUnzipClass, zipEntries, zipEntriesAsync } = require("./core");
const { readPath, streamInput } = require("./platform-browser");

// This entry point never requires "fs" — not stubbed by a bundler, genuinely
// absent from the module graph. Bundlers that support the "browser" package.json
// export condition (Vite, webpack, Rollup w/ browser resolution) load this
// instead of index.js automatically. extractToDir is Node-only (it writes to
// a real filesystem) and deliberately isn't exported here.
const Unzip = createUnzipClass(readPath, streamInput);

module.exports = Unzip;
module.exports.Unzip = Unzip;
module.exports.zipEntries = zipEntries;
module.exports.zipEntriesAsync = zipEntriesAsync;
