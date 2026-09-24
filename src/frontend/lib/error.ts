export class InvalidEventError extends Error {
  constructor(event?: unknown) {
    const received =
      event === undefined || event === null || event === ''
        ? 'missing'
        : JSON.stringify(event);
    super(
      `[InvalidEventError] Invalid event type (${received}). Add it to EventType in event_handler.ts.`,
    );
    this.name = 'InvalidEventError';
  }
}
