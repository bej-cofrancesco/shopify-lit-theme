import type { ZodError } from 'zod';

export class InvalidEventError extends Error {
  constructor(event?: unknown) {
    const received =
      event === undefined || event === null || event === '' ? 'missing' : JSON.stringify(event);
    super(
      `[InvalidEventError] Invalid event type (${received}). Add it to EventRegistry in event_handler.ts.`,
    );
    this.name = 'InvalidEventError';
  }
}

export class InvalidEventDetailError extends Error {
  readonly zodError?: ZodError;

  constructor(event: string, detail: unknown, zodError?: ZodError) {
    const issues = zodError
      ? ` ${zodError.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`
      : '';
    super(
      `[InvalidEventDetailError] Detail for "${event}" is invalid.${issues} Received: ${JSON.stringify(detail)}`,
    );
    this.name = 'InvalidEventDetailError';
    this.zodError = zodError;
  }
}
