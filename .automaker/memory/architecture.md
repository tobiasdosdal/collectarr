---
tags: [architecture]
summary: architecture implementation decisions and patterns
relevantTo: [architecture]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# architecture

### Phased component library extraction rather than big-bang rewrite - create components in parallel, test each page before removing old code (2026-01-14)
- **Context:** High-risk refactoring of 542-line monolithic pages with scattered CSS classes
- **Why:** Prevents breaking changes during refactoring and allows incremental testing. Parallel creation means old CSS classes coexist with new components until migration is complete per-page
- **Rejected:** Complete rewrite or component-first approach that delays page testing; migration during development instead of after component stability
- **Trade-offs:** Easier: Incremental validation, rollback capability. Harder: Temporary code duplication, dual maintenance patterns during transition
- **Breaking if changed:** If attempted as big-bang rewrite without testing after each phase, would introduce visual regressions and make debugging impossible

### No new npm dependencies - leverage existing lucide-react, React 19.2, React Router 7.12, React Query 5.90 (2026-01-14)
- **Context:** Adding component library, theme system, and multiple new features could tempt adoption of Material-UI, shadcn, or other UI libraries
- **Why:** Existing stack is sufficient. Avoids bundle bloat, dependency management overhead, and learning curves. Custom components let styling perfectly match *arr aesthetic without fighting opinionated library defaults
- **Rejected:** shadcn/ui (excellent but adds complexity), Material-UI (too heavyweight), custom CSS framework (reinvents wheel)
- **Trade-offs:** Easier: Control, bundle size, styling consistency. Harder: Building all components from scratch, no pre-tested patterns
- **Breaking if changed:** Adopting a heavy UI library later would require rewriting all custom components and dealing with CSS conflicts

#### [Pattern] Custom hook layer (useApi, useForm, useLoading) wrapping existing React Query instead of direct integration (2026-01-14)
- **Problem solved:** Pages have scattered React Query calls and form state management logic, making it hard to maintain consistent patterns
- **Why this works:** Abstraction layer allows pages to think in domain terms, not query mechanics. Centralizes error handling, loading state, and retry logic. Enables easier testing and reduces boilerplate per-page
- **Trade-offs:** Easier: Pages are simpler, logic is reusable, testing is centralized. Harder: One more layer of indirection to understand

### Sub-organize Settings and Browse pages into separate files rather than tabs within single large file (2026-01-14)
- **Context:** Settings.jsx is 542 lines, Browse.jsx is 425 lines - too large for maintainability
- **Why:** Smaller files (< 200 lines goal) are easier to test, review, and debug. Sub-components can have independent state and side effects. Allows code splitting - only load active section's code
- **Rejected:** Keep as tabs in single file (harder to test, code splitting impossible), use complex component state (fragile), use Redux (overkill)
- **Trade-offs:** Easier: Testing, code review, lazy loading. Harder: Navigation between sub-components, shared state between sections
- **Breaking if changed:** If kept as monolithic files, code splitting won't work and file complexity will accumulate as features are added

#### [Gotcha] Breadcrumb + Sidebar navigation creates complexity - breadcrumbs show path, sidebar shows location, they can conflict on mobile (2026-01-14)
- **Situation:** Plan adds breadcrumbs for detail pages and mobile hamburger menu, but doesn't address navigation hierarchy conflict
- **Root cause:** On desktop: both work (sidebar is persistent, breadcrumbs show hierarchy). On mobile: hamburger drawer competes for space with breadcrumbs. Need to decide: does breadcrumb replace drawer on mobile, or do both exist?
- **How to avoid:** Easier: Two navigation methods. Harder: Must define clear rules for when each shows and works responsively

#### [Gotcha] Theme persistence needs to survive localStorage while respecting system preferences and manual toggles - three sources of truth (2026-01-14)
- **Situation:** Plan mentions theme toggle stored in localStorage, but doesn't address: what if system preference changes? What if localStorage is cleared? What is priority?
- **Root cause:** Naive implementation: localStorage always wins (ignores system changes). Better approach: localStorage preference overrides system, but on first visit use system preference. Need clear priority: localStorage > system > default
- **How to avoid:** Easier: Simple localStorage toggle. Harder: Must handle three sources of truth, watch for system changes, clear localStorage edge cases

#### [Pattern] Atomic writes using temporary files + rename to prevent partial/corrupted cache entries (2026-01-14)
- **Problem solved:** Without atomicity, concurrent writes or process crashes can leave incomplete files in cache, which then fail validation
- **Why this works:** rename() is atomic at OS level (all-or-nothing). Writing to temp file first ensures either complete file or nothing exists. Validation layer then detects and removes any bad files
- **Trade-offs:** Extra disk I/O (write to temp, then rename) but guarantees consistency; temp file cleanup must be handled to prevent disk space leaks

#### [Gotcha] Scheduled cache cleanup job must be resilient to concurrent cache writes - race conditions possible if cleanup and writes happen simultaneously (2026-01-14)
- **Situation:** Cache cleanup evicts old files on schedule; meanwhile, other requests might be writing new files. Risk: cleanup removes file just written, or misses newly-old files
- **Root cause:** File system operations are not atomic at multi-step level (stat + delete). Cleanup reading old metadata while write updates it causes TOCTOU (time-of-check-time-of-use) bugs
- **How to avoid:** Cleanup must be tolerant of ENOENT (file deleted between stat and unlink), and metadata must be checked fresh before eviction decision. Adds error handling complexity