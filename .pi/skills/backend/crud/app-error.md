# AppError

## Purpose

Use `AppError` for expected application errors that must be translated into HTTP responses.

`AppError` represents an error that the application understands and intentionally exposes through an HTTP status code.

Unexpected errors must not be converted into `AppError` just to hide failures.

## AppError implementation

Use the following structure:

    export class AppError extends Error {
      public readonly statusCode: number;

      constructor(message: string, statusCode = 400) {
        super(message);

        this.name = "AppError";
        this.statusCode = statusCode;
      }
    }

Keep the implementation simple.

An `AppError` contains:

- `message`: human-readable description of the error
- `statusCode`: HTTP status returned to the client

The default status code is `400`.

## Where AppError is thrown

Business/application services are responsible for detecting expected failure conditions and throwing `AppError`.

Example:

    const user = await repository.findById(id);

    if (!user) {
      throw new AppError("User not found", 404);
    }

Another example:

    const existingUser = await repository.findByEmail(email);

    if (existingUser) {
      throw new AppError("Email already exists", 409);
    }

Do not move business decisions into the controller merely to determine which HTTP error to return.

## Controller behavior

Controllers should not catch every `AppError` individually.

Controllers should:

1. receive HTTP input;
2. extract the required data;
3. call the appropriate service;
4. return the successful response.

Errors thrown by services should propagate to the application's global error middleware.

Avoid patterns such as:

    try {
      await service.execute();
    } catch (error) {
      if (error instanceof AppError) {
        return response.status(error.statusCode).json(...);
      }
    }

in every controller.

Centralize this behavior in the error middleware.

## Global error middleware

Use a global Express error-handling middleware.

Example:

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

The exact Express types and project-specific imports may be adapted to the repository.

Do not expose unexpected internal error details to the client.

## Common status codes

Use HTTP status codes according to their semantics.

### 400 — Bad Request

Use when the request is invalid and no more specific application status is appropriate.

Example:

    throw new AppError("Invalid request", 400);

### 401 — Unauthorized

Use when authentication is required but the client is not authenticated.

Example:

    throw new AppError("Authentication required", 401);

### 403 — Forbidden

Use when the client is authenticated but does not have permission to perform the operation.

Example:

    throw new AppError("You cannot perform this operation", 403);

### 404 — Not Found

Use when the requested resource does not exist.

Example:

    throw new AppError("User not found", 404);

### 409 — Conflict

Use when the requested operation conflicts with the current application state.

Typical examples:

- duplicate email
- duplicate unique identifier
- resource already exists
- conflicting state

Example:

    throw new AppError("Email already exists", 409);

### 422 — Unprocessable Content

Use when the request is structurally valid but cannot be accepted because of application/domain rules.

Example:

    throw new AppError("User cannot be deactivated while orders are pending", 422);

### 500 — Internal Server Error

Use for unexpected server failures.

Normally, services should not deliberately convert unexpected failures into:

    throw new AppError("Internal server error", 500);

Unexpected errors should propagate to the global error middleware, which returns a generic 500 response.

## Success and infrastructure status codes

Do not use `AppError` for successful responses such as:

- 200 OK
- 201 Created
- 204 No Content

Redirect status codes such as 301 and 302 are also outside the responsibility of `AppError`.

Infrastructure/gateway errors such as 502, 503, and 504 should normally be handled by the appropriate infrastructure or integration layer rather than being used as ordinary business errors.

## Rules

When implementing application logic:

- throw `AppError` for expected application failures;
- prefer throwing it from the service where the business condition is detected;
- do not put business rules in controllers;
- do not access Prisma from the error middleware;
- do not duplicate AppError handling across controllers;
- let the global error middleware translate `AppError` into HTTP;
- let unexpected errors reach the global handler;
- return a generic 500 response for unexpected errors;
- never expose stack traces or internal implementation details to clients;
- choose the HTTP status according to the actual failure semantics;
- do not add additional AppError fields unless the task or existing project architecture requires them.

## Architecture

The expected flow is:

    Route
      ↓
    Controller
      ↓
    Service
      ↓
    Repository
      ↓
    Prisma
      ↓
    Database

For failures detected by application/business logic:

    Service
      ↓
    throw AppError
      ↓
    Global error middleware
      ↓
    HTTP response

`AppError` is the application's standard mechanism for representing expected errors across this flow.
