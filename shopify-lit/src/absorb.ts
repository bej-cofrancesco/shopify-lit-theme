import { render, nothing, type RenderOptions } from 'lit';
import { _$LH } from 'lit-html/private-ssr-support.js';

type ChildPart = InstanceType<typeof _$LH.ChildPart>;
type TemplateInstance = InstanceType<typeof _$LH.TemplateInstance>;

const PART = {
  ATTRIBUTE: 1,
  CHILD: 2,
  PROPERTY: 3,
  BOOLEAN_ATTRIBUTE: 4,
  EVENT: 5,
} as const;

type AnyPart = {
  type: number;
  element?: Element;
  name?: string;
  _$startNode?: ChildNode | null;
  _$endNode?: ChildNode | null;
  _$committedValue?: unknown;
  _$setValue?: (value: unknown, directiveParent?: unknown) => void;
};

type AbsorbOptions = RenderOptions & {
  host?: HTMLElement;
};

export type AbsorbResult = {
  /** Root ChildPart installed on the live container (for LitElement.__childPart). */
  rootPart: ChildPart;
};

/**
 * Absorb Liquid SSR DOM into lit-html so later `render()` updates patch in place.
 *
 * Requires lit-html **development** builds (unminified `_$` fields) — see vite aliases.
 */
export function absorbRender(
  container: HTMLElement | DocumentFragment,
  value: unknown,
  options: AbsorbOptions = {},
): AbsorbResult | null {
  const live = container as HTMLElement & { _$litPart$?: ChildPart };
  const host = (options.host ?? (live as HTMLElement)) as HTMLElement;
  const renderOpts = { host, isConnected: options.isConnected };

  if (live._$litPart$ !== undefined) {
    render(value, container, renderOpts);
    return { rootPart: live._$litPart$ };
  }

  if (value === nothing || value == null) {
    bindDataLitOn(host, container);
    return null;
  }

  // Staging tree — never pass LitElement.renderBefore (points at SSR children)
  const stage = document.createElement('div');
  render(value, stage, renderOpts);

  const rootPart = (stage as HTMLElement & { _$litPart$?: ChildPart })._$litPart$;
  if (!rootPart) {
    console.warn('[shopify-lit] absorb: no root part on stage');
    bindDataLitOn(host, container);
    return null;
  }

  const elMap = buildElementMap(stage, container);

  // Root range: marker … end of live children
  const rootStart = document.createComment('');
  container.insertBefore(rootStart, container.firstChild);
  (rootPart as unknown as AnyPart)._$startNode = rootStart;
  (rootPart as unknown as AnyPart)._$endNode = null;

  const committed = (rootPart as unknown as AnyPart)._$committedValue;
  if (isTemplateInstance(committed)) {
    for (const sub of committed._$parts) {
      if (sub) retargetPart(sub as AnyPart, stage, container, elMap, host);
    }
  } else {
    console.warn('[shopify-lit] absorb: root committed value is not a TemplateInstance');
  }

  live._$litPart$ = rootPart;
  delete (stage as HTMLElement & { _$litPart$?: ChildPart })._$litPart$;
  stage.replaceChildren();

  // Any events Lit didn't re-home
  bindDataLitOn(host, container);

  return { rootPart };
}

function isTemplateInstance(value: unknown): value is TemplateInstance {
  return (
    !!value &&
    typeof value === 'object' &&
    '_$template' in value &&
    Array.isArray((value as TemplateInstance)._$parts)
  );
}

function collectElements(root: ParentNode): Element[] {
  const out: Element[] = [];
  const walk = (parent: ParentNode) => {
    for (const el of parent.children) {
      out.push(el);
      walk(el);
    }
  };
  walk(root);
  return out;
}

function buildElementMap(stage: ParentNode, live: ParentNode): Map<Element, Element> {
  const stageEls = collectElements(stage);
  const liveEls = collectElements(live);
  const map = new Map<Element, Element>();
  const n = Math.min(stageEls.length, liveEls.length);
  for (let i = 0; i < n; i++) {
    if (stageEls[i].localName === liveEls[i].localName) {
      map.set(stageEls[i], liveEls[i]);
    }
  }
  if (stageEls.length !== liveEls.length) {
    console.warn(
      `[shopify-lit] absorb: element count mismatch stage=${stageEls.length} live=${liveEls.length}`,
    );
  }
  return map;
}

function liveParentOf(
  stageNode: Node,
  stageRoot: Node,
  liveRoot: ParentNode,
  elMap: Map<Element, Element>,
): ParentNode | null {
  const parent = stageNode.parentNode;
  if (!parent) return null;
  if (parent === stageRoot) return liveRoot;
  if (parent instanceof Element) return elMap.get(parent) ?? null;
  return null;
}

