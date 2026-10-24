// Barks and squeaks made with Web Audio, so there are no sound files to load.
// Browsers keep audio silent until the first tap; unlock() is called on that tap.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean): void {
  muted = m;
}

export function isMuted(): boolean {
  return muted;
}

export function unlock(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function ready(): AudioContext | null {
  if (muted || !ctx || ctx.state !== 'running') return null;
  return ctx;
}

function envelope(a: AudioContext, at: number, peak: number, length: number): GainNode {
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  g.connect(a.destination);
  return g;
}

/** Squeaky toy: a quick rising whistle. Higher for bigger combos. */
export function squeak(combo = 1): void {
  const a = ready();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  o.type = 'sine';
  const base = 700 * Math.pow(1.12, Math.min(combo - 1, 6));
  o.frequency.setValueAtTime(base, t);
  o.frequency.exponentialRampToValueAtTime(base * 2.1, t + 0.09);
  o.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.16);
  o.connect(envelope(a, t, 0.18, 0.18));
  o.start(t);
  o.stop(t + 0.2);
}

/** A short "woof": a falling buzzy tone through a voice-like filter, with a puff of noise. */
export function bark(times = 1): void {
  const a = ready();
  if (!a) return;
  for (let i = 0; i < times; i++) {
    const t = a.currentTime + i * 0.2;
    const filter = a.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 1.2;
    filter.connect(envelope(a, t, 0.5, 0.16));
    const o = a.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.14);
    o.connect(filter);
    o.start(t);
    o.stop(t + 0.17);
    const noise = a.createBufferSource();
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.08), a.sampleRate);
    const data = buf.getChannelData(0);
    for (let k = 0; k < data.length; k++) data[k] = (Math.random() * 2 - 1) * (1 - k / data.length);
    noise.buffer = buf;
    noise.connect(filter);
    noise.start(t);
  }
}

/** Soft "boop" for a swap that doesn't work. */
export function boop(): void {
  const a = ready();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(260, t);
  o.frequency.exponentialRampToValueAtTime(180, t + 0.15);
  o.connect(envelope(a, t, 0.2, 0.18));
  o.start(t);
  o.stop(t + 0.2);
}

/** Happy rising notes for a win, sad falling ones for running out of moves. */
export function tune(happy: boolean): void {
  const a = ready();
  if (!a) return;
  const notes = happy ? [523, 659, 784, 1047] : [440, 392, 349, 294];
  notes.forEach((f, i) => {
    const t = a.currentTime + i * 0.13;
    const o = a.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.connect(envelope(a, t, 0.2, 0.25));
    o.start(t);
    o.stop(t + 0.28);
  });
  if (happy) setTimeout(() => bark(2), 550);
}
