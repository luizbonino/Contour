import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// Counted interactions must survive refactors of the header and tab strip, so
// this mounts the real App with the counter snippet present. The snippet is
// deliberately src-less: analytics.ts only looks for the data attribute, and
// this keeps the suite from reaching for the network.
const events: string[] = [];

describe('App analytics wiring', () => {
  beforeAll(() => {
    document.head.innerHTML = '<script data-goatcounter="https://x.goatcounter.com/count"></script>';
    (window as unknown as { goatcounter?: unknown }).goatcounter = {
      count: (v: { path: string }) => events.push(v.path),
    };
    vi.resetModules();
  });

  it('renders the privacy footer and counts deliberate clicks', async () => {
    const App = (await import('../App.vue')).default;
    const w = mount(App, { attachTo: document.body });
    await w.vm.$nextTick();

    expect(w.find('.app-footer').exists()).toBe(true);
    expect(w.find('.app-footer').text()).toContain('cookies');

    const tabs = w.findAll('.nav-link');
    await tabs[0].trigger('click');   // SHACL Code
    await tabs[2].trigger('click');   // Form preview
    const langs = w.findAll('.lang-switch__btn');
    await langs[2].trigger('click');  // NL
    await w.vm.$nextTick();

    // Footer follows the chosen language.
    expect(w.find('.app-footer').text()).toContain('Deze online versie');
    expect(events).toEqual(['tab-definition', 'tab-preview', 'lang-nl-NL']);
  });
});
