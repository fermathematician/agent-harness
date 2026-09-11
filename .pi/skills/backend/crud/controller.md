# Controller

## Purpose

A Controller is the HTTP boundary of one application use case.

Its flow is:

```text
HTTP request
  ↓
extract validated input
  ↓
call Service
  ↓
return HTTP response
```

Controllers handle transport concerns only.

Business rules belong to Services.

Persistence belongs to Repositories.

## Structure

Prefer one Controller per use case.

Use `handle()` as the standard entry point.

```ts
export class CreateUserController {
  constructor(private readonly createUserService: CreateUserService) {}

  async handle(request: Request, response: Response): Promise<Response> {
    const { name, email } = request.body;

    const user = await this.createUserService.execute({
      name,
      email,
    });

    return response.status(201).json(user);
  }
}
```

Keep the convention:

```text
Controller.handle()
  ↓
Service.execute()
```

## Dependencies

Inject the required Service through the constructor.

Do not instantiate Services inside `handle()`.

A Controller should normally depend on one cohesive Service for the HTTP action.

Do not use Controllers to orchestrate unrelated Services.

## Input

Convert HTTP input into explicit application input.

Allowed sources include:

```text
request.body
request.params
request.query
authenticated request context
```

Extract only what the Service requires.

Prefer:

```ts
await service.execute({
  userId,
  email,
});
```

Do not pass:

```ts
service.execute(request);
service.execute(request.body);
service.execute(request.query);
```

unless the application input intentionally has that exact validated shape.

Express-specific objects must not leak into Services.

## Validation

Follow the project validation convention before invoking the Service.

Structural validation includes:

```text
request shape
required fields
primitive types
formats
route params
query parsing
```

Business validation does not belong in the Controller.

Do not check:

```text
duplicate resources
resource permissions
business eligibility
balance or stock rules
valid state transitions
```

Those belong to the Service.

## Authentication context

If authentication middleware adds identity information to the request, extract only application-relevant values.

Example:

```ts
await service.execute({
  authenticatedUserId: request.user.id,
});
```

Do not pass token, session, middleware, or request infrastructure into the Service.

## Success response

The Controller owns the successful HTTP representation.

It may choose:

```text
status code
response body
headers
cookies
redirects
file/stream representation
```

Example:

```ts
const user = await this.createUserService.execute({
  name,
  email,
});

return response.status(201).json(user);
```

Here:

```text
Service
→ returns the created user

Controller
→ translates success into HTTP 201 + JSON
```

The Service must not return HTTP-specific data such as:

```ts
{
  statusCode: 201,
  body: user,
}
```

Use the HTTP status appropriate to the endpoint semantics.

## Response data

Return an intentional public response shape.

Do not expose sensitive or internal persistence fields accidentally.

When response transformation is required, follow the project's Presenter or Response DTO convention.

Do not turn the Controller into a large response-mapping layer.

## Errors

Do not catch every Service error.

Expected `AppError` failures must propagate to the global error middleware.

Unexpected errors should also normally propagate.

Catch an error inside a Controller only when transport-specific handling is intentionally required.

Do not duplicate global error handling in every Controller.

## Persistence boundary

Controllers must not:

```text
access Prisma
query the database
call Repository methods directly
```

All application persistence must be reached through the Service.

## Transport boundary

Express belongs at the HTTP boundary.

Types such as:

```ts
Request;
Response;
NextFunction;
```

must not appear in Services or Repositories.

HTTP-specific transformations are allowed in Controllers when they merely convert transport representation into application input.

Do not perform transformations that encode business decisions.

## Naming

Prefer:

```text
CreateUserController
GetUserController
ListUsersController
UpdateUserController
DeleteUserController
DeactivateUserController
```

Avoid generic Controllers with many unrelated action methods.

Use `handle()` consistently.

## Keep Controllers thin

A Controller should normally read as:

```text
extract input
  ↓
call Service
  ↓
return response
```

Thin means focused on HTTP concerns, not a specific number of lines.

If the Controller contains business conditionals, persistence logic, or significant application orchestration, move that logic to the appropriate layer.

## Rules

- One Controller represents one HTTP-facing use case.
- Use `handle()` consistently.
- Inject the required Service.
- Do not instantiate Services inside the Controller.
- Extract only input required by the Service.
- Convert HTTP input into application-specific input.
- Never pass Express infrastructure into Services.
- Follow the validation convention for structural input.
- Keep business validation in Services.
- Extract authenticated identity as application data only.
- Let the Controller own successful HTTP representation.
- Do not let Services return HTTP-specific results.
- Let `AppError` propagate to the global error middleware.
- Do not duplicate error handling across Controllers.
- Never access Prisma from a Controller.
- Never call Repositories directly from a Controller.
- Do not orchestrate unrelated Services in a Controller.
- Do not expose sensitive or unnecessary internal data.
- Use Presenter / Response DTO conventions when transformation is required.
- Keep Express-specific types inside the HTTP layer.
- Keep `handle()` readable and transport-focused.