function retargetPart(
  part: AnyPart,
  stageRoot: Node,
  liveRoot: ParentNode,
  elMap: Map<Element, Element>,
  host: HTMLElement,
): void {
  if (part.type === PART.CHILD) {
    adoptChildPart(part, stageRoot, liveRoot, elMap, host);
    return;
  }

  if (!part.element) return;
  const liveEl = elMap.get(part.element);
  if (!liveEl) {
    console.warn('[shopify-lit] absorb: no live element for part', part.type, part.name);
    return;
  }

  if (part.type === PART.EVENT) {
    migrateEventPart(part, liveEl);
    liveEl.removeAttribute(`data-lit-on-${part.name}`);
    return;
  }

  part.element = liveEl;

  // Re-commit boolean/attr/property onto the live node so Lit's dirty state matches DOM
  if (
    part.type === PART.BOOLEAN_ATTRIBUTE ||
    part.type === PART.ATTRIBUTE ||
    part.type === PART.PROPERTY
  ) {
    const value = part._$committedValue;
    // Clear committed so next _$setValue from a real update isn't skipped incorrectly;
    // for absorb we just need element pointed at live — values already match SSR.
    if (part.type === PART.PROPERTY && part.name) {
      (liveEl as unknown as Record<string, unknown>)[part.name] =
        value === nothing ? undefined : value;
    }
  }
}

function adoptChildPart(
  part: AnyPart,
  stageRoot: Node,
  liveRoot: ParentNode,
  elMap: Map<Element, Element>,
  host: HTMLElement,
): void {
  const stageStart = part._$startNode;
  if (!stageStart) {
    console.warn('[shopify-lit] absorb: ChildPart missing _$startNode');
    return;
  }

  const liveParent = liveParentOf(stageStart, stageRoot, liveRoot, elMap);
  if (!liveParent) {
    console.warn('[shopify-lit] absorb: no live parent for ChildPart');
    return;
  }

  const committed = part._$committedValue;
  const start = document.createComment('');
  const end = document.createComment('');

  if (isTemplateInstance(committed)) {
    const liveEls: Element[] = [];
    for (
      let n: ChildNode | null = stageStart.nextSibling;
      n && n !== part._$endNode;
      n = n.nextSibling
    ) {
      if (n.nodeType === 1) {
        const live = elMap.get(n as Element);
        if (live) liveEls.push(live);
      }
    }

    if (liveEls.length > 0) {
      liveParent.insertBefore(start, liveEls[0]);
      liveParent.insertBefore(end, liveEls[liveEls.length - 1].nextSibling);
    } else {
      liveParent.append(start, end);
    }

    part._$startNode = start;
    part._$endNode = end;

    for (const sub of committed._$parts) {
      if (sub) retargetPart(sub as AnyPart, stageRoot, liveRoot, elMap, host);
    }
    return;
  }

  if (Array.isArray(committed)) {
    // Iterable — rare in our components; mark empty range and adopt each item part
    liveParent.append(start, end);
    part._$startNode = start;
    part._$endNode = end;
    for (const item of committed as AnyPart[]) {
      if (item) adoptChildPart(item, stageRoot, liveRoot, elMap, host);
    }
    return;
  }

  // Text / primitive — wrap the existing live text node
  let textNode: Text | null = null;
  for (const child of liveParent.childNodes) {
    if (child.nodeType === 3 && (child.textContent?.trim() ?? '') !== '') {
      textNode = child as Text;
      break;
    }
  }
  if (!textNode) {
    textNode = document.createTextNode(
      committed == null || committed === nothing ? '' : String(committed),
    );
    liveParent.append(textNode);
  }

  liveParent.insertBefore(start, textNode);
  liveParent.insertBefore(end, textNode.nextSibling);
  part._$startNode = start;
  part._$endNode = end;
}

/**
 * EventPart uses itself as EventListenerObject (handleEvent).
 * Move that listener from the staging element onto the live element.
 */
function migrateEventPart(part: AnyPart, nextEl: Element): void {
  const prevEl = part.element;
  const listener = part._$committedValue;

  if (prevEl && prevEl !== nextEl) {
    prevEl.removeEventListener(part.name!, part as unknown as EventListenerObject);
    if (listener != null && listener !== nothing && typeof listener === 'object') {
      prevEl.removeEventListener(
        part.name!,
        part as unknown as EventListenerObject,
        listener as AddEventListenerOptions,
      );
    }
  }

  part.element = nextEl;

  if (listener != null && listener !== nothing) {
    // Match lit-html EventPart: third arg is the listener value (options or function)
    nextEl.addEventListener(
      part.name!,
      part as unknown as EventListenerObject,
      listener as AddEventListenerOptions,
    );
  }
}

/** Fallback for any remaining Liquid `data-lit-on-*` attrs. */
export function bindDataLitOn(host: HTMLElement, root: ParentNode): void {
  const nodes = root.querySelectorAll('*');
  for (const node of nodes) {
    for (const attr of [...node.attributes]) {
      const match = /^data-lit-on-(.+)$/.exec(attr.name);
      if (!match) continue;

      const methodName = attr.value;
      const handler = (host as unknown as Record<string, unknown>)[methodName];
      if (typeof handler === 'function') {
        node.addEventListener(
          match[1],
          (handler as (this: HTMLElement, ev: Event) => void).bind(host),
        );
      } else {
        console.warn(
          `[shopify-lit] data-lit-on-${match[1]}="${methodName}" — no method on host`,
        );
      }
      node.removeAttribute(attr.name);
    }
  }
}
