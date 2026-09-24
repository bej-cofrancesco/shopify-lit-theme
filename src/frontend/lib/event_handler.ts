export enum EventType {
  EVENT_TRIGGER = 'event_trigger:click',
}

export function dispatch<T>(type: EventType, detail: T): void {
  const customEvent = new CustomEvent(type, { detail });
  window.dispatchEvent(customEvent);
}
