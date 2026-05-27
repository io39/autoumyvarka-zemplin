/**
 * Typed auth errors. Server Actions and pages map these to 401/403 views
 * (spec 01 §2.6). Never leak internals to the client — these carry Slovak,
 * user-safe messages.
 */

export class UnauthenticatedError extends Error {
  readonly code = "UNAUTHENTICATED" as const;
  constructor(message = "Neoverená identita.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;
  constructor(message = "Nemáte oprávnenie na túto akciu.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function isUnauthenticatedError(e: unknown): e is UnauthenticatedError {
  return e instanceof UnauthenticatedError;
}

export function isForbiddenError(e: unknown): e is ForbiddenError {
  return e instanceof ForbiddenError;
}
