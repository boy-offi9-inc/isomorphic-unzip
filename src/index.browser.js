const { createUnzipClass } = require("./core");
const { readPath } = require("./platform-browser");

// This entry point never requires "fs" — not stubbed by a bundler, genuinely
// absent from the module graph. Bundlers that support the "browser" package.json
// export condition (Vite, webpack, Rollup w/ browser resolution) load this
// instead of index.js automatically.
const Unzip = createUnzipClass(readPath);

module.exports = Unzip;
module.exports.Unzip = Unzip;
