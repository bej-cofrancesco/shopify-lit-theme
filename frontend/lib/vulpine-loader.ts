import type { LitElement } from 'lit';

type Trigger = 'visible' | 'idle' | 'interaction';

type ReplayHint = {
  ariaLabel: string | null;
  name: string | null;
  text: string;
  tagName: string;
};

/**
 * Defers Vite entry scripts until a trigger.
 * For `on="interaction"`, replays the gesture onto the *post-hydrate* control
 * (DSD nodes are replaced when Lit renders, so we match by aria-label / text).
 */
export class VulpineLoader extends HTMLElement {
  #loaded = false;
  #loading = false;
  #abort = new AbortController();
  #replayHint: ReplayHint | null = null;

  static get observedAttributes() {
    return ['on', 'replay'];
  }

  connectedCallback() {
    this.style.display = 'contents';
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

  get #shouldReplay() {
    return this.getAttribute('replay') !== 'false';
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
      const onInteract = (event: Event) => {
        if (this.#loaded || this.#loading) return;
        this.#replayHint = this.#captureReplayHint(event);
        event.preventDefault();
        event.stopPropagation();
        void this.#load(true);
      };
      this.addEventListener('click', onInteract, { signal, capture: true });
      this.addEventListener(
        'keydown',
        (event) => {
          if (!(event instanceof KeyboardEvent)) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          onInteract(event);
        },
        { signal, capture: true },
      );
      return;
    }

    if (!('IntersectionObserver' in window)) {
      void this.#load();
      return;
    }

    // `display: contents` hosts have no box — IO on `this` never intersects.
    // Wait a frame for DSD layout, then observe the first descendant with a box.
    const start = () => {
      if (signal.aborted || this.#loaded || this.#loading) return;
      const target = this.#intersectionTarget();
      if (!target) {
        void this.#load();
        return;
      }

      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            io.disconnect();
            void this.#load();
          }
        },
        { rootMargin: '100px' },
      );
      io.observe(target);
      signal.addEventListener('abort', () => io.disconnect());
    };

    requestAnimationFrame(() => requestAnimationFrame(start));
  }

  /**
   * First element under this loader that generates a layout box
   * (walks open shadow roots; skips templates / display:contents shells).
   */
  #intersectionTarget(): Element | null {
    const visit = (root: ParentNode): Element | null => {
      for (const el of root.querySelectorAll('*')) {
        if (el instanceof HTMLTemplateElement) continue;
        if (!(el instanceof HTMLElement)) continue;
        if (el.localName === 'vulpine-loader') continue;

        const style = getComputedStyle(el);
        if (style.display === 'contents' || style.display === 'none') {
          if (el.shadowRoot) {
            const nested = visit(el.shadowRoot);
            if (nested) return nested;
          }
          continue;
        }

        const { width, height } = el.getBoundingClientRect();
        if (width > 0 || height > 0) return el;

        if (el.shadowRoot) {
          const nested = visit(el.shadowRoot);
          if (nested) return nested;
        }
      }
      return null;
    };

    return visit(this);
  }

  async #load(replay = false) {
    if (this.#loaded || this.#loading) return;
    this.#loading = true;

    const template = this.querySelector(':scope > template[data-vulpine-scripts]');
    if (!(template instanceof HTMLTemplateElement)) {
      this.#loading = false;
      console.error('[vulpine-loader] missing <template data-vulpine-scripts>');
      return;
    }

    try {
      await this.#injectScripts(template);
      await this.#waitForCustomElements();
      this.#loaded = true;
      this.setAttribute('ready', '');
      this.dispatchEvent(new CustomEvent('vulpine:ready', { bubbles: true }));

      if (replay && this.#shouldReplay) {
        await this.#replay();
      }
    } catch (error) {
      console.error('[vulpine-loader] failed to load island', error);
    } finally {
      this.#loading = false;
    }
  }

  async #injectScripts(template: HTMLTemplateElement) {
    const pending: Promise<void>[] = [];

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

      pending.push(
        new Promise<void>((resolve, reject) => {
          script.addEventListener('load', () => resolve(), { once: true });
          script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {
            once: true,
          });
        }),
      );
      document.head.appendChild(script);
    }

    await Promise.all(pending);
  }

  async #waitForCustomElements() {
    const elements = [...this.querySelectorAll('*')].filter(
      (el) => el.localName.includes('-') && el.localName !== 'vulpine-loader',
    );

    await Promise.all(
      elements.map((el) =>
        Promise.race([
          customElements.whenDefined(el.localName),
          new Promise<void>((resolve) => setTimeout(resolve, 4000)),
        ]),
      ),
    );

    await Promise.all(
      elements.map(async (el) => {
        const lit = el as LitElement;
        if (lit.updateComplete) {
          await lit.updateComplete;
        }
      }),
    );

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  #captureReplayHint(trigger: Event): ReplayHint | null {
    const target = this.#eventElement(trigger);
    if (!target) return null;
    return {
      ariaLabel: target.getAttribute('aria-label'),
      name: target.getAttribute('name'),
      text: target.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      tagName: target.tagName,
    };
  }

  #eventElement(trigger: Event): HTMLElement | null {
    for (const node of trigger.composedPath()) {
      if (node === this) break;
      if (!(node instanceof HTMLElement)) continue;
      if (node instanceof HTMLTemplateElement) continue;
      return node;
    }
    return trigger.target instanceof HTMLElement ? trigger.target : null;
  }

  async #replay() {
    const hint = this.#replayHint;
    if (!hint) return;

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const target = this.#findPostHydrateTarget(hint);
    if (!target) {
      console.warn('[vulpine-loader] replay target not found after hydrate', hint);
      return;
    }

    // Native click() runs Lit listeners; synthetic events on detached DSD nodes do not.
    target.click();
  }

  #findPostHydrateTarget(hint: ReplayHint): HTMLElement | null {
    const roots: Array<ParentNode> = [this];
    for (const el of this.querySelectorAll('*')) {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    }

    for (const root of roots) {
      if (hint.ariaLabel) {
        const byAria = root.querySelector<HTMLElement>(`[aria-label="${CSS.escape(hint.ariaLabel)}"]`);
        if (byAria) return byAria;
      }
      if (hint.name) {
        const byName = root.querySelector<HTMLElement>(`[name="${CSS.escape(hint.name)}"]`);
        if (byName) return byName;
      }
    }

    if (hint.text) {
      for (const root of roots) {
        for (const el of root.querySelectorAll<HTMLElement>('button, [role="button"], a')) {
          if (el.textContent?.replace(/\s+/g, ' ').trim() === hint.text) return el;
        }
      }
    }

    return null;
  }
}
