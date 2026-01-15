I'll start by exploring the codebase to understand the current structure and then continue with the UI conversion to match *arr project standards.

🔧 Tool: Bash
Input: {
  "command": "find /workspace -type f -name \"*.json\" | grep -E \"(package|tsconfig)\" | head -20",
  "description": "Find project configuration files"
}

🔧 Tool: Bash
Input: {
  "command": "ls -la /workspace",
  "description": "List workspace directory contents"
}
Let me check the current directory:

🔧 Tool: Bash
Input: {
  "command": "pwd && ls -la",
  "description": "Check current directory and list contents"
}
Good! I can see this is an ACDB clone application with a backend and client directory. Let me explore the client structure:

🔧 Tool: Bash
Input: {
  "command": "ls -la /Users/toby/Documents/Apps/acdb-clone/acdb-backend/client",
  "description": "Explore client directory structure"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/package.json"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client"
}
Let me explore the client source structure:

🔧 Tool: Bash
Input: {
  "command": "find /Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src -type f -name \"*.jsx\" -o -name \"*.tsx\" -o -name \"*.js\" | head -30",
  "description": "Find React component files in client"
}

🔧 Tool: Bash
Input: {
  "command": "tree -L 3 /Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src 2>/dev/null || find /Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src -type d | head -20",
  "description": "Show client directory tree"
}
Now let me read the current code to understand what's been implemented:

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/App.jsx"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/components/Layout.jsx"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/styles/main.css"
}
Now let me check the page files to see what's been implemented:

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/pages/Dashboard.jsx"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/pages/Collections.jsx"
}
Let me check the remaining pages and then plan the implementation:

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/pages/Settings.jsx"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/pages/Browse.jsx"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/components/Toast.jsx"
}
Now I have a good understanding of the codebase. Let me create a plan for continuing the UI conversion to match *arr project standards. Let me use the Plan mode:

🔧 Tool: EnterPlanMode
Input: {}
Let me explore additional aspects of the codebase to understand the current architecture better:

🔧 Tool: Task
Input: {
  "description": "Explore current design patterns and structure",
  "subagent_type": "Explore",
  "prompt": "I'm implementing a UI conversion to match *arr project standards (Sonarr/Radarr style). Explore the codebase to understand:\n\n1. Current styling approach - look at main.css to see CSS variables, color scheme, and existing design patterns\n2. Component structure - check how React components are organized and styled\n3. Page layouts - review Dashboard, Collections, Browse, and Settings pages to understand current UI patterns\n4. Authentication and routing - check AuthContext and App.jsx for how auth/routing works\n5. API integration - review the API client to understand how data flows\n\nFocus on:\n- What *arr-style elements already exist (dark theme, sidebar, cards)\n- What needs to be improved or refactored \n- Current component naming and organization patterns\n- Responsive design approach used\n\nReturn a summary of the current state vs *arr standards."
}

🔧 Tool: Glob
Input: {
  "pattern": "**/*.css"
}

🔧 Tool: Glob
Input: {
  "pattern": "**/*.jsx"
}

🔧 Tool: Glob
Input: {
  "pattern": "**/*.js"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/src"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/styles/main.css"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/App.jsx"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/components/Layout.jsx"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/contexts/AuthContext.jsx"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/pages/Dashboard.jsx"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/pages/Collections.jsx"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/pages/Browse.jsx"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/pages/Settings.jsx"
}

🔧 Tool: Glob
Input: {
  "pattern": "client/src/api/**"
}

🔧 Tool: Bash
Input: {
  "command": "find /Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/api -type f -name \"*.js\" -o -name \"*.jsx\" 2>/dev/null",
  "description": "Find API client files"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/api/client.js"
}

🔧 Tool: Bash
Input: {
  "command": "find /Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src -type f \\( -name \"*.jsx\" -o -name \"*.js\" \\) | grep -v node_modules | sort",
  "description": "List all React component files"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/pages/CollectionDetail.jsx",
  "limit": 100
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/components/Toast.jsx"
}

🔧 Tool: Bash
Input: {
  "command": "ls -la /Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/",
  "description": "List client src directory structure"
}

🔧 Tool: Bash
Input: {
  "command": "find /Users/toby/Documents/Apps/acdb-clone/acdb-backend/client/src/hooks -type f 2>/dev/null",
  "description": "List hook files"
}

🔧 Tool: Read
Input: {
  "file_path": "/Users/toby/Documents/Apps/acdb-clone/acdb-backend/package.json"
}
Excellent! Now let me write the plan file with my implementation strategy:

