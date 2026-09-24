export class InvalidEventError extends Error {
  constructor() {
    super();
    this.message = '[InvalidEventError] Invalid event type, please add event to event_handler.ts';
    this.name = 'InvalidEventError';
  }
}
