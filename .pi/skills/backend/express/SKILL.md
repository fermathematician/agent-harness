---
name: express
description: Express conventions for backend HTTP setup, routers, middleware, request context, controllers, and error handling.
---

# Express

## Purpose

Use Express only at the HTTP boundary.

```text
Express
├── app/server
├── Router
├── middleware
├── Request / Response
└── error handler
```

Express-specific objects and behavior should not leak into application or persistence layers.

```text
Route / Middleware / Controller
              ↓
           Express

Service / Repository
              ↓
        Express-independent
```

## App and server

Keep application configuration separate from server startup when practical.

```ts
// app.ts

const app = express();

app.use(express.json());

app.use(routes);

app.use(errorHandler);

export { app };
```

```ts
// server.ts

import { app } from "./app";

app.listen(PORT);
```

`app.ts` configures the HTTP application.

`server.ts` starts the process.

Do not mix application business logic into either file.

## Routers

Use `Router` to group cohesive endpoints.

```ts
const usersRouter = Router();

usersRouter.post(
  "/",
  validate({
    body: createUserBodySchema,
  }),
  createUserController.handle,
);
```

Mount feature routers explicitly.

```ts
routes.use("/users", usersRouter);

routes.use("/sessions", sessionsRouter);
```

Keep route handlers declarative.

Do not place Prisma queries or business rules directly in route callbacks.

Follow the project's architecture Route conventions.

## Middleware order

Middleware order is semantic.

For a protected endpoint, prefer:

```text
Route
  ↓
Authentication
  ↓
Broad Authorization
  ↓
Validation
  ↓
Controller
```

Example:

```ts
router.patch(
  "/:userId",
  ensureAuthenticated,
  requireRole("ADMIN"),
  validate({
    params: userIdParamsSchema,
    body: updateUserBodySchema,
  }),
  updateUserController.handle,
);
```

Do not reorder middleware casually.

If one middleware depends on context created by another, the producer must execute first.

## Middleware responsibility

Middleware handles HTTP/request pipeline concerns.

Appropriate examples:

```text
authentication
broad authorization
validation
logging
request IDs
rate limiting
CORS
```

Middleware should not become a substitute for Services.

Resource-specific business authorization and domain decisions belong in Services.

## Request context

Middleware may attach trusted context to the request.

Examples:

```ts
request.auth;
request.validated;
```

Use TypeScript request augmentation when adding project-defined properties.

Conceptually:

```ts
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      validated?: ValidatedRequest;
    }
  }
}
```

Do not scatter unsafe casts such as:

```ts
request as any;
```

when the project can model the request type explicitly.

Only authentication middleware should establish trusted authentication context.

## Controllers

Controllers are the final Express-aware application boundary.

Typical signature:

```ts
handle = async (
  request: Request,
  response: Response,
) => {
  const result =
    await this.service.execute(...);

  return response.json(result);
};
```

Controllers may use:

```text
Request
Response
HTTP status codes
headers
cookies
validated request data
authentication context
```

Services should not.

Do not pass the entire Express `Request` object into a Service.

Prefer:

```ts
await service.execute({
  actorId: request.auth.userId,
  userId: request.validated.params.userId,
  data: request.validated.body,
});
```

## Async handlers

Use the project's established async error strategy consistently.

Errors raised by async Controllers must reach the global error handler.

Do not add local `try/catch` blocks merely to rethrow the same error.

Use local error handling only when the Controller genuinely needs to transform or recover from an HTTP-specific failure.

## AppError

Expected application failures may propagate from Services as `AppError`.

```text
Service
  ↓
AppError
  ↓
Express error handler
  ↓
HTTP response
```

Controllers should not repeatedly translate `AppError` manually.

## Global error handler

Register the error handler after Routes.

```ts
app.use(routes);

app.use(errorHandler);
```

Typical boundary:

```ts
export function errorHandler(
  error: Error,
  request: Request,
  response: Response,
  next: NextFunction,
) {
  if (error instanceof AppError) {
    return response.status(error.statusCode).json({
      message: error.message,
    });
  }

  return response.status(500).json({
    message: "Internal server error",
  });
}
```

Keep expected application failures distinguishable from unexpected failures.

Do not expose stack traces or internal error details to clients in production responses.

## 404

Handle unmatched routes consistently.

A 404 caused by:

```text
unknown HTTP endpoint
```

is different from:

```text
known endpoint
+
resource not found
```

The first belongs to the HTTP boundary.

The second normally originates from the application use case.

Do not confuse route-level 404 handling with resource existence checks.

## Body parsing

Configure parsers centrally.

```ts
app.use(express.json());
```

Apply explicit payload limits when appropriate for the application.

Do not repeatedly configure body parsing inside feature routers without a reason.

## Security-related HTTP configuration

Apply project-wide HTTP protections centrally when required.

Examples:

```text
CORS
request size limits
rate limiting
security headers
trusted proxy configuration
cookie configuration
```

Do not add dependencies or security middleware mechanically.

Configure them according to deployment requirements and existing project conventions.

## Express boundary

Allowed Express dependencies:

```text
app/server
routes
middleware
controllers
global HTTP error handler
```

Avoid Express dependencies in:

```text
services
repository contracts
repository implementations
domain/application models
infrastructure unrelated to HTTP
```

Forbidden examples:

```text
Service → Request
Service → Response

Repository → Request
Repository → Response

PrismaRepository → Express
```

Prefer:

```text
Controller
  ↓ plain application input
Service
  ↓
Repository
```

## Existing project first

Before changing Express setup, inspect:

```text
app/server bootstrap
router mounting
middleware order
request augmentation
async error handling
global error handler
404 handling
```

Follow coherent existing conventions.

Do not introduce a second routing, error-handling, or middleware pattern without a task-specific reason.

## Rules

- Keep Express at the HTTP boundary.
- Keep Services and Repositories Express-independent.
- Separate app configuration from server startup when practical.
- Group endpoints with cohesive Routers.
- Mount Routers explicitly and consistently.
- Treat middleware order as significant.
- Use middleware for request pipeline concerns, not business logic.
- Type project-defined Request context instead of relying on `any`.
- Do not pass Express `Request` or `Response` into Services.
- Keep Controllers thin and Express-aware.
- Let application errors propagate to centralized error handling.
- Register the global error handler after Routes.
- Distinguish unknown-route 404 from resource-not-found errors.
- Configure global HTTP behavior centrally.
- Do not introduce middleware or dependencies without a concrete need.
- Preserve coherent existing Express conventions.
