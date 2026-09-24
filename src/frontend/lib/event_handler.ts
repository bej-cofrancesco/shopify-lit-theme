import { z } from 'zod';
import { InvalidEventDetailError, InvalidEventError } from '@frontend/lib/error';

/**
 * Add events here only.
 *
 * 1. Add a member to `EventType` (English identifier — this is the event name).
 * 2. Add a matching entry to `EventRegistry` with its Zod schema.
 *
 * The `satisfies Record<EventType, z.ZodType>` below forces every enum
 * member to have a schema — forgetting one is a compile-time error.
 *
 * Liquid `{% render %}` params are stringly — use {@link liquid} helpers so
 * registry entries declare the *real* detail type after coercion.
 */
export enum EventType {
  EVENT_TRIGGER = 'event_trigger:click',
  MENU_DRAWER_OPEN = 'menu_drawer:open',
}

/**
 * Coerce detail values that arrived via Liquid → `props` JSON.
 *
 * `| json` may already emit native JSON types (number, boolean, null), but
 * render string literals always arrive as strings — these helpers accept both.
 */
export const liquid = {
  /** No detail. Liquid nil → JSON `null`; also accepts `undefined` / `''`. */
  none: z.preprocess(
    (v) => (v == null || v === '' ? undefined : v),
    z.undefined(),
  ),

  string: z.string(),

  number: z.coerce.number(),

  /** Native bool from `| json`, or `"true"` / `"false"` / `"1"` / `"0"` strings. */
  boolean: z.union([z.boolean(), z.stringbool()]),

  /**
   * Object or array: JSON string from Liquid, or already-parsed value.
   * Pass the Zod shape of the *parsed* value.
   */
  json: <T extends z.ZodType>(schema: T) =>
    z.preprocess((val, ctx) => {
      if (typeof val !== 'string') return val;
      try {
        return JSON.parse(val) as unknown;
      } catch {
        ctx.issues.push({
          code: 'custom',
          message: 'Invalid JSON detail',
          input: val,
        });
        return val;
      }
    }, schema),
} as const;

export const EventRegistry = {
  [EventType.EVENT_TRIGGER]: liquid.none,
  [EventType.MENU_DRAWER_OPEN]: liquid.json(z.object({ message: z.string() })),
} satisfies Record<EventType, z.ZodType>;

export type EventDetailMap = {
  [K in EventType]: z.infer<(typeof EventRegistry)[K]>;
};

/** What callers may pass into {@link dispatch} (pre-coercion Liquid values). */
export type EventDetailInputMap = {
  [K in EventType]: z.input<(typeof EventRegistry)[K]>;
};

export type EventDetail<T extends EventType> = EventDetailMap[T];

function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && (Object.values(EventType) as string[]).includes(value);
}

/**
 * @typeParam T — inferred from `type` so `detail` becomes `EventDetailInputMap[T]`.
 * Detail is optional when the registry schema is `liquid.none`.
 * Coerced output is what listeners receive on `event.detail`.
 */
export function dispatch<T extends EventType>(
  type: T,
  ...[detail]: undefined extends EventDetailMap[T]
    ? [detail?: EventDetailInputMap[T]]
    : [detail: EventDetailInputMap[T]]
): void {
  if (!isEventType(type)) {
    throw new InvalidEventError(type);
  }
  const result = EventRegistry[type].safeParse(detail);
  if (!result.success) {
    throw new InvalidEventDetailError(type, detail, result.error);
  }
  window.dispatchEvent(new CustomEvent(type, { detail: result.data }));
}
