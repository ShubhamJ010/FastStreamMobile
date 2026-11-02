# Changelog

All notable changes to **FastStreamMobile** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this fork maintains mobile-only scope (see `AGENTS.md`).

## [Unreleased]

### Added
- **Floating mobile control bar** — a minimal, touch-friendly control bar that replaces
  the desktop bottom controls on mobile. It shows elapsed time (left), a combined
  progress + seek track (center), and remaining time (right), styled as a translucent,
  blurred squircle that follows the existing `controls_visible` visibility pattern.
  - Markup added to `chrome/player/index.html` (`fluid_mobile_control_bar`).
  - Element references added to `chrome/player/ui/DOMElements.mjs`
    (`mobileControlBar`, `mobileTimeElapsed`, `mobileSeek`, `mobileSeekLoaded`,
    `mobileSeekCurrent`, `mobileTimeRemaining`).
  - Styles added to `chrome/player/assets/fluidplayer/css/mobile.css`, including
    hiding the desktop `.fluid_controls_bottom_container` /
    `.fluid_controls_progress_container` on `.fluid_player_mobile`.
- **Mobile seek gestures** (`setupMobileControlBar`) — drag anywhere on the seek track
  to scrub. Improvements for robustness on touch:
  - Pointer capture (`setPointerCapture`) so move/up events are delivered even if the
    finger leaves the thin track.
  - `pointerup` / `pointercancel` listeners on `window` so `mobileSeeking` can never get
    stuck (a stuck flag would freeze the seek bar).
  - A final position sync from the real playback time on release as a safety net against
    dropped events.
- **`isUserSeeking()`** now also reports the mobile seek state (`this.mobileSeeking`),
  so other UI logic correctly treats an in-progress mobile scrub as a seek.
- **Touch gestures on the video background** (`setupMobileGestures`):
  - **Single tap** toggles the control bar (deferred 300 ms so it can be upgraded to a
    double tap).
  - **Double tap** toggles fullscreen and cancels the pending single-tap toggle.
  - **Hold (long-press)** plays at 2× speed and restores the previous rate (and pauses if
    it was paused) on release; movement/drag cancels the hold.
  - **2× feedback banner** (`fluid_mobile_2x_banner`) — a "2x" pill that fades in at the
    top-center, just above the centered play/pause button, while the hold-to-2× gesture is
    active, giving clear visual confirmation of the speed-up.
  - Taps on actual controls are ignored so they keep their own behavior, and the desktop
    single-click play/pause action is suppressed via `stopPropagation`.
- **Mobile-aware auto-hide** — on mobile the controls auto-hide after a short idle while
  playing (`queueControlsHide(3000)`), re-armed whenever the control bar is shown or
  playback starts, and kept visible while paused. The big center play button no longer
  blocks auto-hide on mobile (it doubles as the center button).

### Changed
- Seek bar retinted to a **YouTube-style** look on mobile: a solid white buffered/loaded
  layer underneath and a solid red played layer on top, for clear visual distinction.
- Desktop mouse hold-to-2×-speed is now guarded by `!EnvUtils.isMobile()` so it no longer
  runs on mobile (mobile uses the pointer-based gesture instead).

### Fixed
- Mobile **hold-to-2× did not engage**: a long-press on touch triggers the browser's native
  context menu / text selection, which fires `pointercancel` and aborts the 500 ms hold timer
  before 2× could apply. Suppressing `contextmenu` on the player container keeps the hold
  gesture alive, and the new 2× banner confirms it visually.
- Mobile seek bar could freeze when a `pointerup` was dropped (e.g. finger lifted off the
  thin track); pointer capture + window-level `pointerup`/`pointercancel` handling keeps
  `mobileSeeking` consistent.

### Removed
- Redundant no-op `queueControlsHide(3000)` call at the end of `setupMobileGestures()`
  (it ran during construction while paused, doing nothing, and is already covered by the
  mobile auto-hide wired into `updatePlayPauseButton()`).

## [0.0.1] - Initial fork version
- Reset fork versioning to `0.0.1` and publish prereleases (see `274516d`).
