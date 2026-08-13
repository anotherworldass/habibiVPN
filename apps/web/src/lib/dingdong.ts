/** Soft "叮咚" chime via Web Audio (no asset file). */

let ctx: AudioContext | null = null;
let unlocked = false;
let lastPlayAt = 0;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Call after a user gesture so browsers allow subsequent autoplay. */
export function unlockDingDong() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume().then(() => {
      unlocked = true;
    });
  } else {
    unlocked = true;
  }
}

function tone(
  c: AudioContext,
  freq: number,
  start: number,
  duration: number,
  gainPeak: number,
) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gainPeak, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Play a short ding-dong. Debounced to avoid double-fire from dual polls. */
export function playDingDong() {
  const now = Date.now();
  if (now - lastPlayAt < 1200) return;
  lastPlayAt = now;

  const c = getCtx();
  if (!c) return;

  const run = () => {
    const t0 = c.currentTime + 0.01;
    tone(c, 880, t0, 0.16, 0.18);
    tone(c, 660, t0 + 0.18, 0.22, 0.16);
  };

  if (c.state === "suspended") {
    void c.resume().then(() => {
      unlocked = true;
      run();
    });
    return;
  }
  unlocked = true;
  run();
}

export function isDingDongUnlocked() {
  return unlocked;
}
