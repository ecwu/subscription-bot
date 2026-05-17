export class BotError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = "BotError";
  }
}

export class UnauthorizedError extends BotError {
  constructor(message = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "UnauthorizedError";
  }
}

export class ValidationError extends BotError {
  constructor(message = "Validation failed") {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends BotError {
  constructor(message = "Not found") {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}
