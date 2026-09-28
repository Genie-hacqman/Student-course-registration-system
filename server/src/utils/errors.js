export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = undefined) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

/** Too many attempts for one account (sign-in lockout), as opposed to the per-IP rate limiter. */
export class TooManyAttemptsError extends AppError {
  constructor(message, code = 'TOO_MANY_ATTEMPTS') {
    super(message, 429, code);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', details) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

/** Raised when one or more registration business rules fail. `details` holds every failed rule. */
export class RegistrationRuleError extends AppError {
  constructor(failures) {
    super('Registration rules not satisfied', 422, 'REGISTRATION_RULES_FAILED', failures);
  }
}
