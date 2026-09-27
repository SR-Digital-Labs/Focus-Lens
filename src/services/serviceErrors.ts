import type { ServiceError, ServiceErrorCode } from './contracts';

export class FocusLensServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly details?: unknown;

  constructor(
    code: ServiceErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'FocusLensServiceError';
    this.code = code;
    this.details = details;
  }
}

export function toServiceError(error: unknown): FocusLensServiceError {
  if (error instanceof FocusLensServiceError) {
    return error;
  }

  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    const serviceError = error as ServiceError;
    return new FocusLensServiceError(serviceError.code, serviceError.message, serviceError.details);
  }

  return new FocusLensServiceError(
    'REQUEST_FAILED',
    error instanceof Error ? error.message : 'The native service request failed.',
    error,
  );
}