🔧 Tool: Write
Input: {
  "file_path": "/Users/toby/.claude/plans/cozy-coalescing-harbor.md",
  "content": "# UI Conversion to *arr Project Standards - Implementation Plan\n\n## Feature Overview\nConvert the ACDB UI to match *arr project standards (Sonarr/Radarr style) with better component abstraction, improved layouts, and enhanced design system.\n\n## Current State Assessment\n✅ **Strengths:**\n- Dark theme foundation matches *arr aesthetic\n- Sidebar + main layout structure is correct\n- CSS variable system is well-designed (18 variables)\n- API client is organized and functional\n- Context-based auth state management\n- Component separation is clean\n\n❌ **Key Gaps:**\n- No reusable component library (UI patterns as CSS classes only)\n- Large monolithic pages (Settings 542 lines, Browse 425 lines)\n- Scattered inline styles throughout components\n- No custom hooks (empty hooks/ directory)\n- Single dark theme only (no light mode toggle)\n- Basic loading/empty states\n- No breadcrumbs, skeleton screens, or advanced UI patterns\n- Mobile menu missing\n\n## Implementation Strategy\n\n### Phase 1: Component Library Foundation (HIGH PRIORITY)\n**Goal:** Create reusable React components to replace CSS classes\n\n**Files to Create:**\n1. `client/src/components/UI/Button.jsx` - Variants: primary, secondary, danger, ghost, sm, disabled\n2. `client/src/components/UI/Card.jsx` - Wrapper component with optional header\n3. `client/src/components/UI/Input.jsx` - Form input wrapper with label, error states\n4. `client/src/components/UI/Modal.jsx` - Reusable modal with header, footer, actions\n5. `client/src/components/UI/Badge.jsx` - Status badges with color variants\n6. `client/src/components/UI/Spinner.jsx` - Loading spinner component\n7. `client/src/components/UI/EmptyState.jsx` - Standardized empty state layout\n8. `client/src/components/UI/Tabs.jsx` - Tab navigation component\n9. `client/src/components/UI/Table.jsx` - Sortable table wrapper\n10. `client/src/components/UI/PageHeader.jsx` - Page title + actions section\n\n**Files to Update:**\n- `client/src/styles/main.css` - Keep CSS variables, extract component-specific styles\n- All pages to use new components instead of className patterns\n\n### Phase 2: Custom Hooks & Utilities (MEDIUM PRIORITY)\n**Goal:** Reduce code duplication and improve state management patterns\n\n**Files to Create:**\n1. `client/src/hooks/useApi.js` - Wrapper around React Query with loading/error states\n2. `client/src/hooks/useForm.js` - Form state management hook\n3. `client/src/hooks/useLoading.js` - Centralized loading state management\n4. `client/src/utils/apiHelpers.js` - Error handling, retry logic\n5. `client/src/utils/formatters.js` - Date, number, text formatting utilities\n\n### Phase 3: Refactor Monolithic Pages (HIGH PRIORITY)\n**Goal:** Break down large pages into smaller, composable components\n\n**Pages to Refactor:**\n\n1. **Settings.jsx** → Multiple sub-components:\n   - `SettingsAPIKey.jsx` - API key section\n   - `SettingsConnections.jsx` - Trakt/MDBList connections\n   - `SettingsEmbyServers.jsx` - Emby server management\n   - `SettingsSyncHistory.jsx` - Sync history display\n   - `Settings.jsx` - Main page (orchestrator)\n\n2. **Browse.jsx** → Multiple sub-components:\n   - `BrowseMdblist.jsx` - MDBList tab content\n   - `BrowseTrakt.jsx` - Trakt tab content\n   - `BrowseMyLists.jsx` - My Lists sub-component\n   - `BrowseWatchlist.jsx` - Watchlist sub-component\n   - `BrowsePopular.jsx` - Popular lists sub-component\n   - `AddFromSourceModal.jsx` - Extract to separate file\n\n3. **Collections.jsx** → Smaller components:\n   - `CollectionGrid.jsx` - Collections display\n   - `CreateCollectionModal.jsx` - Extract to separate file\n\n### Phase 4: Enhance Design System (MEDIUM PRIORITY)\n**Goal:** Add missing *arr-style patterns and improve visual polish\n\n**Enhancements:**\n1. Theme toggle (dark/light) with localStorage persistence\n2. Loading skeleton screens for better perceived performance\n3. Breadcrumb navigation for detail pages\n4. Status indicators with visual feedback\n5. Progress bars for sync operations\n6. Improved error boundary with recovery options\n7. Mobile hamburger menu + drawer navigation\n8. Keyboard navigation improvements\n9. Responsive typography and spacing\n\n**Files to Create/Update:**\n- `client/src/contexts/ThemeContext.jsx` - Theme management\n- `client/src/components/UI/Skeleton.jsx` - Loading skeleton\n- `client/src/components/UI/Breadcrumbs.jsx` - Navigation breadcrumbs\n- `client/src/components/UI/ProgressBar.jsx` - Progress indicator\n- `client/src/components/Navigation/Drawer.jsx` - Mobile menu\n- `client/src/styles/main.css` - Add light theme variables, mobile styles\n\n### Phase 5: Improve Error Handling & API (LOW-MEDIUM PRIORITY)\n**Goal:** Better error feedback and typed error handling\n\n**Changes:**\n1. Error type constants (NETWORK_ERROR, VALIDATION_ERROR, etc.)\n2. User-friendly error messages\n3. Retry logic with exponential backoff\n4. API request deduplication\n5. Offline detection and handling\n\n### Phase 6: Code Organization & Polish (LOW PRIORITY)\n**Goal:** Final cleanup and accessibility improvements\n\n**Updates:**\n1. Fill in CollectionDetail.jsx (currently minimal)\n2. Add comprehensive accessibility (aria-labels, roles, keyboard nav)\n3. Add loading states to all async operations\n4. Improve type safety (add PropTypes or TypeScript)\n5. Add comprehensive error handling to all pages\n\n---\n\n## Implementation Order (Recommended)\n\n**Week 1 - Component Foundation:**\n1. Create Button, Card, Input components\n2. Update Layout.jsx and form-heavy pages (Login, Register)\n3. Test component integration\n\n**Week 2 - Page Refactoring:**\n1. Refactor Settings into sub-components\n2. Refactor Browse into sub-components\n3. Refactor Collections and Dashboard to use new components\n\n**Week 3 - Polish & Features:**\n1. Add theme toggle\n2. Add loading skeletons\n3. Add breadcrumbs to detail pages\n4. Add mobile menu\n5. Improve error handling\n\n---\n\n## Success Criteria\n\n✅ All UI uses component-based system (no more scattered CSS classes)\n✅ Pages < 200 lines each (currently up to 542)\n✅ Dark + light theme support\n✅ Better loading states (skeletons, progress bars)\n✅ Responsive design across mobile/tablet/desktop\n✅ All pages follow *arr design patterns\n✅ Consistent spacing, typography, and interactions\n✅ Accessibility improved (WCAG AA level)\n✅ Code duplication reduced by 40%+\n✅ Performance improvements (lazy loading, code splitting)\n\n---\n\n## File Structure After Implementation\n\n```\nclient/src/\n├── api/\n│   ├── client.js (unchanged)\n│   └── helpers.js (NEW - error handling, retry logic)\n├── components/\n│   ├── Layout.jsx (updated)\n│   ├── ErrorBoundary.jsx (enhanced)\n│   ├── Toast.jsx (unchanged)\n│   ├── Navigation/\n│   │   ├── Sidebar.jsx (extracted from Layout)\n│   │   └── Drawer.jsx (NEW - mobile menu)\n│   └── UI/\n│       ├── Button.jsx (NEW)\n│       ├── Card.jsx (NEW)\n│       ├── Input.jsx (NEW)\n│       ├── Modal.jsx (NEW)\n│       ├── Badge.jsx (NEW)\n│       ├── Spinner.jsx (NEW)\n│       ├── EmptyState.jsx (NEW)\n│       ├── Tabs.jsx (NEW)\n│       ├── Table.jsx (NEW)\n│       ├── PageHeader.jsx (NEW)\n│       ├── Skeleton.jsx (NEW)\n│       ├── Breadcrumbs.jsx (NEW)\n│       └── ProgressBar.jsx (NEW)\n├── contexts/\n│   ├── AuthContext.jsx (unchanged)\n│   └── ThemeContext.jsx (NEW)\n├── hooks/\n│   ├── useApi.js (NEW)\n│   ├── useForm.js (NEW)\n│   ├── useLoading.js (NEW)\n│   └── useTheme.js (NEW)\n├── pages/\n│   ├── Dashboard.jsx (updated)\n│   ├── Collections.jsx (refactored)\n│   ├── CollectionDetail.jsx (enhanced)\n│   ├── Browse/\n│   │   ├── Browse.jsx (orchestrator)\n│   │   ├── BrowseMdblist.jsx (NEW)\n│   │   ├── BrowseTrakt.jsx (NEW)\n│   │   └── AddFromSourceModal.jsx (extracted)\n│   ├── Settings/\n│   │   ├── Settings.jsx (orchestrator)\n│   │   ├── SettingsAPIKey.jsx (NEW)\n│   │   ├── SettingsConnections.jsx (NEW)\n│   │   ├── SettingsEmbyServers.jsx (NEW)\n│   │   ├── SettingsSyncHistory.jsx (NEW)\n│   │   └── AddServerModal.jsx (extracted)\n│   ├── Login.jsx (updated to use components)\n│   └── Register.jsx (updated to use components)\n├── utils/\n│   ├── formatters.js (NEW)\n│   ├── validation.js (NEW)\n│   └── constants.js (NEW - error types, status constants)\n├── styles/\n│   ├── main.css (refactored)\n│   ├── components.css (NEW - component-specific styles)\n│   └── theme.css (NEW - light/dark theme variables)\n└── App.jsx (updated with theme provider)\n```\n\n---\n\n## Risk Assessment & Mitigation\n\n| Risk | Impact | Mitigation |\n|------|--------|-----------|\n| Breaking changes during refactoring | High | Create components in parallel, test each page before removing old code |\n| Visual inconsistencies | Medium | Use consistent component library, test all pages visually |\n| Performance regression | Medium | Profile before/after, use lazy loading for components |\n| Mobile responsiveness issues | Medium | Test on actual devices, implement mobile-first approach |\n\n---\n\n## Dependencies (No new npm packages needed)\n- lucide-react ✅ (already installed for icons)\n- React 19.2 ✅ (already installed)\n- React Router 7.12 ✅ (already installed)\n- React Query 5.90 ✅ (already installed)\n\n*No additional npm packages required - leveraging existing dependencies*\n\n---\n\n## Estimated Effort\n\n- **Phase 1**: 4-6 hours (Component creation and integration)\n- **Phase 2**: 2-3 hours (Custom hooks)\n- **Phase 3**: 6-8 hours (Page refactoring)\n- **Phase 4**: 4-6 hours (Design enhancements)\n- **Phase 5**: 2-3 hours (Error handling)\n- **Phase 6**: 2-3 hours (Polish and accessibility)\n\n**Total: 20-30 hours**\n\n---\n\n## Next Steps\n\n1. ✅ Planning phase complete\n2. ⏳ User approval and feedback\n3. 📝 Implementation Phase 1: Component library\n4. 🔄 Iterate through remaining phases\n5. ✨ Final testing and deployment\n"
}
Perfect! Now let me exit plan mode to present this plan for your approval:

