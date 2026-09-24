import type { ZodError, ZodIssue } from 'zod';

export class InvalidEventError extends Error {
  constructor(event?: unknown) {
    const received =
      event === undefined || event === null || event === ''
        ? 'missing'
        : JSON.stringify(event);
    super(
      `[InvalidEventError] Invalid event type (${received}). Add it to EventRegistry in event_handler.ts.`,
    );
    this.name = 'InvalidEventError';
  }
}

function tryParseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function formatIssue(issue: ZodIssue): string {
  const path = issue.path.map(String).join('.') || '(root)';

  // Zod reports missing object keys as invalid_type + "received undefined"
  if (
    issue.code === 'invalid_type' &&
    issue.path.length > 0 &&
    /received undefined/i.test(issue.message)
  ) {
    return `missing required key "${path}" (expected ${issue.expected})`;
  }

  if (issue.code === 'unrecognized_keys') {
    return `unrecognized key(s): ${issue.keys.join(', ')}`;
  }

  return `${path}: ${issue.message}`;
}

function keysPresentHint(detail: unknown): string {
  const parsed = tryParseJson(detail);
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return '';
  }
  const keys = Object.keys(parsed as object);
  return keys.length
    ? ` Keys present: ${keys.join(', ')}.`
    : ' Keys present: (none).';
}

export class InvalidEventDetailError extends Error {
  readonly zodError?: ZodError;

  constructor(event: string, detail: unknown, zodError?: ZodError) {
    const issues = zodError
      ? ` ${zodError.issues.map(formatIssue).join('; ')}.`
      : '';
    const keysHint = zodError ? keysPresentHint(detail) : '';
    super(
      `[InvalidEventDetailError] Detail for "${event}" is invalid.${issues}${keysHint} Received: ${JSON.stringify(detail)}`,
    );
    this.name = 'InvalidEventDetailError';
    this.zodError = zodError;
  }
}
