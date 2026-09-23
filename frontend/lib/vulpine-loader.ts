type Trigger = 'visible' | 'idle' | 'interaction';

/**
 * Defers executing Vite module scripts (same tags skeleton emits via
 * `{% render 'vite', entry: '@components/...' %}`) until a trigger fires.
 *
 * Put those tags in: <template data-vulpine-scripts>...</template>
 */
export class VulpineLoader extends HTMLElement {
  #loaded = false;
  #abort = new AbortController();

  static get observedAttributes() {
    return ['on'];
  }

  connectedCallback() {
    if (this.hasAttribute('ready')) return;
    this.#arm();
  }

  disconnectedCallback() {
    this.#abort.abort();
    this.#abort = new AbortController();
  }

  get #on(): Trigger {
    const value = (this.getAttribute('on') || 'visible') as Trigger;
    if (value === 'idle' || value === 'interaction' || value === 'visible') return value;
    return 'visible';
  }

  #arm() {
    const { signal } = this.#abort;
    const on = this.#on;

    if (on === 'idle') {
      const ric = window.requestIdleCallback?.bind(window);
      if (ric) {
        const id = ric(() => this.#load(), { timeout: 2000 });
        signal.addEventListener('abort', () => window.cancelIdleCallback?.(id));
      } else {
        const id = window.setTimeout(() => this.#load(), 1);
        signal.addEventListener('abort', () => clearTimeout(id));
      }
      return;
    }

    if (on === 'interaction') {
      const opts = { signal, once: true, passive: true } as AddEventListenerOptions;
      for (const type of ['pointerdown', 'focusin', 'keydown'] as const) {
        this.addEventListener(type, () => this.#load(), opts);
      }
      return;
    }

    if (!('IntersectionObserver' in window)) {
      this.#load();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          io.disconnect();
          this.#load();
        }
      },
      { rootMargin: '100px' },
    );
    io.observe(this);
    signal.addEventListener('abort', () => io.disconnect());
  }

  async #load() {
    if (this.#loaded) return;
    this.#loaded = true;

    const template = this.querySelector(':scope > template[data-vulpine-scripts]');
    if (!(template instanceof HTMLTemplateElement)) {
      this.#loaded = false;
      console.error('[vulpine-loader] missing <template data-vulpine-scripts>');
      return;
    }

    try {
      this.#injectScripts(template);
      this.setAttribute('ready', '');
      this.dispatchEvent(new CustomEvent('vulpine:ready', { bubbles: true }));
    } catch (error) {
      this.#loaded = false;
      console.error('[vulpine-loader] failed to inject scripts', error);
    }
  }

  #injectScripts(template: HTMLTemplateElement) {
    for (const node of template.content.querySelectorAll('script')) {
      const src = node.getAttribute('src');
      if (!src) continue;

      const alreadyLoaded = [...document.scripts].some((script) => {
        const existing = script.getAttribute('src');
        return existing === src || script.src === src;
      });
      if (alreadyLoaded) continue;

      const script = document.createElement('script');
      for (const attr of node.attributes) {
        script.setAttribute(attr.name, attr.value);
      }
      document.head.appendChild(script);
    }
  }
}
