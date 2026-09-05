/**
 * Matches an entry name against a `whatYouNeed` list. Supports string
 * (case-insensitive exact match — matches the original isomorphic-unzip's
 * behavior), RegExp, and predicate function. Shared between the sync
 * (unzipSync-based) and streaming extraction paths so matching semantics
 * never drift between the two.
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

module.exports = { matchesWhatYouNeed };
