import { InvalidEventError } from '@frontend/lib/error';

/**
 * App-wide window CustomEvent names.
 * Add a value here, then add the matching detail shape in {@link EventDetailMap}.
 */
export enum EventType {
  EVENT_TRIGGER = 'event_trigger:click',
  MENU_DRAWER_OPEN = 'menu_drawer:open',
}

/**
 * Detail payload for each {@link EventType}.
 * Use `undefined` when there is no detail — callers may omit the second argument.
 */
export interface EventDetailMap {
  [EventType.EVENT_TRIGGER]: undefined;
  [EventType.MENU_DRAWER_OPEN]: undefined;
}

export type EventDetail<T extends EventType> = EventDetailMap[T];

function isEventType(value: unknown): value is EventType {
  return (
    typeof value === 'string' &&
    (Object.values(EventType) as string[]).includes(value)
  );
}

/**
 * @typeParam T — inferred from `type` (e.g. `EventType.MENU_DRAWER_OPEN`)
 * so `detail` becomes `EventDetailMap[T]`.
 *
 * Detail is optional when that map entry is `undefined`.
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
  window.dispatchEvent(new CustomEvent(type, { detail }));
}
