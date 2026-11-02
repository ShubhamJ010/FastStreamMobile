import {MessageTypes} from '../enums/MessageTypes.mjs';
import {PlayerModes} from '../enums/PlayerModes.mjs';
import {Coloris} from '../modules/coloris.mjs';
import {Localize} from '../modules/Localize.mjs';
import {ClickActions} from '../options/defaults/ClickActions.mjs';
import {MiniplayerPositions} from '../options/defaults/MiniplayerPositions.mjs';
import {VisChangeActions} from '../options/defaults/VisChangeActions.mjs';
import {EnvUtils} from '../utils/EnvUtils.mjs';
import {InterfaceUtils} from '../utils/InterfaceUtils.mjs';
import {StringUtils} from '../utils/StringUtils.mjs';
import {URLUtils} from '../utils/URLUtils.mjs';
import {Utils} from '../utils/Utils.mjs';
import {WebUtils} from '../utils/WebUtils.mjs';
import {DOMElements} from './DOMElements.mjs';
import {FineTimeControls} from './FineTimeControls.mjs';
import {AudioQualityChanger} from './menus/AudioQualityChanger.mjs';
import {LanguageChanger} from './menus/LanguageChanger.mjs';
import {LoopMenu} from './menus/LoopMenu.mjs';
import {PlaybackRateChanger} from './menus/PlaybackRateChanger.mjs';
import {VideoQualityChanger} from './menus/VideoQualityChanger.mjs';
import {OptionsWindow} from './OptionsWindow.mjs';
import {ProgressBar} from './ProgressBar.mjs';
import {SaveManager} from './SaveManager.mjs';
import {StatusManager, StatusTypes} from './StatusManager.mjs';
import {SubtitlesManager} from './subtitles/SubtitlesManager.mjs';
import {ToolManager} from './ToolManager.mjs';
import {VolumeControls} from './VolumeControls.mjs';

let MiniplayerCooldown = Date.now() + 500;
export class InterfaceController {
  constructor(client) {
    this.client = client;
    this.state = client.state;
    this.hidden = false;
    this.lastTime = 0;
    this.lastSpeed = 0;
    this.mouseOverControls = false;
    this.controlsVisible = true;
    this.mouseActivityCooldown = 0;

    this.failed = false;

    this.toolManager = new ToolManager(this.client, this);

    this.toolManager.setupUI();

    this.fineTimeControls = new FineTimeControls(this.client);

    this.subtitlesManager = new SubtitlesManager(this.client);

    this.playbackRateChanger = new PlaybackRateChanger(this.client);
    this.playbackRateChanger.on('rateChanged', (rate) => {
      this.client.playbackRate = rate;
    });
    this.playbackRateChanger.setupUI();

    this.videoQualityChanger = new VideoQualityChanger();
    this.videoQualityChanger.setupUI();
    this.videoQualityChanger.on('qualityChanged', (level, savePriority) => {
      if (savePriority) {
        const mimeType = (level.mimeType || '').split('/');
        if (mimeType.length > 1) {
          this.client.getLevelManager().setPrioritizedVideoContainer(mimeType[1]);
        }

        if (level.videoCodec) {
          this.client.getLevelManager().setPrioritizedVideoCodec(level.videoCodec);
        }
      }
      this.client.setCurrentVideoLevelID(level.id);
    });

    this.audioQualityChanger = new AudioQualityChanger();
    this.audioQualityChanger.setupUI();
    this.audioQualityChanger.on('qualityChanged', (level) => {
      const mimeType = (level.mimeType || '').split('/');
      if (mimeType.length > 1) {
        this.client.getLevelManager().setPrioritizedAudioContainer(mimeType[1]);
      }

      if (level.audioCodec) {
        this.client.getLevelManager().setPrioritizedAudioCodec(level.audioCodec);
      }

      const usesDRC = level.id.includes('-drc');
      this.client.getLevelManager().setShouldPreferDRCAudio(usesDRC);

      this.client.setCurrentAudioLevelID(level.id);
    });

    this.languageChanger = new LanguageChanger();
    this.languageChanger.setupUI();
    this.languageChanger.on('languageChanged', (type, language, tracks) => {
      this.client.changeLanguage(type, language);
    });

    this.loopControls = new LoopMenu(this.client);
    this.loopControls.setupUI();

    this.saveManager = new SaveManager(this.client);

    if (EnvUtils.isMobile()) {
      DOMElements.playerContainer.classList.add('fluid_player_mobile');
      DOMElements.playPauseButtonBigCircle.classList.add('fluid_mobile_center_play');
      DOMElements.playPauseButtonBigCircle.style.display = ''; // Ensure it's visible on mobile
      DOMElements.mobileControlBar.style.display = ''; // Reveal the minimal floating control bar
      if (DOMElements.mobile2xBanner) DOMElements.mobile2xBanner.style.display = ''; // Reveal the 2x feedback banner

      // Swap big center play/pause icons to use mobileIcons.svg
      const playUse = DOMElements.playPauseButtonBigCircle.querySelector('.play use');
      const pauseUse = DOMElements.playPauseButtonBigCircle.querySelector('.pause use');
      if (playUse) playUse.setAttribute('href', 'assets/fluidplayer/static/mobileIcons.svg#play');
      if (pauseUse) pauseUse.setAttribute('href', 'assets/fluidplayer/static/mobileIcons.svg#pause');

      this.setupMobileControlBar();
      this.setupMobileGestures();
    }

    this.saveManager.setupUI();

    this.playbackRateChanger.on('open', this.closeAllMenus.bind(this));
    this.videoQualityChanger.on('open', this.closeAllMenus.bind(this));
    this.audioQualityChanger.on('open', this.closeAllMenus.bind(this));
    this.languageChanger.on('open', this.closeAllMenus.bind(this));
    this.subtitlesManager.on('open', this.closeAllMenus.bind(this));
    this.loopControls.on('open', this.closeAllMenus.bind(this));

    this.progressBar = new ProgressBar(this.client);
    this.progressBar.on('show-skip', (segment)=>{
      this.showControlBarTemporarily(5000);
    });
    this.progressBar.setupUI();

    this.volumeControls = new VolumeControls(this.client);
    this.volumeControls.on('volume', (volume)=>{
      this.client.setVolume(volume);
    });
    this.volumeControls.setupUI();

    this.statusManager = new StatusManager();
    this.optionsWindow = new OptionsWindow();

    this.setupDOM();
  }