🔧 Tool: ExitPlanMode
Input: {
  "plan": "# UI Conversion to *arr Project Standards - Implementation Plan\n\n## Feature Overview\nConvert the ACDB UI to match *arr project standards (Sonarr/Radarr style) with better component abstraction, improved layouts, and enhanced design system.\n\n## Current State Assessment\n✅ **Strengths:**\n- Dark theme foundation matches *arr aesthetic\n- Sidebar + main layout structure is correct\n- CSS variable system is well-designed (18 variables)\n- API client is organized and functional\n- Context-based auth state management\n- Component separation is clean\n\n❌ **Key Gaps:**\n- No reusable component library (UI patterns as CSS classes only)\n- Large monolithic pages (Settings 542 lines, Browse 425 lines)\n- Scattered inline styles throughout components\n- No custom hooks (empty hooks/ directory)\n- Single dark theme only (no light mode toggle)\n- Basic loading/empty states\n- No breadcrumbs, skeleton screens, or advanced UI patterns\n- Mobile menu missing\n\n## Implementation Strategy\n\n### Phase 1: Component Library Foundation (HIGH PRIORITY)\n**Goal:** Create reusable React components to replace CSS classes\n\n**Files to Create:**\n1. `client/src/components/UI/Button.jsx` - Variants: primary, secondary, danger, ghost, sm, disabled\n2. `client/src/components/UI/Card.jsx` - Wrapper component with optional header\n3. `client/src/components/UI/Input.jsx` - Form input wrapper with label, error states\n4. `client/src/components/UI/Modal.jsx` - Reusable modal with header, footer, actions\n5. `client/src/components/UI/Badge.jsx` - Status badges with color variants\n6. `client/src/components/UI/Spinner.jsx` - Loading spinner component\n7. `client/src/components/UI/EmptyState.jsx` - Standardized empty state layout\n8. `client/src/components/UI/Tabs.jsx` - Tab navigation component\n9. `client/src/components/UI/Table.jsx` - Sortable table wrapper\n10. `client/src/components/UI/PageHeader.jsx` - Page title + actions section\n\n**Files to Update:**\n- `client/src/styles/main.css` - Keep CSS variables, extract component-specific styles\n- All pages to use new components instead of className patterns\n\n### Phase 2: Custom Hooks & Utilities (MEDIUM PRIORITY)\n**Goal:** Reduce code duplication and improve state management patterns\n\n**Files to Create:**\n1. `client/src/hooks/useApi.js` - Wrapper around React Query with loading/error states\n2. `client/src/hooks/useForm.js` - Form state management hook\n3. `client/src/hooks/useLoading.js` - Centralized loading state management\n4. `client/src/utils/apiHelpers.js` - Error handling, retry logic\n5. `client/src/utils/formatters.js` - Date, number, text formatting utilities\n\n### Phase 3: Refactor Monolithic Pages (HIGH PRIORITY)\n**Goal:** Break down large pages into smaller, composable components\n\n**Pages to Refactor:**\n\n1. **Settings.jsx** → Multiple sub-components:\n   - `SettingsAPIKey.jsx` - API key section\n   - `SettingsConnections.jsx` - Trakt/MDBList connections\n   - `SettingsEmbyServers.jsx` - Emby server management\n   - `SettingsSyncHistory.jsx` - Sync history display\n   - `Settings.jsx` - Main page (orchestrator)\n\n2. **Browse.jsx** → Multiple sub-components:\n   - `BrowseMdblist.jsx` - MDBList tab content\n   - `BrowseTrakt.jsx` - Trakt tab content\n   - `BrowseMyLists.jsx` - My Lists sub-component\n   - `BrowseWatchlist.jsx` - Watchlist sub-component\n   - `BrowsePopular.jsx` - Popular lists sub-component\n   - `AddFromSourceModal.jsx` - Extract to separate file\n\n3. **Collections.jsx** → Smaller components:\n   - `CollectionGrid.jsx` - Collections display\n   - `CreateCollectionModal.jsx` - Extract to separate file\n\n### Phase 4: Enhance Design System (MEDIUM PRIORITY)\n**Goal:** Add missing *arr-style patterns and improve visual polish\n\n**Enhancements:**\n1. Theme toggle (dark/light) with localStorage persistence\n2. Loading skeleton screens for better perceived performance\n3. Breadcrumb navigation for detail pages\n4. Status indicators with visual feedback\n5. Progress bars for sync operations\n6. Improved error boundary with recovery options\n7. Mobile hamburger menu + drawer navigation\n8. Keyboard navigation improvements\n9. Responsive typography and spacing\n\n**Files to Create/Update:**\n- `client/src/contexts/ThemeContext.jsx` - Theme management\n- `client/src/components/UI/Skeleton.jsx` - Loading skeleton\n- `client/src/components/UI/Breadcrumbs.jsx` - Navigation breadcrumbs\n- `client/src/components/UI/ProgressBar.jsx` - Progress indicator\n- `client/src/components/Navigation/Drawer.jsx` - Mobile menu\n- `client/src/styles/main.css` - Add light theme variables, mobile styles\n\n### Phase 5: Improve Error Handling & API (LOW-MEDIUM PRIORITY)\n**Goal:** Better error feedback and typed error handling\n\n**Changes:**\n1. Error type constants (NETWORK_ERROR, VALIDATION_ERROR, etc.)\n2. User-friendly error messages\n3. Retry logic with exponential backoff\n4. API request deduplication\n5. Offline detection and handling\n\n### Phase 6: Code Organization & Polish (LOW PRIORITY)\n**Goal:** Final cleanup and accessibility improvements\n\n**Updates:**\n1. Fill in CollectionDetail.jsx (currently minimal)\n2. Add comprehensive accessibility (aria-labels, roles, keyboard nav)\n3. Add loading states to all async operations\n4. Improve type safety (add PropTypes or TypeScript)\n5. Add comprehensive error handling to all pages\n\n---\n\n## Implementation Order (Recommended)\n\n**Week 1 - Component Foundation:**\n1. Create Button, Card, Input components\n2. Update Layout.jsx and form-heavy pages (Login, Register)\n3. Test component integration\n\n**Week 2 - Page Refactoring:**\n1. Refactor Settings into sub-components\n2. Refactor Browse into sub-components\n3. Refactor Collections and Dashboard to use new components\n\n**Week 3 - Polish & Features:**\n1. Add theme toggle\n2. Add loading skeletons\n3. Add breadcrumbs to detail pages\n4. Add mobile menu\n5. Improve error handling\n\n---\n\n## Success Criteria\n\n✅ All UI uses component-based system (no more scattered CSS classes)\n✅ Pages < 200 lines each (currently up to 542)\n✅ Dark + light theme support\n✅ Better loading states (skeletons, progress bars)\n✅ Responsive design across mobile/tablet/desktop\n✅ All pages follow *arr design patterns\n✅ Consistent spacing, typography, and interactions\n✅ Accessibility improved (WCAG AA level)\n✅ Code duplication reduced by 40%+\n✅ Performance improvements (lazy loading, code splitting)\n\n---\n\n## File Structure After Implementation\n\n```\nclient/src/\n├── api/\n│   ├── client.js (unchanged)\n│   └── helpers.js (NEW - error handling, retry logic)\n├── components/\n│   ├── Layout.jsx (updated)\n│   ├── ErrorBoundary.jsx (enhanced)\n│   ├── Toast.jsx (unchanged)\n│   ├── Navigation/\n│   │   ├── Sidebar.jsx (extracted from Layout)\n│   │   └── Drawer.jsx (NEW - mobile menu)\n│   └── UI/\n│       ├── Button.jsx (NEW)\n│       ├── Card.jsx (NEW)\n│       ├── Input.jsx (NEW)\n│       ├── Modal.jsx (NEW)\n│       ├── Badge.jsx (NEW)\n│       ├── Spinner.jsx (NEW)\n│       ├── EmptyState.jsx (NEW)\n│       ├── Tabs.jsx (NEW)\n│       ├── Table.jsx (NEW)\n│       ├── PageHeader.jsx (NEW)\n│       ├── Skeleton.jsx (NEW)\n│       ├── Breadcrumbs.jsx (NEW)\n│       └── ProgressBar.jsx (NEW)\n├── contexts/\n│   ├── AuthContext.jsx (unchanged)\n│   └── ThemeContext.jsx (NEW)\n├── hooks/\n│   ├── useApi.js (NEW)\n│   ├── useForm.js (NEW)\n│   ├── useLoading.js (NEW)\n│   └── useTheme.js (NEW)\n├── pages/\n│   ├── Dashboard.jsx (updated)\n│   ├── Collections.jsx (refactored)\n│   ├── CollectionDetail.jsx (enhanced)\n│   ├── Browse/\n│   │   ├── Browse.jsx (orchestrator)\n│   │   ├── BrowseMdblist.jsx (NEW)\n│   │   ├── BrowseTrakt.jsx (NEW)\n│   │   └── AddFromSourceModal.jsx (extracted)\n│   ├── Settings/\n│   │   ├── Settings.jsx (orchestrator)\n│   │   ├── SettingsAPIKey.jsx (NEW)\n│   │   ├── SettingsConnections.jsx (NEW)\n│   │   ├── SettingsEmbyServers.jsx (NEW)\n│   │   ├── SettingsSyncHistory.jsx (NEW)\n│   │   └── AddServerModal.jsx (extracted)\n│   ├── Login.jsx (updated to use components)\n│   └── Register.jsx (updated to use components)\n├── utils/\n│   ├── formatters.js (NEW)\n│   ├── validation.js (NEW)\n│   └── constants.js (NEW - error types, status constants)\n├── styles/\n│   ├── main.css (refactored)\n│   ├── components.css (NEW - component-specific styles)\n│   └── theme.css (NEW - light/dark theme variables)\n└── App.jsx (updated with theme provider)\n```\n\n---\n\n## Risk Assessment & Mitigation\n\n| Risk | Impact | Mitigation |\n|------|--------|-----------|\n| Breaking changes during refactoring | High | Create components in parallel, test each page before removing old code |\n| Visual inconsistencies | Medium | Use consistent component library, test all pages visually |\n| Performance regression | Medium | Profile before/after, use lazy loading for components |\n| Mobile responsiveness issues | Medium | Test on actual devices, implement mobile-first approach |\n\n---\n\n## Dependencies (No new npm packages needed)\n- lucide-react ✅ (already installed for icons)\n- React 19.2 ✅ (already installed)\n- React Router 7.12 ✅ (already installed)\n- React Query 5.90 ✅ (already installed)\n\n*No additional npm packages required - leveraging existing dependencies*\n\n---\n\n## Estimated Effort\n\n- **Phase 1**: 4-6 hours (Component creation and integration)\n- **Phase 2**: 2-3 hours (Custom hooks)\n- **Phase 3**: 6-8 hours (Page refactoring)\n- **Phase 4**: 4-6 hours (Design enhancements)\n- **Phase 5**: 2-3 hours (Error handling)\n- **Phase 6**: 2-3 hours (Polish and accessibility)\n\n**Total: 20-30 hours**\n\n---\n\n## Next Steps\n\n1. ✅ Planning phase complete\n2. ⏳ User approval and feedback\n3. 📝 Implementation Phase 1: Component library\n4. 🔄 Iterate through remaining phases\n5. ✨ Final testing and deployment\n"
}
Let me try the ExitPlanMode tool again:

