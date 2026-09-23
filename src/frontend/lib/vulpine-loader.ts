import type { LitElement } from 'lit';

type NamedTrigger = 'visible' | 'idle' | 'interaction';

type ParsedTriggers = {
  named: NamedTrigger[];
  events: string[];
  mediaQueries: string[];
};

type ReplayHint = {
  ariaLabel: string | null;
  name: string | null;
  text: string;
  tagName: string;
};

/** Snapshot of the CustomEvent / Event that caused a load, for exact replay. */
type EventReplay = {
  type: string;
  detail: unknown;
  bubbles: boolean;
  composed: boolean;
  cancelable: boolean;
};

const NAMED = new Set<NamedTrigger>(['visible', 'idle', 'interaction']);

/**
 * Defers Vite entry scripts until a trigger fires.
 *
 * `on` accepts one or more triggers (space / comma / `+` separated). All listed
 * triggers are armed; the first to fire loads the island (others are no-ops).
 *
 * - `idle` | `visible` | `interaction` — existing
 * - `event:<name>` — listen on `window` for that event name (e.g. `event:search:open`)
 * - `media:<css-media-query>` — gate: other triggers only arm while the query matches
 *
 * Example: `on="media:(max-width: 767px) event:search:open idle"`
 *
 * For `interaction`, the click/key that triggered load is replayed as a click after
 * hydrate. For `event:…`, the **exact same event** (type + detail + bubbles/composed)
 * is re-dispatched on `window` after hydrate so listeners on the island can run.
 * Opt out with `replay="false"`.
 */
export class VulpineLoader extends HTMLElement {
  #loaded = false;
  #loading = false;
  #abort = new AbortController();
  #replayHint: ReplayHint | null = null;
  #eventReplay: EventReplay | null = null;
  #mediaMqls: MediaQueryList[] = [];

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
    this.#mediaMqls = [];
  }

  get #parsed(): ParsedTriggers {
    return parseOnAttribute(this.getAttribute('on') || 'visible');
  }

  get #shouldReplay() {
    return this.getAttribute('replay') !== 'false';
  }

  #arm() {
    const { named, events, mediaQueries } = this.#parsed;
    const { signal } = this.#abort;

    if (mediaQueries.length === 0) {
      this.#armAll(named, events);
      return;
    }

    this.#mediaMqls = mediaQueries.map((q) => window.matchMedia(q));

    const mediaOk = () => this.#mediaMqls.every((mql) => mql.matches);

    const sync = () => {
      if (this.#loaded || this.#loading) return;
      this.#abort.abort();
      this.#abort = new AbortController();
      for (const mql of this.#mediaMqls) {
        mql.addEventListener('change', () => sync(), { signal: this.#abort.signal });
      }
      if (mediaOk()) {
        this.#armAll(named, events);
      }
    };

    for (const mql of this.#mediaMqls) {
      mql.addEventListener('change', () => sync(), { signal });
    }
    sync();
  }

  #armAll(named: NamedTrigger[], events: string[]) {
    for (const trigger of named) {
      this.#armNamed(trigger);
    }
    for (const name of events) {
      this.#armEvent(name);
    }
  }

  #armEvent(name: string) {
    const { signal } = this.#abort;
    const onEvent = (event: Event) => {
      if (this.#loaded || this.#loading) return;
      this.#eventReplay = {
        type: event.type,
        detail: (event as CustomEvent).detail,
        bubbles: event.bubbles,
        composed: event.composed,
        cancelable: event.cancelable,
      };
      void this.#load(true);
    };
    window.addEventListener(name, onEvent, { signal });
  }

  #armNamed(on: NamedTrigger) {
    const { signal } = this.#abort;

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

    // visible
    if (!('IntersectionObserver' in window)) {
      void this.#load();
      return;
    }

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

    this.#abort.abort();
    this.#abort = new AbortController();

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
    if (this.#eventReplay) {
      const { type, detail, bubbles, composed, cancelable } = this.#eventReplay;
      this.#eventReplay = null;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      window.dispatchEvent(
        new CustomEvent(type, { detail, bubbles, composed, cancelable }),
      );
      return;
    }

    const hint = this.#replayHint;
    if (!hint) return;

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const target = this.#findPostHydrateTarget(hint);
    if (!target) {
      console.warn('[vulpine-loader] replay target not found after hydrate', hint);
      return;
    }

    target.click();
  }

  #findPostHydrateTarget(hint: ReplayHint): HTMLElement | null {
    const roots: Array<ParentNode> = [this];
    for (const el of this.querySelectorAll('*')) {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    }

    for (const root of roots) {
      if (hint.ariaLabel) {
        const byAria = root.querySelector<HTMLElement>(
          `[aria-label="${CSS.escape(hint.ariaLabel)}"]`,
        );
        if (byAria) return byAria;
      }
      if (hint.name) {
        const byName = root.querySelector<HTMLElement>(
          `[name="${CSS.escape(hint.name)}"]`,
        );
        if (byName) return byName;
      }
    }

    if (hint.text) {
      for (const root of roots) {
        for (const el of root.querySelectorAll<HTMLElement>(
          'button, [role="button"], a',
        )) {
          if (el.textContent?.replace(/\s+/g, ' ').trim() === hint.text) return el;
        }
      }
    }

    return null;
  }
}