  updateAutoNextIndicator() {
    if (this.client.options.autoplayNext) {
      DOMElements.autoNextIndicator.style.display = '';
    } else {
      DOMElements.autoNextIndicator.style.display = 'none';
    }
  }

  updateToolVisibility() {
    this.toolManager.updateToolVisibility();
  }

  openTimeline() {
    this.progressBar.startPreciseMode(true);
  }

  closeTimeline() {
    this.fineTimeControls.removeAll();
    this.progressBar.endPreciseMode();
    this.subtitlesManager.subtitleSyncer.stop();
    this.playbackRateChanger.closeSilenceSkipperUI();
  }

  closeAllMenus(e) {
    let closedSomething = false;
    if (e !== true && (!e || (e.target && !DOMElements.extraTools.contains(e.target)))) {
      if (DOMElements.extraTools.classList.contains('visible')) {
        DOMElements.extraTools.classList.remove('visible');
        closedSomething = true;
      }
    }
    closedSomething = this.playbackRateChanger.closeUI() || closedSomething;
    closedSomething = this.videoQualityChanger.closeUI() || closedSomething;
    closedSomething = this.audioQualityChanger.closeUI() || closedSomething;
    closedSomething = this.languageChanger.closeUI() || closedSomething;
    closedSomething = this.subtitlesManager.closeUI() || closedSomething;
    closedSomething = this.loopControls.closeUI() || closedSomething;
    return closedSomething;
  }

  setStatusMessage(key, message, type, expiry) {
    this.statusManager.setStatusMessage(key, message, type, expiry);
  }

  tick() {
    if (this.client.player) {
      this.updateFragmentsLoaded();
      this.checkBuffering();
    }

    this.statusManager.updateStatusMessage();
  }

  checkBuffering() {
    const currentVideo = this.client.currentVideo;
    if (this.state.playing) {
      const time = this.client.currentTime;
      if (time === this.lastTime) {
        this.setBuffering(true);
      } else {
        this.setBuffering(false);
      }
      this.lastTime = time;
    } else if (currentVideo) {
      if (currentVideo.readyState === 0) {
        this.setBuffering(true);
      } else if (currentVideo.readyState > 1) {
        this.setBuffering(false);
      }
    }
  }

  reset() {
    DOMElements.videoContainer.replaceChildren();

    this.resetPreviewVideo();
    this.progressBar.reset();
    this.saveManager.reset();
    this.failed = false;
    this.setStatusMessage('error', null, 'error');
    this.setStatusMessage('chapter', null, 'error');
    this.stopProgressLoop();
    this.state.playing = false;
    this.updatePlayPauseButton();
    DOMElements.playPauseButtonBigCircle.style.display = '';
    DOMElements.playerContainer.classList.add('controls_visible');
    this.updateToolVisibility();
    this.fineTimeControls.reset();
    this.playbackRateChanger.reset();
  }

  /**
   * Wires up the minimal floating mobile control bar (time elapsed / seek / time remaining).
   * Mobile-only: only invoked from the isMobile() branch in the constructor.
   */
  setupMobileControlBar() {
    const {mobileSeek, mobileSeekCurrent, mobileTimeElapsed, mobileTimeRemaining} = DOMElements;
    if (!mobileSeek) return;

    this.mobileSeeking = false;

    const applyRatio = (clientX) => {
      const rect = mobileSeek.getBoundingClientRect();
      if (rect.width === 0) return;
      let ratio = (clientX - rect.left) / rect.width;
      ratio = Utils.clamp(ratio, 0, 1);
      const duration = this.client.duration || 0;
      const newTime = ratio * duration;
      this.client.currentTime = newTime;
      this.client.updateTime(newTime);
      mobileSeekCurrent.style.width = (ratio * 100) + '%';
      mobileTimeElapsed.textContent = StringUtils.formatTime(newTime);
      mobileTimeRemaining.textContent = '-' + StringUtils.formatTime(Math.max(duration - newTime, 0));
    };

    const onDown = (e) => {
      this.mobileSeeking = true;
      this.client.setSeekSave(false);
      // Capture the pointer so move/up are delivered to this element even if the
      // finger leaves the thin track (otherwise touch pointerup can be lost and
      // mobileSeeking would stay true, freezing the seek bar).
      try {
        mobileSeek.setPointerCapture(e.pointerId);
      } catch (_) {}
      applyRatio(e.clientX);
      e.preventDefault();
      e.stopPropagation();
    };

    const onMove = (e) => {
      if (!this.mobileSeeking) return;
      applyRatio(e.clientX);
      e.preventDefault();
    };

    const onUp = (e) => {
      if (!this.mobileSeeking) return;
      this.mobileSeeking = false;
      this.client.setSeekSave(true);
      try {
        if (e && e.pointerId !== undefined) mobileSeek.releasePointerCapture(e.pointerId);
      } catch (_) {}
      // Force a final sync from the real playback position so the bar can never
      // be left at the wrong spot (e.g. when events were dropped mid-seek).
      const duration = this.client.duration || 0;
      if (duration > 0) {
        mobileSeekCurrent.style.width = Utils.clamp(this.state.currentTime / duration, 0, 1) * 100 + '%';
      }
    };

    mobileSeek.addEventListener('pointerdown', onDown);
    mobileSeek.addEventListener('pointermove', onMove);
    mobileSeek.addEventListener('pointerup', onUp);
    // pointerup / pointercancel may fire outside the track; also listen on window
    // so mobileSeeking can never get stuck (a stuck flag would freeze the bar).
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  /**
   * Mobile-only gesture: a single tap on the video background toggles the
   * control bar (top tools, center play button, floating bar). Reuses the
   * existing desktop toggleControlBar() so all mobile layers hide/show together.
   * Attached in the capture phase on the player container (an ancestor of the
   * video + controls) so a background tap can be intercepted before the desktop
   * single-click handler (play/pause) fires.
   */
  setupMobileGestures() {
    const container = DOMElements.playerContainer;
    if (!container) return;

    // A long-press on touch fires the native context menu / text selection, which
    // cancels the pointer (pointercancel) and aborts the hold-to-2x timer before it
    // can engage. Suppressing the context menu keeps the hold gesture alive.
    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    const isControlTarget = (el) => el.closest('.fluid_mobile_control_bar') ||
        el.closest('.fluid_mobile_top_tools') ||
        el.closest('.fluid_mobile_center_play') ||
        el.closest('.fluid_html_on_pause') ||
        el.closest('.popwindow') ||
        el.closest('.fluid_controls_container');

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let moved = false;

    // Hold-to-2x-speed state
    let holdTimeout = null;
    let lastSpeed = null;
    let wasPlaying = false;

    // Tap/double-tap state
    let lastTapTime = 0;
    let tapTimeout = null;

    container.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      startY = e.clientY;
      startTime = Date.now();
      moved = false;

      // Hold to play at 2x (only on the video background, not on controls)
      if (!isControlTarget(e.target)) {
        clearTimeout(holdTimeout);
        holdTimeout = setTimeout(() => {
          if (lastSpeed !== null || !this.client.player || moved) return;
          wasPlaying = this.state.playing;
          lastSpeed = this.client.playbackRate;
          this.client.playbackRate = lastSpeed * 2;
          this.client.play();
          // Show the 2x feedback banner while holding
          if (DOMElements.mobile2xBanner) DOMElements.mobile2xBanner.classList.add('show');
        }, 500);
      }
    }, true);