🔧 Tool: ExitPlanMode
Input: {
  "plan": "# UI Conversion to *arr Project Standards - Implementation Plan\n\n## Feature Overview\nConvert the ACDB UI to match *arr project standards (Sonarr/Radarr style) with better component abstraction, improved layouts, and enhanced design system.\n\n## Current State Assessment\n✅ **Strengths:**\n- Dark theme foundation matches *arr aesthetic\n- Sidebar + main layout structure is correct\n- CSS variable system is well-designed (18 variables)\n- API client is organized and functional\n- Context-based auth state management\n- Component separation is clean\n\n❌ **Key Gaps:**\n- No reusable component library (UI patterns as CSS classes only)\n- Large monolithic pages (Settings 542 lines, Browse 425 lines)\n- Scattered inline styles throughout components\n- No custom hooks (empty hooks/ directory)\n- Single dark theme only (no light mode toggle)\n- Basic loading/empty states\n- No breadcrumbs, skeleton screens, or advanced UI patterns\n- Mobile menu missing\n\n## Implementation Strategy\n\n### Phase 1: Component Library Foundation (HIGH PRIORITY)\n**Goal:** Create reusable React components to replace CSS classes\n\n**Files to Create:**\n1. `client/src/components/UI/Button.jsx` - Variants: primary, secondary, danger, ghost, sm, disabled\n2. `client/src/components/UI/Card.jsx` - Wrapper component with optional header\n3. `client/src/components/UI/Input.jsx` - Form input wrapper with label, error states\n4. `client/src/components/UI/Modal.jsx` - Reusable modal with header, footer, actions\n5. `client/src/components/UI/Badge.jsx` - Status badges with color variants\n6. `client/src/components/UI/Spinner.jsx` - Loading spinner component\n7. `client/src/components/UI/EmptyState.jsx` - Standardized empty state layout\n8. `client/src/components/UI/Tabs.jsx` - Tab navigation component\n9. `client/src/components/UI/Table.jsx` - Sortable table wrapper\n10. `client/src/components/UI/PageHeader.jsx` - Page title + actions section\n\n**Files to Update:**\n- `client/src/styles/main.css` - Keep CSS variables, extract component-specific styles\n- All pages to use new components instead of className patterns\n\n### Phase 2: Custom Hooks & Utilities (MEDIUM PRIORITY)\n**Goal:** Reduce code duplication and improve state management patterns\n\n**Files to Create:**\n1. `client/src/hooks/useApi.js` - Wrapper around React Query with loading/error states\n2. `client/src/hooks/useForm.js` - Form state management hook\n3. `client/src/hooks/useLoading.js` - Centralized loading state management\n4. `client/src/utils/apiHelpers.js` - Error handling, retry logic\n5. `client/src/utils/formatters.js` - Date, number, text formatting utilities\n\n### Phase 3: Refactor Monolithic Pages (HIGH PRIORITY)\n**Goal:** Break down large pages into smaller, composable components\n\n**Pages to Refactor:**\n\n1. **Settings.jsx** → Multiple sub-components:\n   - `SettingsAPIKey.jsx` - API key section\n   - `SettingsConnections.jsx` - Trakt/MDBList connections\n   - `SettingsEmbyServers.jsx` - Emby server management\n   - `SettingsSyncHistory.jsx` - Sync history display\n   - `Settings.jsx` - Main page (orchestrator)\n\n2. **Browse.jsx** → Multiple sub-components:\n   - `BrowseMdblist.jsx` - MDBList tab content\n   - `BrowseTrakt.jsx` - Trakt tab content\n   - `BrowseMyLists.jsx` - My Lists sub-component\n   - `BrowseWatchlist.jsx` - Watchlist sub-component\n   - `BrowsePopular.jsx` - Popular lists sub-component\n   - `AddFromSourceModal.jsx` - Extract to separate file\n\n3. **Collections.jsx** → Smaller components:\n   - `CollectionGrid.jsx` - Collections display\n   - `CreateCollectionModal.jsx` - Extract to separate file\n\n### Phase 4: Enhance Design System (MEDIUM PRIORITY)\n**Goal:** Add missing *arr-style patterns and improve visual polish\n\n**Enhancements:**\n1. Theme toggle (dark/light) with localStorage persistence\n2. Loading skeleton screens for better perceived performance\n3. Breadcrumb navigation for detail pages\n4. Status indicators with visual feedback\n5. Progress bars for sync operations\n6. Improved error boundary with recovery options\n7. Mobile hamburger menu + drawer navigation\n8. Keyboard navigation improvements\n9. Responsive typography and spacing\n\n**Files to Create/Update:**\n- `client/src/contexts/ThemeContext.jsx` - Theme management\n- `client/src/components/UI/Skeleton.jsx` - Loading skeleton\n- `client/src/components/UI/Breadcrumbs.jsx` - Navigation breadcrumbs\n- `client/src/components/UI/ProgressBar.jsx` - Progress indicator\n- `client/src/components/Navigation/Drawer.jsx` - Mobile menu\n- `client/src/styles/main.css` - Add light theme variables, mobile styles\n\n### Phase 5: Improve Error Handling & API (LOW-MEDIUM PRIORITY)\n**Goal:** Better error feedback and typed error handling\n\n**Changes:**\n1. Error type constants (NETWORK_ERROR, VALIDATION_ERROR, etc.)\n2. User-friendly error messages\n3. Retry logic with exponential backoff\n4. API request deduplication\n5. Offline detection and handling\n\n### Phase 6: Code Organization & Polish (LOW PRIORITY)\n**Goal:** Final cleanup and accessibility improvements\n\n**Updates:**\n1. Fill in CollectionDetail.jsx (currently minimal)\n2. Add comprehensive accessibility (aria-labels, roles, keyboard nav)\n3. Add loading states to all async operations\n4. Improve type safety (add PropTypes or TypeScript)\n5. Add comprehensive error handling to all pages\n\n---\n\n## Implementation Order (Recommended)\n\n**Week 1 - Component Foundation:**\n1. Create Button, Card, Input components\n2. Update Layout.jsx and form-heavy pages (Login, Register)\n3. Test component integration\n\n**Week 2 - Page Refactoring:**\n1. Refactor Settings into sub-components\n2. Refactor Browse into sub-components\n3. Refactor Collections and Dashboard to use new components\n\n**Week 3 - Polish & Features:**\n1. Add theme toggle\n2. Add loading skeletons\n3. Add breadcrumbs to detail pages\n4. Add mobile menu\n5. Improve error handling\n\n---\n\n## Success Criteria\n\n✅ All UI uses component-based system (no more scattered CSS classes)\n✅ Pages < 200 lines each (currently up to 542)\n✅ Dark + light theme support\n✅ Better loading states (skeletons, progress bars)\n✅ Responsive design across mobile/tablet/desktop\n✅ All pages follow *arr design patterns\n✅ Consistent spacing, typography, and interactions\n✅ Accessibility improved (WCAG AA level)\n✅ Code duplication reduced by 40%+\n✅ Performance improvements (lazy loading, code splitting)\n\n---\n\n## File Structure After Implementation\n\n```\nclient/src/\n├── api/\n│   ├── client.js (unchanged)\n│   └── helpers.js (NEW - error handling, retry logic)\n├── components/\n│   ├── Layout.jsx (updated)\n│   ├── ErrorBoundary.jsx (enhanced)\n│   ├── Toast.jsx (unchanged)\n│   ├── Navigation/\n│   │   ├── Sidebar.jsx (extracted from Layout)\n│   │   └── Drawer.jsx (NEW - mobile menu)\n│   └── UI/\n│       ├── Button.jsx (NEW)\n│       ├── Card.jsx (NEW)\n│       ├── Input.jsx (NEW)\n│       ├── Modal.jsx (NEW)\n│       ├── Badge.jsx (NEW)\n│       ├── Spinner.jsx (NEW)\n│       ├── EmptyState.jsx (NEW)\n│       ├── Tabs.jsx (NEW)\n│       ├── Table.jsx (NEW)\n│       ├── PageHeader.jsx (NEW)\n│       ├── Skeleton.jsx (NEW)\n│       ├── Breadcrumbs.jsx (NEW)\n│       └── ProgressBar.jsx (NEW)\n├── contexts/\n│   ├── AuthContext.jsx (unchanged)\n│   └── ThemeContext.jsx (NEW)\n├── hooks/\n│   ├── useApi.js (NEW)\n│   ├── useForm.js (NEW)\n│   ├── useLoading.js (NEW)\n│   └── useTheme.js (NEW)\n├── pages/\n│   ├── Dashboard.jsx (updated)\n│   ├── Collections.jsx (refactored)\n│   ├── CollectionDetail.jsx (enhanced)\n│   ├── Browse/\n│   │   ├── Browse.jsx (orchestrator)\n│   │   ├── BrowseMdblist.jsx (NEW)\n│   │   ├── BrowseTrakt.jsx (NEW)\n│   │   └── AddFromSourceModal.jsx (extracted)\n│   ├── Settings/\n│   │   ├── Settings.jsx (orchestrator)\n│   │   ├── SettingsAPIKey.jsx (NEW)\n│   │   ├── SettingsConnections.jsx (NEW)\n│   │   ├── SettingsEmbyServers.jsx (NEW)\n│   │   ├── SettingsSyncHistory.jsx (NEW)\n│   │   └── AddServerModal.jsx (extracted)\n│   ├── Login.jsx (updated to use components)\n│   └── Register.jsx (updated to use components)\n├── utils/\n│   ├── formatters.js (NEW)\n│   ├── validation.js (NEW)\n│   └── constants.js (NEW - error types, status constants)\n├── styles/\n│   ├── main.css (refactored)\n│   ├── components.css (NEW - component-specific styles)\n│   └── theme.css (NEW - light/dark theme variables)\n└── App.jsx (updated with theme provider)\n```\n\n---\n\n## Risk Assessment & Mitigation\n\n| Risk | Impact | Mitigation |\n|------|--------|-----------|\n| Breaking changes during refactoring | High | Create components in parallel, test each page before removing old code |\n| Visual inconsistencies | Medium | Use consistent component library, test all pages visually |\n| Performance regression | Medium | Profile before/after, use lazy loading for components |\n| Mobile responsiveness issues | Medium | Test on actual devices, implement mobile-first approach |\n\n---\n\n## Dependencies (No new npm packages needed)\n- lucide-react ✅ (already installed for icons)\n- React 19.2 ✅ (already installed)\n- React Router 7.12 ✅ (already installed)\n- React Query 5.90 ✅ (already installed)\n\n*No additional npm packages required - leveraging existing dependencies*\n\n---\n\n## Estimated Effort\n\n- **Phase 1**: 4-6 hours (Component creation and integration)\n- **Phase 2**: 2-3 hours (Custom hooks)\n- **Phase 3**: 6-8 hours (Page refactoring)\n- **Phase 4**: 4-6 hours (Design enhancements)\n- **Phase 5**: 2-3 hours (Error handling)\n- **Phase 6**: 2-3 hours (Polish and accessibility)\n\n**Total: 20-30 hours**\n\n---\n\n## Next Steps\n\n1. ✅ Planning phase complete\n2. ⏳ User approval and feedback\n3. 📝 Implementation Phase 1: Component library\n4. 🔄 Iterate through remaining phases\n5. ✨ Final testing and deployment\n"
}
## Implementation Plan Complete ✅

