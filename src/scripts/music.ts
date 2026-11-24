/*
 * Background music, self-hosted. The header carries the whole player: a
 * tiny thumbnail and the track credit linking to the original, and one
 * control, a mute/unmute toggle. On wide screens the first click or key
 * press anywhere starts the track and fades it in over a few seconds; on
 * narrow screens it waits for the toggle or the intro's gate. Each start
 * plays one of the mix's chunks (src/data/music.ts) that this browser has
 * not heard in its last three starts, so every visit opens on different
 * music, and when a chunk ends the next unheard one fades in. Only the chunk
 * being played is downloaded. Muting is remembered for the session and the
 * tab pauses it while hidden. The fade runs through a Web Audio gain node so
 * it also works where the volume property is ignored (iPhones), with a
 * plain volume fallback. A missing file removes the control.
 */
import { music } from '../data/music';

const STORAGE_KEY = 'fd-music';
const LEVEL = 0.68;
const FADE_IN_MS = 4500;
const FADE_OUT_MS = 900;

const control = document.querySelector<HTMLElement>('[data-music]');
const root = document.documentElement;

function remembered(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(value: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* no storage */
  }
}

/* The capture tools and the test suite opt out entirely. */
if (control && remembered() === 'off') control.remove();

if (control && control.isConnected) {
  const audio = control.querySelector<HTMLAudioElement>('[data-music-audio]');
  const toggle = control.querySelector<HTMLButtonElement>('[data-music-sound]');
  const narrow = window.matchMedia('(max-width: 760px)');

  if (!audio || !toggle) {
    control.remove();
  } else {
    let wantSound = remembered() !== 'muted';
    let gestureSeen = false;
    let soundOn = false;
    let pausedByTab = false;
    let fadeFrame = 0;
    let context: AudioContext | null = null;
    let gain: GainNode | null = null;

    audio.addEventListener('error', () => control.remove(), { once: true });

    const ensureGraph = (): void => {
      if (context || !('AudioContext' in window)) return;
      try {
        context = new AudioContext();
        const source = context.createMediaElementSource(audio);
        gain = context.createGain();
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(context.destination);
      } catch {
        context = null;
        gain = null;
      }
    };

    const setLevel = (level: number): void => {
      if (gain) gain.gain.value = level;
      else audio.volume = level;
    };

    const fadeTo = (level: number, duration: number, done?: () => void): void => {
      cancelAnimationFrame(fadeFrame);
      const from = level === 0 ? LEVEL : 0;
      const start = performance.now();
      const step = (now: number): void => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t * t * (3 - 2 * t);
        setLevel(from + (level - from) * eased);
        if (t < 1) fadeFrame = requestAnimationFrame(step);
        else done?.();
      };
      fadeFrame = requestAnimationFrame(step);
    };

    const reflect = (on: boolean): void => {
      toggle.setAttribute('aria-pressed', String(on));
      const label = toggle.getAttribute('aria-label') ?? '';
      toggle.setAttribute('aria-label', label.replace(/^Turn sound (on|off)/, `Turn sound ${on ? 'off' : 'on'}`));
    };

    /* Pick a chunk this browser has not heard in its last three starts. */
    const RECENT_KEY = 'fd-music-recent';
    const pickChunk = (): string => {
      const chunks = music.chunks;
      let recent: number[] = [];
      try {
        const stored: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
        if (Array.isArray(stored)) recent = stored.filter((value): value is number => Number.isInteger(value));
      } catch {
        /* no storage: every start is simply random */
      }
      const avoid = new Set(recent.slice(-Math.min(3, chunks.length - 1)));
      const options = chunks.map((_, index) => index).filter((index) => !avoid.has(index));
      const index = options[Math.floor(Math.random() * options.length)] ?? 0;
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify([...recent, index].slice(-3)));
      } catch {
        /* no storage */
      }
      return chunks[index]?.src ?? '';
    };

    /*
     * Everything that needs the user's gesture happens synchronously inside
     * it: the audio graph is built and resumed and play() is called before
     * anything is awaited, because Safari on iPhones only honours a play()
     * made while the tap is being handled. A new start loads a new chunk
     * first; chunks begin at their own top, so there is no seek to go wrong.
     * If the browser still refuses, the next gesture tries again.
     */
    const retryGestures = ['click', 'touchend', 'pointerup', 'keydown'] as const;
    const retry = (): void => {
      retryGestures.forEach((type) => window.removeEventListener(type, retry));
      if (wantSound && !soundOn) startPlayback();
    };
    const retryOnGesture = (): void => {
      retryGestures.forEach((type) => window.addEventListener(type, retry, { passive: true }));
    };

    let starting = false;
    const startPlayback = (): void => {
      if (soundOn || starting) return;
      starting = true;
      ensureGraph();
      if (context?.state === 'suspended') void context.resume().catch(() => undefined);
      setLevel(0);
      if (audio.paused || audio.ended || !audio.getAttribute('src')) {
        audio.src = pickChunk();
      }
      let attempt: Promise<void>;
      try {
        attempt = Promise.resolve(audio.play());
      } catch {
        attempt = Promise.reject(new Error('play refused'));
      }
      attempt
        .then(() => {
          starting = false;
          soundOn = true;
          reflect(true);
          fadeTo(LEVEL, FADE_IN_MS);
        })
        .catch(() => {
          starting = false;
          reflect(false);
          retryOnGesture();
        });
    };

    const stopPlayback = (): void => {
      if (!soundOn) return;
      soundOn = false;
      reflect(false);
      fadeTo(0, FADE_OUT_MS, () => audio.pause());
    };

    const begin = (): void => control.classList.add('is-live');
    if (root.classList.contains('is-intro')) {
      window.addEventListener('fd:intro-done', begin, { once: true });
      window.setTimeout(begin, 10000);
    } else {
      begin();
    }

    /* The first interaction anywhere except the toggle itself starts the music; the toggle decides for itself. */
    const firstGesture = (event: Event): void => {
      if (event.target instanceof Element && event.target.closest('[data-music-sound]')) return;
      window.removeEventListener('pointerdown', firstGesture);
      window.removeEventListener('keydown', firstGesture);
      if (narrow.matches || !wantSound) return;
      gestureSeen = true;
      startPlayback();
    };
    window.addEventListener('pointerdown', firstGesture, { passive: true });
    window.addEventListener('keydown', firstGesture, { passive: true });

    /* Entering through the intro is the gesture, on every screen size. */
    window.addEventListener(
      'fd:enter',
      (event) => {
        const detail = (event as CustomEvent<{ sound?: boolean }>).detail;
        if (!detail?.sound || !wantSound) return;
        window.removeEventListener('pointerdown', firstGesture);
        window.removeEventListener('keydown', firstGesture);
        gestureSeen = true;
        startPlayback();
      },
      { once: true },
    );

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      gestureSeen = true;
      const turningOn = !(soundOn || starting);
      wantSound = turningOn;
      remember(turningOn ? 'on' : 'muted');
      if (turningOn) startPlayback();
      else stopPlayback();
    });

    /* A chunk fades out on its own; the next unheard one fades in after it. */
    audio.addEventListener('ended', () => {
      if (!soundOn) return;
      setLevel(0);
      audio.src = pickChunk();
      void audio
        .play()
        .then(() => (soundOn ? fadeTo(LEVEL, FADE_IN_MS) : undefined))
        .catch(() => undefined);
    });

    document.addEventListener('visibilitychange', () => {
      if (!soundOn || !gestureSeen) return;
      if (document.hidden) {
        pausedByTab = true;
        audio.pause();
      } else if (pausedByTab) {
        pausedByTab = false;
        void audio.play().catch(() => undefined);
      }
    });
  }
}
