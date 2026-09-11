# AppError

## Purpose

Use `AppError` for expected application failures that should become HTTP error responses.

Do not convert unexpected errors into `AppError`.

## Implementation

Use:

```ts
export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
  }
}
```

Do not add additional fields unless the task or existing project architecture requires them.

## Usage

Throw `AppError` where the expected application failure is detected, normally in the Service.

```ts
const user = await userRepository.findById(id);

if (!user) {
  throw new AppError("User not found", 404);
}
```

```ts
const existingUser = await userRepository.findByEmail(email);

if (existingUser) {
  throw new AppError("Email already exists", 409);
}
```

Repositories must not throw `AppError` to represent business rules such as "user not found" or "email already exists".

Controllers must not catch `AppError` individually.

## Error flow

Expected application failure:

```text
Service
  ↓
throw AppError
  ↓
Global error middleware
  ↓
HTTP error response
```

Unexpected failure:

```text
Unexpected error
  ↓
Global error middleware
  ↓
generic 500 response
```

## Global error handler

Use one global HTTP error handler.

Conceptually:

```ts
export function errorHandler(error, request, response, next) {
  if (error instanceof AppError) {
    return response.status(error.statusCode).json({
      error: error.message,
    });
  }

  return response.status(500).json({
    error: "Internal server error",
  });
}
```

Adapt framework types and imports to the existing project.

Never expose unexpected error details, stack traces, database errors, or internal implementation details to clients.

## Status codes

Use status codes according to the actual failure semantics.

- `400` — invalid request when no more specific status applies.
- `401` — authentication required or invalid.
- `403` — authenticated but not permitted.
- `404` — requested resource does not exist.
- `409` — conflict with current state, such as duplicate unique data.
- `422` — structurally valid request rejected by an application/domain rule.

Do not deliberately wrap unexpected failures in:

```ts
throw new AppError("Internal server error", 500);
```

Let unexpected errors propagate to the global handler.

Do not use `AppError` for successful responses, redirects, or ordinary infrastructure/gateway failures.

## Boundaries

`AppError` represents expected application failures.

Structural HTTP input validation belongs to the project's validation convention.

Business decisions belong to Services.

Persistence errors belong to the persistence/infrastructure boundary unless explicitly translated by an established project convention.

HTTP translation belongs to the global error handler.

## Rules

- Throw `AppError` only for expected application failures.
- Prefer throwing it from the Service where the application condition is detected.
- Use `message` and `statusCode` as the standard shape.
- Do not implement business error decisions in Controllers.
- Do not throw business `AppError`s from Repositories.
- Do not duplicate `AppError` handling across Controllers.
- Let the global error handler translate `AppError` into HTTP.
- Let unexpected errors propagate to the global handler.
- Return a generic `500` for unexpected failures.
- Never expose internal error details to clients.
- Choose status codes according to failure semantics.
- Do not extend `AppError` unless the task or existing architecture requires it.
