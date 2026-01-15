---
tags: [database]
summary: database implementation decisions and patterns
relevantTo: [database]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# database

#### [Gotcha] LRU eviction must track access patterns (count + timestamp) separately; simple size limit alone cannot fairly evict old vs new small files (2026-01-14)
- **Situation:** When cache exceeds size limit, need to decide which files to remove. Naive approach: just remove largest files first, but fails for many small old files
- **Root cause:** Access patterns reflect true value - frequently accessed recent files should stay, old unused files should go first. Combined metric (age + frequency) provides fair eviction
- **How to avoid:** Requires maintaining metadata (accessCount, lastAccessed) for every cached file, adding disk I/O and memory overhead; but prevents thrashing where small old files prevent caching new content