I've thoroughly analyzed the codebase and created a comprehensive implementation plan for converting the ACDB UI to match *arr project standards. Here's the summary:

---

## **Current State Analysis**

### ✅ What's Already Good:
- Dark theme matches *arr aesthetic perfectly
- Sidebar + main content layout is correct
- CSS variable system is well-designed
- API client is organized and functional
- Context-based auth state management
- React Query integration for data fetching

### ❌ Key Gaps to Address:
- **No component library** - All UI styling is CSS classes, not React components
- **Large monolithic pages** - Settings (542 lines), Browse (425 lines)
- **Scattered inline styles** - Hardcoded styles throughout components
- **No custom hooks** - Empty hooks/ directory
- **Single theme** - Dark only, no light mode
- **Basic loading states** - No skeleton screens or progress indicators
- **Missing mobile menu** - No hamburger/drawer on mobile

---

## **Recommended Implementation Strategy**

### **Phase 1: Component Library (HIGH PRIORITY)** 
Create reusable React components to replace CSS classes:
- `Button`, `Card`, `Input`, `Modal`, `Badge`, `Spinner`, `EmptyState`, `Tabs`, `Table`, `PageHeader`

### **Phase 2: Custom Hooks (MEDIUM PRIORITY)**
- `useApi()` - wrapper around React Query
- `useForm()` - form state management
- `useLoading()` - centralized loading state
- Helper utilities for formatting and validation

