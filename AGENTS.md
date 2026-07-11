# FastStreamMobile Agent Instructions

## Project Context
**FastStreamMobile** is a specialized fork of [FastStream](https://github.com/Andrews54757/FastStream). While the upstream project focuses on desktop browsers (Chrome/Firefox) and has no immediate plans for mobile support, this fork exists to bridge that gap.

> **Scope Note:** All commits made in this fork are **mobile-only** in scope and should be evaluated with **mobile-only** considerations. Desktop behavior, desktop-specific diffs, and upstream desktop parity are explicitly out of scope — changes are not required to preserve or mirror the desktop experience.

## Strategic Mandates

### 1. Upstream Alignment
- **Zero-Conflict Synchronization:** The primary goal is to remain 100% synchronizable with the upstream repository. 
- **Preservation of Core Logic:** Do not modify core playback or network logic unless absolutely necessary for mobile functionality. If modifications are required, they must be implemented via hooks or conditional logic that does not interfere with desktop behavior.

### 2. Mobile-First Enhancements
- **Target Platform:** Fennec (Firefox for Android) and other mobile browsers.
- **UI/UX:** Enhancements must focus on touch-friendliness, screen real estate optimization, and mobile-specific interactions.

### 3. Open/Closed Principle
- **Open for Extension:** Add new modules, UI components, or configuration flags to support mobile features.
- **Closed for Modification:** Avoid refactoring upstream code. If a change is needed in an upstream file, use a "surgical" approach to minimize the diff and reduce merge conflicts.

### 4. Backward Compatibility
- All code must be backward compatible with the original FastStream features.
- Ensure that enhancements do not break the "desktop" experience, as this maintains the integrity of the fork's ability to sync.

## Engineering Standards

- **Code Style:** Adhere strictly to the existing JavaScript/ESM style of the project (see `.eslintrc.js`).
- **Surgical Edits:** When modifying upstream files, use the minimal amount of code possible. Prefer wrapping existing functions or adding early returns based on environment detection.
- **Environment Detection:** Use robust methods (e.g., `navigator.userAgent`) to apply mobile-specific logic only when appropriate.
- **Feature Isolation:** Keep mobile-only features in separate files or directories (like a `mobile/` or `custom/` folder) whenever possible.

## Task-Specific Guidance for Gemini CLI
- **Research Phase:** Always check if a file is an "upstream" file before editing. Upstream files are those present in the original repository.
- **Implementation:** Favor "Extension" over "Modification". If you need to change a UI element, consider if it can be done via CSS overrides or a wrapper component instead of editing the core HTML/JS.
- **Validation:** When adding UI changes, simulate mobile viewports during testing if possible.
- **Clean Build & Update Procedure for Firefox:**
    If you need to rebuild and update the Firefox XPI in `Downloads`:
    ```bash
    rm -rf built/ && npm run build && rm -f /Users/sj/Downloads/faststream-mobile.xpi && cp built/firefox-libre-faststream_video_player-0.0.1.zip /Users/sj/Downloads/faststream-mobile.xpi
    ```

