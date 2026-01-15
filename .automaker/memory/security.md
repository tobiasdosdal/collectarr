---
tags: [security]
summary: security implementation decisions and patterns
relevantTo: [security]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# security

### Restricted cache filenames to MD5 hex format only, rejecting any other pattern to prevent path traversal attacks (2026-01-14)
- **Context:** Cache system needs to prevent adversaries from accessing arbitrary files via specially crafted filenames
- **Why:** MD5 hashes are fixed-length (32 hex chars) and deterministic - no room for traversal sequences like '../'. Whitelist approach (only hex) is more secure than blacklist
- **Rejected:** Path normalization and stripping '../' - these are fragile and can be bypassed with encoding tricks; whitelist is simpler and provably correct
- **Trade-offs:** Slightly tighter coupling to MD5 filename generation (must ensure all cache keys are valid MD5), but eliminates entire class of path traversal vulnerabilities
- **Breaking if changed:** Any code that tries to cache using non-MD5 filenames will fail silently. If cache key generation changes, validation must update too