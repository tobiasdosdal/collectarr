---
tags: [performance]
summary: performance implementation decisions and patterns
relevantTo: [performance]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# performance

#### [Pattern] Lazy loading components matched to router structure - lazy load Browse sub-components and Settings sections to reduce initial bundle (2026-01-14)
- **Problem solved:** Plan includes lazy loading strategy but doesn't detail which components - router-aware splitting is more effective
- **Why this works:** Users visiting Dashboard don't need Browse or Settings code loaded. Splitting at page level is easier than component level and yields bigger gains. React Router 7.12 has good lazy/Suspense support
- **Trade-offs:** Easier: Smaller initial load. Harder: Slightly slower first load of that section, must handle Suspense boundaries

#### [Gotcha] ETag calculation using file content hash is expensive on large images; switched to file stats (mtime + size) instead (2026-01-14)
- **Situation:** Initial design considered full content hashing for perfect cache validation, but this blocks the event loop on large files
- **Root cause:** File stats are O(1) vs O(n) for content hash. Stat-based ETags are sufficient for cache invalidation since mtime changes when file is written
- **How to avoid:** Stat-based ETags cannot detect silent data corruption, but file validation (magic number checking) compensates for this; simpler operation vs perfect correctness

### File validation via magic number checking (JPEG/PNG headers) rather than full re-download on corruption detection (2026-01-14)
- **Context:** Corrupted cached images are caught but system must decide: re-download or reject. File size + header check is fastest detection
- **Why:** Magic numbers validate file type in first 8 bytes - O(1) operation. If detected as corrupt, file is evicted and next request re-downloads. Avoids expensive re-checks
- **Rejected:** Full file validation on every access - defeats purpose of caching; lazy validation (only check when serving) - corrupted files serve bad content
- **Trade-offs:** Corruption only detected at access time (not during cleanup), but cache hit path remains fast. Corrupted file causes one failed request then re-download
- **Breaking if changed:** If magic number validation is disabled, corrupted images serve silently. If header checking is skipped, you lose detection ability