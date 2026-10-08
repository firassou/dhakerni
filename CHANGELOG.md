# Changelog

All notable changes to this project are documented here. Format: Keep a Changelog; versions: SemVer.

## [0.2.0] - 2026-10-08

### Added

- Task list with filters (Today, Upcoming, Needs time, All, Done); overdue tasks surface under Today.
- Quick add from the dock; new tasks start in "Needs time" until the parser arrives.
- Task cards with animated completion, live editor sheet (title, due, priority, list, notes), delete.
- Undo toasts for add, complete and delete; optimistic updates persisted to IndexedDB.
- Drag and keyboard reorder that keeps hidden tasks in place.
- 24-hour times in Arabic and French.

## [0.1.0] - 2026-10-08

### Added

- Next.js 16 app shell, design tokens (light/dark), Readex Pro for Arabic and Latin.
- Arabic (ar-TN), French and English with system detection, manual override and full RTL.
- IndexedDB schema (tasks, profile, meta), Zod schemas, anonymous session id.
- Installable PWA manifest, icons and offline app shell.
- Settings screen with language picker and privacy summary.
- Docs: design notes, decisions. Vitest and Playwright set up.
