import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// analyticsEnabled is decided once at module load, so each case sets up the DOM
// first and then imports a fresh copy of the module.
async function loadAnalytics(withSnippet: boolean) {
  document.head.innerHTML = withSnippet
    ? '<script data-goatcounter="https://example.goatcounter.com/count" src="https://gc.zgo.at/count.js"></script>'
    : '';
  vi.resetModules();
  return import('../analytics');
}

function fakeCounter(): string[] {
  const seen: string[] = [];
  (window as unknown as { goatcounter?: unknown }).goatcounter = {
    count: (v: { path: string; event?: boolean }) => {
      expect(v.event).toBe(true);
      seen.push(v.path);
    },
  };
  return seen;
}

describe('analytics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete (window as unknown as { goatcounter?: unknown }).goatcounter;
  });
  afterEach(() => {
    vi.useRealTimers();
    document.head.innerHTML = '';
  });

  it('is disabled when the build carries no counter snippet', async () => {
    const { analyticsEnabled, track } = await loadAnalytics(false);
    expect(analyticsEnabled).toBe(false);
    const seen = fakeCounter();
    track('tab-visual');
    vi.advanceTimersByTime(20_000);
    // Offline / single-file builds must stay silent even if a counter is around.
    expect(seen).toEqual([]);
  });

  it('sends events once the counter script is present', async () => {
    const { analyticsEnabled, track } = await loadAnalytics(true);
    expect(analyticsEnabled).toBe(true);
    const seen = fakeCounter();
    track('tab-definition');
    track('widget-URIEditor');
    expect(seen).toEqual(['tab-definition', 'widget-URIEditor']);
  });

  it('queues events fired before the async script loads, then flushes in order', async () => {
    const { track } = await loadAnalytics(true);
    track('lang-nl-NL');
    track('file-open');
    const seen = fakeCounter(); // script "arrives" late
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(600);
    expect(seen).toEqual(['lang-nl-NL', 'file-open']);
  });

  it('drops the queue when the script never loads, but recovers if it arrives late', async () => {
    const { track } = await loadAnalytics(true);
    track('graph-open');
    vi.advanceTimersByTime(20_000); // blocked by an extension, say
    const seen = fakeCounter();
    vi.advanceTimersByTime(20_000);
    expect(seen).toEqual([]); // the stale event is gone, not replayed

    // A script that turns up very late still works for what happens next.
    track('code-copy');
    expect(seen).toEqual(['code-copy']);
  });
});
