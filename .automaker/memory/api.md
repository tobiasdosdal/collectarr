---
tags: [api]
summary: api implementation decisions and patterns
relevantTo: [api]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# api

#### [Pattern] Error handling split across three layers: API helpers (retry logic, deduplication), custom hooks (transformation), and Error Boundary (UI recovery) (2026-01-14)
- **Problem solved:** Plan mentions error types, retry logic, API deduplication, but doesn't detail where each lives in code architecture
- **Why this works:** Network errors (retry, dedup) belong in API layer. Application errors (missing data, permissions) belong in hooks. UI errors (crashes) belong in Boundary. Each layer handles what it's best positioned to handle
- **Trade-offs:** Easier: Each layer has single responsibility. Harder: Errors can flow through multiple handlers, requires careful sequencing

### Conditional request support (If-None-Match/If-Modified-Since with 304 responses) alongside traditional caching headers (2026-01-14)
- **Context:** Browsers cache but don't know if remote content changed; without conditional requests, must re-download to validate
- **Why:** 304 Not Modified tells browser 'what you have is still current' without sending body - saves bandwidth. ETag from file stats enables this. Different from cache-control which is time-based
- **Rejected:** Cache-Control alone - works but requires choosing TTL upfront; if content changed, browsers wait. Conditional requests are lazy validation
- **Trade-offs:** Adds complexity (tracking ETags, validating headers, 304 responses) but saves significant bandwidth on cache hits where content is unchanged
- **Breaking if changed:** If ETag generation changes or file stats mtime manipulation occurs, clients get stale 304s. If 304 handling removed from client, falls back to full downloads