    container.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) {
        moved = true;
        clearTimeout(holdTimeout); // a drag/seek cancels the hold
      }
    }, true);

    const endHold = () => {
      if (lastSpeed !== null) {
        this.client.playbackRate = lastSpeed;
        lastSpeed = null;
        if (!wasPlaying) this.client.pause();
      }
      // Always clear the 2x feedback banner on release/cancel
      if (DOMElements.mobile2xBanner) DOMElements.mobile2xBanner.classList.remove('show');
      clearTimeout(holdTimeout);
    };
    container.addEventListener('pointerup', endHold, true);
    container.addEventListener('pointercancel', endHold, true);

    container.addEventListener('click', (e) => {
      // Treat as a tap only if it didn't move (drag/seek) and was quick
      if (moved || Date.now() - startTime > 400) return;

      // Ignore taps on actual controls so they keep their own behavior
      if (isControlTarget(e.target)) return;

      // Prevent the desktop singleClickAction (play/pause) from also firing
      e.stopPropagation();
      e.preventDefault();

      const now = Date.now();
      if (now - lastTapTime < 300) {
        // Double tap -> fullscreen (cancel the pending single-tap toggle)
        clearTimeout(tapTimeout);
        tapTimeout = null;
        lastTapTime = 0;
        this.fullscreenToggle();
      } else {
        lastTapTime = now;
        // Single tap -> toggle controls (deferred so a 2nd tap can become fullscreen)
        clearTimeout(tapTimeout);
        tapTimeout = setTimeout(() => {
          this.toggleControlBar();
        }, 300);
      }
    }, true);
  }

  failedToLoad(reason) {
    this.failed = true;
    this.setStatusMessage('error', reason, 'error');
    this.setBuffering(false);
  }

  setBuffering(isBuffering) {
    if (this.failed) {
      isBuffering = false;
    }

    if (this.state.buffering === isBuffering) {
      return;
    }

    this.state.buffering = isBuffering;

    if (isBuffering) {
      DOMElements.bufferingSpinner.style.display = '';
    } else {
      DOMElements.bufferingSpinner.style.display = 'none';
    }
  }

  dressVideo(video) {
    video.setAttribute('playsinline', 'playsinline');
    video.disableRemotePlayback = true;
  }

  addVideo(video) {
    this.dressVideo(video);
    DOMElements.videoContainer.appendChild(video);
  }

  addPreviewVideo(video) {
    this.dressVideo(video);
    DOMElements.seekPreviewVideo.style.display = '';
    DOMElements.seekPreviewVideo.appendChild(video);
  }

  resetPreviewVideo() {
    DOMElements.seekPreviewVideo.replaceChildren();
    const spinner = document.createElement('div');
    spinner.classList.add('spinner');
    DOMElements.seekPreviewVideo.appendChild(spinner);
    DOMElements.seekPreviewVideo.classList.remove('loading');
    DOMElements.seekPreviewVideo.style.display = 'none';
  }

  updateMarkers() {
    this.progressBar.updateMarkers();
  }

  updateFragmentsLoaded() {
    this.progressBar.updateFragmentsLoaded();
    this.updateDownloadStatus();
  }

  updateDownloadStatus() {
    if (this.client.downloadManager.paused) {
      this.setStatusMessage('download', Localize.getMessage('player_download_paused'), 'warning');
      return;
    }

    const {loaded, total, failed} = this.progressBar.getFragmentCounts();
    if (total === 0) {
      this.setStatusMessage('download', null);
      return;
    }

    const percentDone = total === 0 ? 0 :
        Math.floor((loaded / total) * 1000) / 10;

    const newSpeed = this.client.downloadManager.getSpeed();
    if (newSpeed > 0 && this.lastSpeed > 0) {
      this.lastSpeed = (newSpeed * 0.05 + this.lastSpeed * 0.95) || 0;
    } else {
      this.lastSpeed = newSpeed;
    }

    let speed = this.lastSpeed; // bytes per second
    speed = Math.round(speed / 1000 / 1000 * 10) / 10; // MB per second

    if (total === 0 || loaded < total) {
      this.shownDownloadComplete = false;
      this.setStatusMessage('download', `${this.client.downloadManager.downloaders.length}C ↓${speed}MB/s ${percentDone}%`, 'success');
    } else if (!this.shownDownloadComplete) {
      this.shownDownloadComplete = true;
      this.setStatusMessage('download', Localize.getMessage('player_fragment_allbuffered'), 'success', 2000);
    }

    if (failed > 0) {
      DOMElements.resetFailed.style.display = '';
      DOMElements.resetFailed.textContent = Localize.getMessage(failed === 1 ? 'player_fragment_failed_singular' : 'player_fragment_failed_plural', [failed]);
    } else {
      DOMElements.resetFailed.style.display = 'none';
    }
  }

  updateSkipSegments() {
    this.progressBar.updateSkipSegments();
  }

  setupDOM() {
    const interactHandler = (e) => {
      this.client.userInteracted();
    };

    DOMElements.playerContainer.addEventListener('keydown', interactHandler, true);
    DOMElements.playerContainer.addEventListener('mousedown', interactHandler, true);
    DOMElements.playerContainer.addEventListener('touchstart', interactHandler, true);

    DOMElements.playPauseButton.addEventListener('click', this.playPauseToggle.bind(this));
    WebUtils.setupTabIndex(DOMElements.playPauseButton);

    DOMElements.playPauseButtonBigCircle.addEventListener('click', (e) => {
      this.hideControlBarOnAction();
      this.playPauseToggle();
      e.stopPropagation();
    });

    DOMElements.fullscreen.addEventListener('click', (e)=>{
      if (e.shiftKey) {
        this.pipToggle();
        return;
      } else if (e.altKey) {
        this.toggleWindowedFullscreen();
        return;
      }

      this.fullscreenToggle();
      e.stopPropagation();
    });

    DOMElements.fullscreen.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleWindowedFullscreen();
    });

    WebUtils.setupTabIndex(DOMElements.fullscreen);

    DOMElements.windowedFullscreen.addEventListener('click', (e)=>{
      this.toggleWindowedFullscreen();
    });
    WebUtils.setupTabIndex(DOMElements.windowedFullscreen);

    document.addEventListener('fullscreenchange', this.updateFullScreenButton.bind(this));

    DOMElements.playerContainer.addEventListener('mousemove', this.onPlayerMouseMove.bind(this));
    DOMElements.controlsContainer.addEventListener('mouseenter', this.onControlsMouseEnter.bind(this));
    DOMElements.controlsContainer.addEventListener('mouseleave', this.onControlsMouseLeave.bind(this));
    DOMElements.controlsContainer.addEventListener('focusin', ()=>{
      this.focusingControls = true;
      this.showControlBar();
    });
    DOMElements.controlsContainer.addEventListener('focusout', ()=>{
      this.focusingControls = false;
      this.queueControlsHide();
    });

    DOMElements.playerContainer.addEventListener('mouseleave', (e)=>{
      // Touch devices emit synthetic mouseleave events after a tap; on mobile
      // control visibility is driven by taps/focus, not hover, so ignore this.
      if (EnvUtils.isMobile()) return;
      this.queueControlsHide(1);
    });

    let holdTimeout = null;
    let lastSpeed = null;
    let wasPlaying = false;
    if (!EnvUtils.isMobile()) {
      DOMElements.videoContainer.addEventListener('mousedown', (e)=>{
        if (e.button === 0) {
          clearTimeout(holdTimeout);
          holdTimeout = setTimeout(() => {
            if (lastSpeed !== null || !this.client.player) {
              return;
            }
            wasPlaying = this.state.playing;
            lastSpeed = this.client.playbackRate;
            this.client.playbackRate = lastSpeed * 2;

            this.client.play();
          }, 800);
        }
      });
    }

    const stopSpeedUp = () => {
      if (lastSpeed !== null) {
        this.client.playbackRate = lastSpeed;
        lastSpeed = null;

        if (!wasPlaying) {
          this.client.pause();
        }
      }
      clearTimeout(holdTimeout);
    };

    // DOMElements.videoContainer.addEventListener('mouseup', (e)=>{
    //   stopSpeedUp();
    // });

    DOMElements.videoContainer.addEventListener('mouseleave', (e)=>{
      stopSpeedUp();
    });

    let clickCount = 0;
    let clickTimeout = null;
    DOMElements.videoContainer.addEventListener('click', (e) => {
      clearTimeout(holdTimeout);
      if (lastSpeed !== null) {
        stopSpeedUp();
        return;
      }

      if (this.closeAllMenus(false)) {
        return;
      }

      if (InterfaceUtils.closeWindows()) {
        return;
      }

      if (!EnvUtils.isMobile() && this.isBigPlayButtonVisible()) {
        this.playPauseToggle();
        return;
      }

      if (clickTimeout !== null) {
        clickCount++;
      } else {
        clickCount = 1;
      }
      clearTimeout(clickTimeout);
      clickTimeout = setTimeout(() => {
        clickTimeout = null;

        let clickAction;
        if (clickCount === 1) {
          clickAction = this.client.options.singleClickAction;
        } else if (clickCount === 2) {
          clickAction = this.client.options.doubleClickAction;
        } else if (clickCount === 3) {
          clickAction = this.client.options.tripleClickAction;
        } else {
          return;
        }

        switch (clickAction) {
          case ClickActions.FULLSCREEN:
            this.fullscreenToggle();
            break;
          case ClickActions.WINDOWED_FULLSCREEN:
            this.toggleWindowedFullscreen();
            break;
          case ClickActions.PIP:
            this.pipToggle();
            break;
          case ClickActions.PLAY_PAUSE:
            this.playPauseToggle();
            break;
          case ClickActions.HIDE_CONTROLS:
            this.focusingControls = false;
            this.mouseOverControls = false;
            this.hideControlBar();
            break;
          case ClickActions.HIDE_PLAYER:
            this.toggleHide();
            break;
        }
      }, clickCount < 3 ? 300 : 0);
    });
    DOMElements.hideButton.addEventListener('click', () => {
      DOMElements.hideButton.blur();
      this.focusingControls = false;
      this.hideControlBar();
    });

    WebUtils.setupTabIndex(DOMElements.hideButton);

    DOMElements.resetFailed.addEventListener('click', (e) => {
      this.client.resetFailed();
      e.stopPropagation();
    });
    WebUtils.setupTabIndex(DOMElements.resetFailed);

    DOMElements.skipButton.addEventListener('click', this.skipSegment.bind(this));

    DOMElements.pip.addEventListener('click', (e) => {
      this.pipToggle();
    });

    WebUtils.setupTabIndex(DOMElements.pip);

    DOMElements.playerContainer.addEventListener('dragenter', (e) => {
      e.stopPropagation();
      e.preventDefault();
    }, false);
    DOMElements.playerContainer.addEventListener('dragover', (e) => {
      e.stopPropagation();
      e.preventDefault();
    }, false);

    DOMElements.settingsButton.addEventListener('click', (e) => {
      if (e.shiftKey) {
        chrome.runtime.openOptionsPage();
      } else {
        this.optionsWindow.toggleUI();
      }
      e.stopPropagation();
    });
    WebUtils.setupTabIndex(DOMElements.settingsButton);

    const welcomeText = Localize.getMessage('player_welcometext', [this.client.version]);
    this.setStatusMessage('welcome', welcomeText, 'info', 3000);

    DOMElements.controlsContainer.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    document.addEventListener('visibilitychange', ()=>{
      if (!document.hidden) {
        this.handleVisibilityChange(true);
      } else {
        this.handleVisibilityChange(false);
      }
    });

    DOMElements.skipForwardButton.addEventListener('click', (e) => {
      this.client.setSeekSave(false);
      this.client.currentTime += this.client.options.seekStepSize * 5;
      this.client.setSeekSave(true);

      DOMElements.skipForwardButton.classList.add('fluid_animate_rotate_forward');
      DOMElements.skipForwardButton.addEventListener('animationend', () => {
        DOMElements.skipForwardButton.classList.remove('fluid_animate_rotate_forward');
      }, {once: true});

      e.stopPropagation();
    });

    WebUtils.setupTabIndex(DOMElements.skipForwardButton);

    DOMElements.skipBackwardButton.addEventListener('click', (e) => {
      this.client.setSeekSave(false);
      this.client.currentTime += -this.client.options.seekStepSize * 5;
      this.client.setSeekSave(true);

      DOMElements.skipBackwardButton.classList.add('fluid_animate_rotate_backward');
      DOMElements.skipBackwardButton.addEventListener('animationend', () => {
        DOMElements.skipBackwardButton.classList.remove('fluid_animate_rotate_backward');
      }, {once: true});

      e.stopPropagation();
    });

    WebUtils.setupTabIndex(DOMElements.skipBackwardButton);

    DOMElements.moreButton.addEventListener('click', (e) => {
      if (!DOMElements.extraTools.classList.contains('visible')) {
        this.closeAllMenus(true);
        DOMElements.extraTools.classList.add('visible');
      } else {
        DOMElements.extraTools.classList.remove('visible');
      }
      e.stopPropagation();
    });
    WebUtils.setupTabIndex(DOMElements.moreButton);

    DOMElements.duration.addEventListener('click', (e) => {
      let copyURL = '';
      if (this.client.source) {
        const source = this.client.source;
        if (source.mode === PlayerModes.ACCELERATED_YT) {
          copyURL = `https://youtu.be/${URLUtils.get_yt_identifier(source.url)}`;
          copyURL += `?t=${Math.floor(this.client.currentTime)}`;
        } else {
          try {
            const url = new URL(source.url);
            if (source.countHeaders() > 0) {
              const headers = JSON.stringify(source.headers);
              url.searchParams.set('faststream-headers', headers);
            }
            url.searchParams.set('faststream-mode', source.mode);
            url.searchParams.set('faststream-timestamp', Math.floor(this.client.currentTime).toString());
            copyURL = url.toString();
          } catch (e) {
          }
        }
      }

      const input = document.createElement('input');
      input.value = copyURL;
      DOMElements.playerContainer.appendChild(input);
      input.focus();
      input.select();
      document.execCommand('copy');
      DOMElements.playerContainer.removeChild(input);

      this.setStatusMessage(StatusTypes.COPY, Localize.getMessage('source_copied'), 'info', 2000);
    });
    WebUtils.setupTabIndex(DOMElements.duration);

    DOMElements.nextVideo.addEventListener('click', (e) => {
      if (e.shiftKey || e.altKey) {
        this.toggleAutoplayNext();
        return;
      }

      this.client.nextVideo();
      e.stopPropagation();
    });

    DOMElements.nextVideo.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleAutoplayNext();
    });

    WebUtils.setupTabIndex(DOMElements.nextVideo);

    DOMElements.previousVideo.addEventListener('click', (e) => {
      this.client.previousVideo();
      e.stopPropagation();
    });

    WebUtils.setupTabIndex(DOMElements.previousVideo);

    const o = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio > 0.25 && !document.hidden) {
        this.handleVisibilityChange(true);
      } else {
        this.handleVisibilityChange(false);
      }
    }, {
      threshold: [0, 0.25, 0.5],
    });

    o.observe(document.body);
    try {
      // eslint-disable-next-line new-cap
      Coloris({
        parent: '.mainplayer',
        theme: 'pill',
        themeMode: 'dark',
        formatToggle: true,
        swatches: [
          'rgb(255,255,255)',
          'rgba(10,10,10,0.3)',
          '#067bc2',
          '#ecc30b',
          '#f37748',
          '#d56062',
        ],
        alpha: true,
        focusInput: false,
      });
    } catch (e) {
      console.warn('Coloris failed to initialize', e);
    }

    const mouseUpHandler = (e) => {
      DOMElements.playerContainer.removeEventListener('mousemove', mouseMoveHandler);
      DOMElements.playerContainer.removeEventListener('mouseup', mouseUpHandler);
      DOMElements.playerContainer.removeEventListener('mouseleave', mouseUpHandler);
    };

    const mouseMoveHandler = (e) => {
      const currentY = Math.min(Math.max(e.clientY - WebUtils.getOffsetTop(DOMElements.progressContainer), -100), 100);
      const isExpanded = DOMElements.playerContainer.classList.contains('expanded');
      const offset = isExpanded ? 0 : 80;
      if (currentY > 50) {
        this.closeTimeline();
      } else if (currentY <= -5 - offset) {
        this.openTimeline();
      }
    };

    DOMElements.controlsLeft.addEventListener('mousedown', (e) => {
      if (e.button !== 0) {
        return;
      }

      // Ignore if user is over an element contained by .tools_container_left
      if (DOMElements.leftToolsContainer.contains(e.target)) {
        return;
      }


      DOMElements.playerContainer.addEventListener('mousemove', mouseMoveHandler);
      DOMElements.playerContainer.addEventListener('mouseup', mouseUpHandler, true);
      DOMElements.playerContainer.addEventListener('mouseleave', mouseUpHandler);
    });
  }

  toggleAutoplayNext() {
    this.client.options.autoplayNext = !this.client.options.autoplayNext;
    sessionStorage.setItem('autoplayNext', this.client.options.autoplayNext);
    this.updateAutoNextIndicator();
  }

  toggleVisualFilters() {
    this.client.options.disableVisualFilters = !this.client.options.disableVisualFilters;
    sessionStorage.setItem('disableVisualFilters', this.client.options.disableVisualFilters);
    this.client.updateCSSFilters();
  }

  async handleVisibilityChange(isVisible) {
    if (this.client.needsUserInteraction()) { // Don't do anything if the user needs to interact with the player
      return;
    }

    const action = this.client.options.visChangeAction;

    if (isVisible === this.lastPageVisibility) {
      return;
    }

    if (!isVisible && (this.state.fullscreen || this.isInPip())) {
      return;
    }

    switch (action) {
      case VisChangeActions.NOTHING:
        break;
      case VisChangeActions.PLAY_PAUSE:
        if (!isVisible) {
          this.shouldPlay = this.client.state.playing;
          await this.client.player?.pause();
        } else {
          if (this.shouldPlay) {
            await this.client.player?.play();
          }
        }
        break;
      case VisChangeActions.PIP:
        if (!isVisible) {
          await this.enterPip();
        } else {
          await this.exitPip();
        }
        break;
      case VisChangeActions.MINI_PLAYER:
        if (!this.state.miniplayer && !isVisible && !this.state.windowedFullscreen && Date.now() > MiniplayerCooldown) {
          this.requestMiniplayer(!isVisible);
        }
        break;
    }

    this.lastPageVisibility = isVisible;
  }

  requestMiniplayer(force) {
    if (EnvUtils.isExtension()) {
      // Check if source is vimeo, then dont do miniplayer
      if (this.client.source && this.client.source.mode === PlayerModes.ACCELERATED_VM) {
        return;
      }


      const styles = {};
      switch (this.client.options.miniPos) {
        case MiniplayerPositions.TOP_LEFT:
          styles.top = '0px';
          styles.left = '0px';
          break;
        case MiniplayerPositions.TOP_RIGHT:
          styles.top = '0px';
          styles.right = '0px';
          break;
        case MiniplayerPositions.BOTTOM_LEFT:
          styles.bottom = '0px';
          styles.left = '0px';
          break;
        case MiniplayerPositions.BOTTOM_RIGHT:
          styles.bottom = '0px';
          styles.right = '0px';
          break;
      }


      this.state.miniplayer = !this.state.miniplayer;
      if (force !== undefined) {
        this.state.miniplayer = force;
      }

      chrome.runtime.sendMessage({
        type: MessageTypes.REQUEST_MINIPLAYER,
        size: this.client.options.miniSize,
        force: this.state.miniplayer,
        styles,
        autoExit: true,
      }, (response) => {
        MiniplayerCooldown = Date.now() + 200;
        this.state.miniplayer = response === 'enter';
        DOMElements.playerContainer.classList.toggle('miniplayer', this.state.miniplayer);
      });
    }
  }

  setMiniplayerStatus(isMini) {
    if (isMini) {
      this.requestMiniplayer(true);
    } else {
      this.requestMiniplayer(false);
    }
  }

  toggleHide() {
    if (this.hidden) {
      DOMElements.playerContainer.classList.remove('player-hidden');
      this.hidden = false;
      if (this.shouldPlay) {
        this.client.player?.play();
      }
    } else {
      DOMElements.playerContainer.classList.add('player-hidden');

      this.hidden = true;
      this.shouldPlay = this.client.state.playing;
      this.client.player?.pause();
    }
  }

  pipToggle(force) {
    if (force !== undefined && !!force == this.isInPip()) {
      return;
    }
    if (this.isInPip()) {
      return this.exitPip();
    } else {
      return this.enterPip();
    }
  }

  isInPip() {
    return !!document.pictureInPictureElement || !!window.documentPictureInPicture?.window || this.state.documentPip;
  }

  shouldDoDocumentPip() {
    // Check if in pip
    if (this.state.documentPip) {
      return true;
    }

    if (!window.documentPictureInPicture) {
      return false;
    }

    // Check if top level frame
    if (window !== window.top) {
      return false;
    }

    return true;
  }

  exitPip() {
    if (window.documentPictureInPicture?.window) {
      window.documentPictureInPicture.window.close();
    } else if (this.state.documentPip) {
      window.close();
    }

    if (document.pictureInPictureElement) {
      return document.exitPictureInPicture();
    }
    return Promise.resolve();
  }

  enterPip() {
    if (this.shouldDoDocumentPip()) {
      return this.enterDocumentPip();
    }

    if (!document.pictureInPictureElement && this.client.player) {
      return this.client.player.getVideo().requestPictureInPicture();
    }
    return Promise.resolve();
  }

  async enterDocumentPip() {
    const pipWindow = await documentPictureInPicture.requestWindow({
      width: DOMElements.playerContainer.clientWidth,
      height: DOMElements.playerContainer.clientHeight,
    });

    // Copy all except script tags from the current document to the new window
    const children = [...document.body.children].filter((child) => child.tagName.toLowerCase() !== 'script');
    pipWindow.document.body.append(...children);
    this.state.documentPip = true;

    // Copy style sheets over from the initial document
    // so that the player looks the same.
    [...document.styleSheets].forEach((styleSheet) => {
      try {
        const cssRules = [...styleSheet.cssRules]
            .map((rule) => rule.cssText)
            .join('');
        const style = document.createElement('style');

        style.textContent = cssRules;
        pipWindow.document.head.appendChild(style);
      } catch (e) {
        const link = document.createElement('link');

        link.rel = 'stylesheet';
        link.type = styleSheet.type;
        link.media = styleSheet.media;
        link.href = styleSheet.href;
        pipWindow.document.head.appendChild(link);
      }
    });

    pipWindow.addEventListener('pagehide', (event) => {
      this.state.documentPip = false;
      document.body.append(...pipWindow.document.body.children);
    });
  }

  destroy() {
    this.saveManager.destroy();
  }

  progressLoop() {
    if (!this.shouldRunProgressLoop) {
      this.isRunningProgressLoop = false;
      return;
    }
    window.requestAnimationFrame(this.progressLoop.bind(this));
    this.client.updateTime(this.client.currentTime);
  }

  durationChanged() {
    const duration = this.client.duration;
    if (duration < (5 * 60 * this.client.playbackRate) || this.fineTimeControls.started) {
      this.runProgressLoop();
    } else {
      this.stopProgressLoop();
    }
    this.timeUpdated();
  }

  runProgressLoop() {
    // Set even if a frame is still pending, or a stop right before this would win
    this.shouldRunProgressLoop = true;
    if (!this.isRunningProgressLoop) {
      this.isRunningProgressLoop = true;
      this.progressLoop();
    }
  }

  stopProgressLoop() {
    this.shouldRunProgressLoop = false;
  }

  skipSegment() {
    this.progressBar.skipSegment();
    this.hideControlBarOnAction();
  }

  onControlsMouseEnter() {
    if (EnvUtils.isMobile()) return;
    this.showControlBar();
    this.mouseOverControls = true;
  }
  onControlsMouseLeave() {
    if (EnvUtils.isMobile()) return;
    this.mouseOverControls = false;
    if (document.activeElement && DOMElements.controlsContainer.contains(document.activeElement)) document.activeElement.blur();
    this.queueControlsHide();
  }
  onPlayerMouseMove() {
    if (EnvUtils.isMobile()) return;
    if (Date.now() < this.mouseActivityCooldown) {
      return;
    }
    this.showControlBar();
    this.queueControlsHide();
  }

  queueControlsHide(time) {
    clearTimeout(this.hideControlBarTimeout);
    this.hideControlBarTimeout = setTimeout(() => {
      // On mobile the big play button is always shown (it doubles as the center
      // button), so it must not block auto-hide.
      const bigPlayBlocking = EnvUtils.isMobile() ? false : this.isBigPlayButtonVisible();
      if (!this.focusingControls && !this.mouseOverControls && !bigPlayBlocking && this.state.playing && this.toolManager.canHideControls()) {
        this.hideControlBar();
      }
    }, time || 2000);
  }

  hideControlBarOnAction(cooldown) {
    if (!this.mouseOverControls && !this.focusingControls) {
      this.mouseActivityCooldown = Date.now() + (cooldown || 500);
      if (!this.isBigPlayButtonVisible()) {
        this.hideControlBar();
      }
    }
  }

  hideBigPlayButton() {
    if (EnvUtils.isMobile()) return;
    DOMElements.playPauseButtonBigCircle.style.display = 'none';
  }

  isBigPlayButtonVisible() {
    return DOMElements.playPauseButtonBigCircle.style.display !== 'none';
  }

  hideControlBar() {
    clearTimeout(this.hideControlBarTimeout);
    this.controlsVisible = false;
    DOMElements.playerContainer.classList.remove('controls_visible');
    DOMElements.controlsContainer.classList.remove('fade_in');
    DOMElements.controlsContainer.classList.add('fade_out');
    DOMElements.progressContainer.classList.remove('freeze');
  }

  toggleControlBar() {
    if (this.controlsVisible) {
      this.hideControlBar();
    } else {
      this.showControlBar();
    }
  }

  showControlBar() {
    this.controlsVisible = true;
    DOMElements.playerContainer.classList.add('controls_visible');
    DOMElements.controlsContainer.classList.remove('fade_out');
    DOMElements.controlsContainer.classList.add('fade_in');
    if (EnvUtils.isMobile()) {
      // Mobile: auto-hide after a short idle so the view stays immersive while playing
      this.queueControlsHide(3000);
    }
  }

  showControlBarTemporarily(timeout = 1000) {
    this.showControlBar();
    this.queueControlsHide(timeout);
  }

  updatePlaybackRate() {
    this.playbackRateChanger.setPlaybackRate(this.state.playbackRate, true);
    this.durationChanged();
  }

  updateLanguageTracks() {
    this.languageChanger.updateLanguageTracks(this.client);
  }

  updateQualityLevels() {
    this.videoQualityChanger.updateQualityLevels(this.client);
    this.audioQualityChanger.updateQualityLevels(this.client);
  }

  setVolume(volume) {
    this.volumeControls.setVolume(volume);
  }

  timeUpdated() {
    const duration = this.client.duration;
    if (!this.progressBar.isSeeking) {
      DOMElements.currentProgress.style.width = Utils.clamp(this.state.currentTime / duration, 0, 1) * 100 + '%';
    }
    DOMElements.duration.textContent = StringUtils.formatTime(this.state.currentTime) + ' / ' + StringUtils.formatTime(duration);

    // Keep the minimal mobile floating control bar in sync
    if (EnvUtils.isMobile() && DOMElements.mobileControlBar && DOMElements.mobileControlBar.style.display !== 'none') {
      DOMElements.mobileTimeElapsed.textContent = StringUtils.formatTime(this.state.currentTime);
      const remaining = Math.max(duration - this.state.currentTime, 0);
      DOMElements.mobileTimeRemaining.textContent = '-' + StringUtils.formatTime(remaining);
      if (!this.mobileSeeking) {
        DOMElements.mobileSeekCurrent.style.width = Utils.clamp(this.state.currentTime / duration, 0, 1) * 100 + '%';
      }
      // Buffered / loaded portion (hard opaque white layer)
      const video = this.client.currentVideo;
      if (video && video.buffered && video.buffered.length) {
        let bufferedEnd = 0;
        for (let i = 0; i < video.buffered.length; i++) {
          bufferedEnd = Math.max(bufferedEnd, video.buffered.end(i));
        }
        DOMElements.mobileSeekLoaded.style.width = Utils.clamp(bufferedEnd / duration, 0, 1) * 100 + '%';
      }
    }

    const chapters = this.client.chapters;
    if (chapters.length > 0) {
      const time = this.state.currentTime;
      const chapter = chapters.find((chapter) => chapter.startTime <= time && chapter.endTime >= time);
      if (chapter) {
        this.setStatusMessage('chapter', chapter.name, 'info');
      }
    } else {
      this.setStatusMessage('chapter', null, 'info');
    }

    this.subtitlesManager.renderSubtitles();
    this.fineTimeControls.onVideoTimeUpdate();
    this.updateSkipSegments();
  }

  toggleWindowedFullscreen(force) {
    chrome.runtime.sendMessage({
      type: MessageTypes.REQUEST_WINDOWED_FULLSCREEN,
      force,
    }, (response) => {
      this.state.windowedFullscreen = response === 'enter';
    });
  }

  async fullscreenToggle(force) {
    if (document.fullscreenEnabled) {
      const newValue = force === undefined ? !document.fullscreenElement : force;
      if (newValue) {
        await document.documentElement.requestFullscreen();
      } else if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen();
      }

      this.updateFullScreenButton();
    } else {
      if (EnvUtils.isExtension()) {
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: MessageTypes.REQUEST_FULLSCREEN,
            force,
          }, (response) => {
            if (response === 'error') {
              reject(new Error('Fullscreen not supported'));
              return;
            }
            this.setFullscreenStatus(response === 'enter');
            resolve();
          });
        });
      }
    }
  }

  updateFullScreenButton() {
    this.setFullscreenStatus(document.fullscreenElement);
  }

  setFullscreenStatus(status) {
    const fullScreenButton = DOMElements.fullscreen;
    if (status) {
      fullScreenButton.classList.add('out');
      this.state.fullscreen = true;
    } else {
      fullScreenButton.classList.remove('out');
      if (this.state.fullscreen) {
        this.state.fullscreen = false;
        this.fullscreenToggle(false);
      }
    }
  }

  playPauseToggle() {
    if (!this.client.player) return;

    if (!this.state.playing) {
      this.client.play();
    } else {
      this.client.pause();
    }
  }

  play() {
    const previousValue = this.state.playing;
    this.state.playing = true;
    this.hideBigPlayButton();
    this.updatePlayPauseButton();
    if (!previousValue) {
      this.playPauseAnimation();
      this.queueControlsHide();
    }
  }

  pause() {
    const previousValue = this.state.playing;
    this.state.playing = false;
    this.updatePlayPauseButton();
    this.showControlBar();
    if (previousValue) {
      this.playPauseAnimation();
    }
  }

  updatePlayPauseButton() {
    const playButton = DOMElements.playPauseButton;
    const playButtonBigCircle = DOMElements.playPauseButtonBigCircle;

    if (this.state.playing) {
      playButton.classList.add('playing');
      playButtonBigCircle.classList.add('playing');
      WebUtils.setLabels(playButton, Localize.getMessage('player_pause_label'));
      // Mobile: schedule auto-hide once playback starts
      if (EnvUtils.isMobile()) {
        this.queueControlsHide(3000);
      }
    } else {
      playButton.classList.remove('playing');
      playButtonBigCircle.classList.remove('playing');
      WebUtils.setLabels(playButton, Localize.getMessage('player_play_label'));
      // Mobile: keep controls visible while paused
      if (EnvUtils.isMobile()) {
        this.showControlBar();
      }
    }
  }

  isUserSeeking() {
    return this.progressBar.isSeeking || this.fineTimeControls.isSeeking || this.mobileSeeking;
  }

  playPauseAnimation() {
    if (this.isUserSeeking()) {
      return;
    }
    DOMElements.playPauseButtonBigCircle.classList.remove('transform-active');
    void DOMElements.playPauseButtonBigCircle.offsetWidth;
    DOMElements.playPauseButtonBigCircle.classList.add('transform-active');
    setTimeout(
        function() {
          DOMElements.playPauseButtonBigCircle.classList.remove('transform-active');
        },
        450,
    );
  }
}
