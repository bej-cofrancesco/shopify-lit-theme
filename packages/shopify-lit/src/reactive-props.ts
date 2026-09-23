import type { LitElement } from 'lit';

const proxyCache = new WeakMap<object, object>();

function isPlainObject(value: unknown): value is Record<string | symbol, unknown> {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-ish reactive wrapper: nested `props.foo = x` / `props.foo.bar = x`
 * calls `host.requestUpdate()` so Lit re-renders.
 *
 * Lit only observes replacing `this.props` by default; this makes field
 * mutation work for the usual Shopify props JSON shape.
 */
export function reactiveProps<T extends object>(host: LitElement, data: T): T {
  return wrap(host, { ...(data as object) }) as T;
}

function wrap(host: LitElement, target: object): object {
  const cached = proxyCache.get(target);
  if (cached) return cached;

  const proxy = new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (prop === 'toJSON') {
        return () => ({ ...obj });
      }
      if (isPlainObject(value) || Array.isArray(value)) {
        return wrap(host, value as object);
      }
      return value;
    },

    set(obj, prop, value, receiver) {
      const prev = Reflect.get(obj, prop, receiver);
      if (Object.is(prev, value)) return true;

      const next =
        isPlainObject(value) || Array.isArray(value)
          ? structuredCloneSafe(value)
          : value;

      const ok = Reflect.set(obj, prop, next, receiver);
      host.requestUpdate();
      return ok;
    },

    deleteProperty(obj, prop) {
      if (!Reflect.has(obj, prop)) return true;
      const ok = Reflect.deleteProperty(obj, prop);
      host.requestUpdate();
      return ok;
    },
  });

  proxyCache.set(target, proxy);
  proxyCache.set(proxy, proxy);
  return proxy;
}

function structuredCloneSafe<V>(value: V): V {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // fall through
    }
  }
  if (Array.isArray(value)) return [...value] as V;
  if (isPlainObject(value)) return { ...value } as V;
  return value;
}

/** Unwrap proxies / ensure a plain object for JSON attribute serialization. */
export function plainProps<T extends object>(value: T | null | undefined): T {
  if (value == null) return {} as T;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return { ...(value as object) } as T;
  }
}