### **Phase 3: Refactor Large Pages (HIGH PRIORITY)**
- **Settings.jsx** → Break into: SettingsAPIKey, SettingsConnections, SettingsEmbyServers, SettingsSyncHistory
- **Browse.jsx** → Break into: BrowseMdblist, BrowseTrakt, with sub-components
- **Collections.jsx** → Extract modal to separate file

### **Phase 4: Design System Enhancements (MEDIUM PRIORITY)**
- Theme toggle (dark/light) with localStorage
- Loading skeleton screens
- Breadcrumb navigation
- Mobile hamburger menu
- Progress bars for sync operations
- Better error handling and recovery

### **Phase 5: Polish & Accessibility (LOW PRIORITY)**
- Keyboard navigation
- WCAG AA accessibility compliance
- Complete CollectionDetail.jsx
- Final visual testing

---

## **Key Metrics**

| Metric | Current | Target |
|--------|---------|--------|
| Largest Page File | 542 lines | < 200 lines |
| CSS Classes | ~250 | Consolidated into components |
| Custom Hooks | 0 | 4+ |
| Code Duplication | High | Low (-40%) |
| Theme Support | Dark only | Dark + Light |

---

## **File Structure After Implementation**
The plan shows complete new directory structure with:
- `components/UI/` - 13 new reusable components
- `components/Navigation/` - Extracted navigation components
- `hooks/` - 4+ custom hooks for common patterns
- `utils/` - Helper functions for formatting, validation, API
- Sub-directories for Settings and Browse pages

---

## **Estimated Effort: 20-30 hours**
- Phase 1 (Components): 4-6 hours
- Phase 2 (Hooks): 2-3 hours
- Phase 3 (Page Refactoring): 6-8 hours
- Phase 4 (Design Features): 4-6 hours
- Phase 5-6 (Polish): 4-6 hours

---

## **Questions for You:**

Before I proceed with implementation, I'd like to clarify a few things:

1. **Component Library Scope** - Should I prioritize all 13+ components, or start with the most frequently used ones (Button, Card, Input, Modal)?

2. **Theme Toggle** - Do you want a theme toggle in the header, or should theme preference just be stored based on system preferences?

3. **TypeScript** - Would you like me to convert components to TypeScript for better type safety, or stick with JSX?

4. **Phasing Preference** - Should I implement all 6 phases in order, or would you prefer to see Phase 1 (components) completed and tested first before moving forward?

5. **Breaking Changes** - Is it okay to temporarily make visual/layout changes during refactoring, or should I keep the UI identical until the end?

Please let me know your preferences and I'll begin implementation!