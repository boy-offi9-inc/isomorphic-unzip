// Node-only. Not required by core.js, platform-browser.js, or index.browser.js —
// writing to a real filesystem is inherently a Node thing, so this stays out
// of the browser bundle entirely rather than being stubbed there.
const fs = require("fs");
const path = require("path");

/**
 * Extracts matched entries from a zip directly to disk, streaming each
 * entry's data straight into a write stream instead of buffering it in
 * memory first. Intended for large archives (APKs, IPAs, etc.) where you
 * want the extracted files on disk, not held as Buffers.
 *
 * Guards against zip-slip: an entry name containing ".." (or an absolute
 * path) that would resolve outside destDir is rejected rather than written,
 * since a zip's central directory is attacker-controllable data and nothing
 * about the zip format prevents a malicious "../../etc/passwd"-style name.
 *
 * @param {import("./core").Unzip} unzip - an Unzip instance
 * @param {(string | RegExp | ((entryName: string) => boolean))[]} whatYouNeed
 * @param {string} destDir
 * @param {{ onEntry?: (entryName: string, outPath: string) => void }} [options]
 * @returns {Promise<string[]>} paths written, in the order their entries completed
 */
async function extractToDir(unzip, whatYouNeed, destDir, options = {}) {
  const resolvedDest = path.resolve(destDir);
  await fs.promises.mkdir(resolvedDest, { recursive: true });

  const written = [];
  const openStreams = new Map();
  const streamErrors = [];

  await unzip.extractStream(whatYouNeed, {
    onEntry(name) {
      const outPath = path.resolve(resolvedDest, name);
      const relative = path.relative(resolvedDest, outPath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        // Zip-slip attempt — refuse to write outside destDir. We can't
        // reject() from inside this callback (extractStream's contract is
        // sync onEntry/onData, async completion), so we record it and
        // surface it once the stream settles, and simply never open a
        // write stream for this entry (its data callbacks become no-ops).
        streamErrors.push(
          new Error(`Refusing to extract "${name}" — resolves outside the destination directory (zip-slip).`)
        );
        return;
      }

      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      const ws = fs.createWriteStream(outPath);
      openStreams.set(name, ws);
      if (options.onEntry) options.onEntry(name, outPath);
    },
    onData(name, chunk, isLast) {
      const ws = openStreams.get(name);
      if (!ws) return; // zip-slip entry — silently dropped, error reported after
      ws.write(chunk);
      if (isLast) {
        ws.end();
        openStreams.delete(name);
        written.push(path.resolve(resolvedDest, name));
      }
    },
  });

  if (streamErrors.length > 0) {
    throw streamErrors[0];
  }

  return written;
}

module.exports = { extractToDir };
