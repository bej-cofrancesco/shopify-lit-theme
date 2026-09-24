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
 */
export enum EventType {
  EVENT_TRIGGER = 'event_trigger:click',
  MENU_DRAWER_OPEN = 'menu_drawer:open',
}

export const EventRegistry = {
  [EventType.EVENT_TRIGGER]: z.undefined(),
  [EventType.MENU_DRAWER_OPEN]: z.string(),
} satisfies Record<EventType, z.ZodType>;

export type EventDetailMap = {
  [K in EventType]: z.infer<(typeof EventRegistry)[K]>;
};

export type EventDetail<T extends EventType> = EventDetailMap[T];

function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && (Object.values(EventType) as string[]).includes(value);
}

/** Runtime shape check against the Zod schema in {@link EventRegistry}. */
export function isDetailType<T extends EventType>(
  type: T,
  detail: unknown,
): detail is EventDetailMap[T] {
  return EventRegistry[type].safeParse(detail).success;
}

/**
 * @typeParam T — inferred from `type` so `detail` becomes `EventDetailMap[T]`.
 * Detail is optional when the registry schema is `z.undefined()`.
 */
export function dispatch<T extends EventType>(
  type: T,
  ...[detail]: undefined extends EventDetailMap[T]
    ? [detail?: EventDetailMap[T]]
    : [detail: EventDetailMap[T]]
): void {
  if (!isEventType(type)) {
    throw new InvalidEventError(type);
  }
  if (!isDetailType(type, detail)) {
    throw new InvalidEventDetailError(type, detail);
  }
  window.dispatchEvent(new CustomEvent(type, { detail }));
}
