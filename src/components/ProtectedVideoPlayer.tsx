import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Pause,
  Play,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  setPlaybackRate: (rate: number) => void;
  getPlayerState: () => number;
  destroy: () => void;
}

interface YTGlobal {
  Player: new (
    element: HTMLElement,
    options: {
      width?: string | number;
      height?: string | number;
      host?: string;
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: () => void;
      };
    }
  ) => YTPlayerInstance;
}

declare global {
  interface Window {
    YT?: YTGlobal;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTGlobal> | null = null;

function loadYouTubeIframeApi(): Promise<YTGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window unavailable'));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) {
    return ytApiPromise;
  }

  ytApiPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    const prevCallback = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevCallback === 'function') prevCallback();
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error('YouTube Player API failed to initialize'));
      }
    };

    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        ytApiPromise = null;
        reject(new Error('Could not load YouTube Player API'));
      };
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ProtectedVideoPlayer({
  videoId,
  title,
  watermark,
  loadingSession,
  sessionError,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onEnded,
}: {
  videoId: string | null;
  title: string;
  watermark?: string;
  loadingSession?: boolean;
  sessionError?: string;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onEnded?: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const mountHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [rate, setRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [watermarkCorner, setWatermarkCorner] = useState(0);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHideControls = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setControlsVisible(true);
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3000);
  }, []);

  // Rotate watermark corner periodically to deter static cropping
  useEffect(() => {
    const id = setInterval(() => {
      setWatermarkCorner((c) => (c + 1) % 4);
    }, 20000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Initialize YT.Player cleanly inside an unmanaged child element so React DOM stays untouched
  useEffect(() => {
    setReady(false);
    setPlaying(false);
    setBuffering(false);
    setPlayerError('');
    setCurrentTime(0);
    setDuration(0);

    const host = mountHostRef.current;
    if (!host || !videoId) return;

    let cancelled = false;
    host.innerHTML = '';
    const playerEl = document.createElement('div');
    playerEl.className = 'w-full h-full';
    host.appendChild(playerEl);

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled) return;
        const instance = new YT.Player(playerEl, {
          width: '100%',
          height: '100%',
          host: 'https://www.youtube-nocookie.com',
          videoId,
          playerVars: {
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              setReady(true);
              setDuration(instance.getDuration() || 0);
              setVolume(instance.getVolume() ?? 100);
              setMuted(instance.isMuted());
            },
            onStateChange: (event) => {
              if (cancelled) return;
              // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
              if (event.data === 1) {
                setPlaying(true);
                setBuffering(false);
                setDuration(instance.getDuration() || 0);
                scheduleHideControls();
              } else if (event.data === 2 || event.data === 5 || event.data === -1) {
                setPlaying(false);
                setBuffering(false);
                setControlsVisible(true);
              } else if (event.data === 3) {
                setBuffering(true);
              } else if (event.data === 0) {
                setPlaying(false);
                setBuffering(false);
                setControlsVisible(true);
                onEnded?.();
              }
            },
            onError: () => {
              if (cancelled) return;
              setPlayerError(
                'This video could not be loaded inside the embedded classroom player. Make sure embedding is enabled for this Unlisted YouTube video.'
              );
              setBuffering(false);
            },
          },
        });
        playerRef.current = instance;
      })
      .catch(() => {
        if (!cancelled) {
          setPlayerError('Could not initialize the on-platform video player.');
        }
      });

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore destroy errors on unmount
        }
        playerRef.current = null;
      }
      host.innerHTML = '';
    };
  }, [videoId, onEnded, scheduleHideControls]);

  // Poll current time while playing
  useEffect(() => {
    if (!playing || !ready) return;
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        setCurrentTime(p.getCurrentTime() || 0);
        const d = p.getDuration() || 0;
        if (d > 0) setDuration(d);
      } catch {
        // ignore transient player read errors
      }
    }, 350);
    return () => clearInterval(id);
  }, [playing, ready]);

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    if (playing) {
      p.pauseVideo();
    } else {
      p.playVideo();
    }
    scheduleHideControls();
  }, [playing, ready, scheduleHideControls]);

  const toggleMute = useCallback(() => {
    const p = playerRef.current;
    if (!p || !ready) return;
    if (muted) {
      p.unMute();
      setMuted(false);
    } else {
      p.mute();
      setMuted(true);
    }
    scheduleHideControls();
  }, [muted, ready, scheduleHideControls]);

  const handleVolumeChange = (val: number) => {
    const p = playerRef.current;
    setVolume(val);
    if (!p || !ready) return;
    p.setVolume(val);
    if (val === 0) {
      p.mute();
      setMuted(true);
    } else if (muted) {
      p.unMute();
      setMuted(false);
    }
  };

  const handleSeek = (val: number) => {
    const p = playerRef.current;
    setCurrentTime(val);
    if (!p || !ready) return;
    p.seekTo(val, true);
    scheduleHideControls();
  };

  const handleSpeedChange = (nextRate: number) => {
    const p = playerRef.current;
    setRate(nextRate);
    if (p && ready) {
      p.setPlaybackRate(nextRate);
    }
    scheduleHideControls();
  };

  const toggleFullscreen = useCallback(async () => {
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // ignore if fullscreen denied
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const key = e.key.toLowerCase();
    // Block common save / view-source / inspect shortcuts inside player
    if (
      (e.ctrlKey || e.metaKey) &&
      (key === 's' || key === 'u' || key === 'p' || (e.shiftKey && (key === 'i' || key === 'j' || key === 'c')))
    ) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (key === 'f12') {
      e.preventDefault();
      return;
    }

    if (key === ' ' || key === 'k') {
      e.preventDefault();
      togglePlay();
    } else if (key === 'f') {
      e.preventDefault();
      void toggleFullscreen();
    } else if (key === 'm') {
      e.preventDefault();
      toggleMute();
    } else if (key === 'arrowright') {
      e.preventDefault();
      handleSeek(Math.min(duration, currentTime + 5));
    } else if (key === 'arrowleft') {
      e.preventDefault();
      handleSeek(Math.max(0, currentTime - 5));
    }
  };

  const watermarkPositionClass =
    watermarkCorner === 0
      ? 'top-14 right-4'
      : watermarkCorner === 1
        ? 'bottom-16 left-4'
        : watermarkCorner === 2
          ? 'bottom-16 right-4'
          : 'top-14 left-4';

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onMouseMove={scheduleHideControls}
      className="relative rounded-xl overflow-hidden border border-[#1A2550] bg-[#03051B] aspect-video select-none focus:outline-none focus:ring-2 focus:ring-[#176BFF] group"
    >
      {/* YouTube IFrame Host — pointer-events strictly disabled so YouTube links/menus/download hooks cannot be triggered */}
      <div
        ref={mountHostRef}
        className="w-full h-full pointer-events-none select-none [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0 [&>iframe]:pointer-events-none"
      />

      {/* Top On-Platform Classroom Bar — covers YouTube title / Watch on YouTube / Share hover area */}
      <div
        className={`absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-b from-[#03051B]/95 via-[#03051B]/80 to-transparent transition-opacity duration-200 pointer-events-none ${
          controlsVisible || !playing ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="w-4 h-4 text-[#00D4FF] shrink-0" />
          <span className="text-xs font-medium text-[#F7F8FF] truncate">{title}</span>
        </div>
        <span className="hidden sm:inline-block text-[10px] font-mono uppercase tracking-wider text-[#00D4FF]/90 shrink-0">
          On-Platform Stream
        </span>
      </div>

      {/* Interactive Transparent Shield Overlay — blocks right-click & intercepts clicks cleanly */}
      <div
        role="button"
        aria-label={playing ? 'Pause video' : 'Play video'}
        onClick={togglePlay}
        onDoubleClick={() => void toggleFullscreen()}
        onContextMenu={(e) => e.preventDefault()}
        className="absolute inset-0 z-10 cursor-pointer flex items-center justify-center"
      >
        {loadingSession ? (
          <div className="px-4 py-2.5 rounded-lg bg-[#03051B]/90 border border-[#1A2550] text-xs text-[#AEB8D4]">
            Authorizing protected video stream...
          </div>
        ) : sessionError || playerError ? (
          <div className="max-w-md mx-4 rounded-xl bg-[#03051B]/95 border border-red-500/40 p-5 text-center text-xs text-red-200">
            {sessionError || playerError}
          </div>
        ) : !videoId ? (
          <div className="px-4 py-2.5 rounded-lg bg-[#03051B]/90 border border-[#1A2550] text-xs text-[#AEB8D4]">
            No video configured for this sub-lesson yet.
          </div>
        ) : buffering ? (
          <div className="w-12 h-12 rounded-full border-2 border-[#1A2550] border-t-[#00D4FF] animate-spin" />
        ) : !playing ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-[#176BFF]/95 hover:bg-[#176BFF] text-white flex items-center justify-center shadow-2xl border border-white/20 transition-transform group-hover:scale-105">
              <Play className="w-7 h-7 fill-white ml-0.5" />
            </div>
            {!ready && (
              <span className="text-[11px] font-mono text-[#AEB8D4] bg-[#03051B]/80 px-2.5 py-1 rounded">
                Initializing player...
              </span>
            )}
          </div>
        ) : null}
      </div>

      {/* Dynamic Enrolled Learner Watermark (persists in fullscreen) */}
      {watermark && videoId && !sessionError && (
        <div
          aria-hidden="true"
          className={`absolute z-15 pointer-events-none select-none px-2.5 py-1 rounded bg-[#03051B]/45 text-[10px] font-mono text-white/45 transition-all duration-700 ${watermarkPositionClass}`}
        >
          {watermark}
        </div>
      )}

      {/* Custom On-Platform Bottom Control Bar */}
      {videoId && !sessionError && !playerError && (
        <div
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#03051B]/95 via-[#03051B]/85 to-transparent px-3 sm:px-4 pt-6 pb-3 transition-opacity duration-200 ${
            controlsVisible || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Seek Bar */}
          <div className="relative flex items-center mb-2">
            <input
              type="range"
              aria-label="Seek video"
              min={0}
              max={duration || 100}
              step={0.5}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="w-full h-1.5 accent-[#00D4FF] cursor-pointer rounded-lg bg-[#1A2550]"
              style={{
                background: `linear-gradient(to right, #00D4FF ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%)`,
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-[#F7F8FF]">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={togglePlay}
                disabled={!ready}
                aria-label={playing ? 'Pause' : 'Play'}
                className="p-1.5 rounded hover:bg-white/10 disabled:opacity-40"
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>

              {hasPrev && onPrev && (
                <button
                  type="button"
                  onClick={onPrev}
                  aria-label="Previous video"
                  title="Previous sub-video"
                  className="p-1.5 rounded hover:bg-white/10"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
              )}

              {hasNext && onNext && (
                <button
                  type="button"
                  onClick={onNext}
                  aria-label="Next video"
                  title="Next sub-video"
                  className="p-1.5 rounded hover:bg-white/10"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  className="p-1.5 rounded hover:bg-white/10"
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  aria-label="Volume"
                  min={0}
                  max={100}
                  value={muted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="hidden sm:block w-16 h-1 accent-[#00D4FF] cursor-pointer"
                />
              </div>

              <span className="font-mono text-[11px] text-[#AEB8D4] tabular-nums ml-1">
                {formatClock(currentTime)} / {formatClock(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <select
                aria-label="Playback speed"
                value={rate}
                onChange={(e) => handleSpeedChange(Number(e.target.value))}
                className="rounded bg-[#080D2B] border border-[#1A2550] px-1.5 py-1 text-[11px] font-mono text-[#F7F8FF] focus:outline-none"
              >
                {[0.75, 1, 1.25, 1.5, 2].map((r) => (
                  <option key={r} value={r}>
                    {r}x
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                className="p-1.5 rounded hover:bg-white/10"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
