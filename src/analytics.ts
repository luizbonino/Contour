// Anonymous, cookieless usage counting for the hosted app (GoatCounter).
//
// The counter <script> is injected into the built index.html only when the
// CONTOUR_GOATCOUNTER build variable is set — see vite.config.ts. That variable
// is set by the GitHub Pages workflow alone, so the committed dist/ build and
// the single-file release asset ship without it and every call here no-ops.
//
// No cookies, no identifiers, no personal data: only the event names below are
// sent. Schema content, file names and IRIs must never be passed to track().

interface GoatCounterVars {
  path: string;
  title?: string;
  event?: boolean;
  referrer?: string;
}

declare global {
  interface Window {
    goatcounter?: { count?: (vars: GoatCounterVars) => void };
  }
}

/**
 * True when this build carries the counter snippet — i.e. the hosted
 * deployment. Also drives the privacy line in the app footer, so the note only
 * appears where counting actually happens.
 */
export const analyticsEnabled: boolean =
  typeof document !== 'undefined' && !!document.querySelector('script[data-goatcounter]');

// count.js loads async, so events fired during startup are queued until it
// appears. If it never does (blocked by an extension, offline), the queue is
// dropped after MAX_TICKS and later events are discarded immediately.
const TICK_MS = 500;
const MAX_TICKS = 20; // ≈10s
const MAX_QUEUE = 50;

const queue: string[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let ticks = 0;
let gaveUp = false;

function ready(): boolean {
  return typeof window.goatcounter?.count === 'function';
}

function send(name: string): void {
  window.goatcounter!.count!({ path: name, title: name, event: true });
}

function stopWaiting(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

function drain(): void {
  if (ready()) {
    queue.splice(0).forEach(send);
    stopWaiting();
    return;
  }
  if (++ticks > MAX_TICKS) {
    queue.length = 0;
    gaveUp = true;
    stopWaiting();
  }
}

/**
 * Count one named interaction, e.g. `tab-definition` or `widget-URIEditor`.
 * Names must be a fixed vocabulary — never interpolate user content.
 */
export function track(name: string): void {
  if (!analyticsEnabled) return;
  if (ready()) {
    send(name);
    return;
  }
  if (gaveUp) return;
  queue.push(name);
  if (queue.length > MAX_QUEUE) queue.shift();
  if (!timer) timer = setInterval(drain, TICK_MS);
}
