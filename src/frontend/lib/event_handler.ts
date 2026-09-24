/**
 * Add events here only.
 *
 * 1. Add a member to `EventType` (English identifier — this is the event name).
 * 2. Add a matching entry to {@link EventDetailMap} with its detail shape.
 *
 * Use `undefined` when there is no detail — callers may omit the second argument.
 * Forgetting a map entry is a compile-time error.
 */
export enum EventType {
  EVENT_TRIGGER = 'event_trigger:click',
  MENU_DRAWER_OPEN = 'menu_drawer:open',
}

export interface EventDetailMap {
  [EventType.EVENT_TRIGGER]: undefined;
  [EventType.MENU_DRAWER_OPEN]: undefined;
}

export type EventDetail<T extends EventType> = EventDetailMap[T];

/**
 * @typeParam T — inferred from `type` so `detail` becomes `EventDetailMap[T]`.
 * Detail is optional when that map entry is `undefined`.
 */
export function dispatch<T extends EventType>(
  type: T,
  ...[detail]: undefined extends EventDetailMap[T]
    ? [detail?: EventDetailMap[T]]
    : [detail: EventDetailMap[T]]
): void {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}
