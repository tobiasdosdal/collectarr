---
tags: [ui]
summary: ui implementation decisions and patterns
relevantTo: [ui]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# ui

#### [Gotcha] Light theme not just CSS variable swap - requires contrast adjustments for text on light backgrounds, different shadow semantics, and emoji/icon color handling (2026-01-14)
- **Situation:** Plan assumes simple theme toggle with dark/light CSS variables, but *arr projects typically have dark-first design
- **Root cause:** Dark mode designs often rely on contrast tricks (light text on dark) that break on light backgrounds. Icon colors, shadows, and borders need different values. This isn't just a color inversion
- **How to avoid:** Easier: Dual theme support. Harder: Must validate every component visually on both themes, more CSS to maintain

#### [Pattern] Skeleton screens used for perceived performance, not actual performance - focuses on UX while data loads (2026-01-14)
- **Problem solved:** Plan lists 'Loading skeleton screens for better perceived performance' as Phase 4 feature
- **Why this works:** Users perceive skeleton screens as faster (shows progression) vs blank screen (feels stuck). Doesn't reduce actual load time but improves user confidence. Works best for list/card layouts
- **Trade-offs:** Easier: Better UX for user. Harder: Must create skeleton variants for each component