/** Exported for tests / docs. */
export function parseOnAttribute(raw: string): ParsedTriggers {
  const named: NamedTrigger[] = [];
  const events: string[] = [];
  const mediaQueries: string[] = [];

  let i = 0;
  const s = raw.trim();

  const skipSep = () => {
    while (i < s.length && /[\s,+|]/.test(s[i]!)) i++;
  };

  while (i < s.length) {
    skipSep();
    if (i >= s.length) break;

    if (s.startsWith('media:', i)) {
      i += 'media:'.length;
      const start = i;
      const consumeMediaClause = () => {
        if (s[i] === '(') {
          let depth = 0;
          while (i < s.length) {
            if (s[i] === '(') depth++;
            else if (s[i] === ')') {
              depth--;
              if (depth === 0) {
                i++;
                break;
              }
            }
            i++;
          }
          return;
        }
        while (i < s.length && !/[\s,+|]/.test(s[i]!)) i++;
      };
      consumeMediaClause();
      // Compound queries: `and` / `or` / `not` + further clauses
      while (true) {
        const save = i;
        while (i < s.length && /\s/.test(s[i]!)) i++;
        const rest = s.slice(i).toLowerCase();
        if (
          rest.startsWith('and ') ||
          rest.startsWith('or ') ||
          rest.startsWith('not ') ||
          rest.startsWith('(')
        ) {
          if (rest.startsWith('and ')) i += 4;
          else if (rest.startsWith('or ')) i += 3;
          else if (rest.startsWith('not ')) i += 4;
          while (i < s.length && /\s/.test(s[i]!)) i++;
          consumeMediaClause();
        } else {
          i = save;
          break;
        }
      }
      const query = s.slice(start, i).trim();
      if (query && !mediaQueries.includes(query)) mediaQueries.push(query);
      continue;
    }

    if (s.startsWith('event:', i)) {
      i += 'event:'.length;
      const start = i;
      while (i < s.length && !/[\s,+|]/.test(s[i]!)) i++;
      const name = s.slice(start, i).trim();
      if (name && !events.includes(name)) events.push(name);
      continue;
    }

    const start = i;
    while (i < s.length && !/[\s,+|]/.test(s[i]!)) i++;
    const word = s.slice(start, i).trim().toLowerCase();
    if (NAMED.has(word as NamedTrigger) && !named.includes(word as NamedTrigger)) {
      named.push(word as NamedTrigger);
    }
  }

  if (!named.length && !events.length) {
    named.push('visible');
  }

  return { named, events, mediaQueries };
}
