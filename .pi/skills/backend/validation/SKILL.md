---
name: validation
description: guide on how to formatting and boring regex patterns.
---

# Validation

## Purpose

Validation at the HTTP boundary ensures that incoming request data has the expected structure before it reaches the application use case.

Validate transport input such as:

- request body;
- route parameters;
- query parameters.

Validation answers questions about shape and primitive validity.

Examples:

```text
Is email present?
Is email a valid email string?
Is age a number?
Is userId a valid UUID?
Is page a positive integer?
Does the request contain the expected fields?
```

Validation does not implement business rules.

## Validation boundary

Use:

```text
HTTP Request
  ↓
Validation
  ↓
Controller
  ↓
Service
  ↓
Repository
  ↓
Database
```

Validation protects the application boundary from malformed input.

The Controller should normally receive structurally valid input.

## Structural vs business validation

Keep structural validation separate from business validation.

```text
Structural validation
→ "Is this input structurally valid?"

Business validation
→ "Is this operation allowed by the application?"

Persistence constraint
→ "Is database integrity preserved?"
```

Example:

```text
email = "gabriel@example.com"

Validation
→ Is it a string?
→ Is the format valid?

Service
→ Is it already registered?
→ May this user use it?

Database
→ Is email UNIQUE?
```

These are different responsibilities.

Use:

```text
Request schema
  ↓
structural validation
  ↓
Controller
  ↓
Service
  ↓
business validation
  ↓
Repository
  ↓
database constraints
```

Do not move business rules into request schemas merely because the validation library supports custom checks.

## What belongs in validation

Validation may check:

```text
required fields
primitive types
formats
UUIDs
number ranges
enum values
object/array shape
optional and nullable fields
query parsing
allowed fields
```

These checks should depend primarily on the request representation itself.

## What does not belong in validation

Do not use request validation to answer:

```text
Does this User exist?
Is this email already registered?
Does this User own this resource?
Can this Order be cancelled?
Is there enough balance?
Is this state transition allowed?
```

These are application decisions and normally belong to the Service.

Do not access Repository, Prisma, or database from request schemas to answer business questions.

Prefer:

```text
Schema
→ email format

Service
→ email uniqueness

Database
→ UNIQUE(email)
```

## Explicit schemas

Prefer explicit schemas for HTTP input.

Example:

```ts
const createUserBodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().nonnegative(),
});
```

The schema describes the HTTP contract.

Do not use Prisma models as request schemas.

Persistence models and HTTP inputs are different contracts.

Expose only fields intentionally accepted by the endpoint.

## Body, params, and query

Validate each relevant transport source.

```ts
const paramsSchema = z.object({
  userId: z.string().uuid(),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
});
```

A malformed identifier fails validation.

A valid identifier referring to no entity reaches the Service.

```text
invalid UUID
→ Validation

valid UUID + missing User
→ Service / AppError 404
```

Query parameters may also be parsed by validation:

```text
"20" → 20
"true" → true
```

Use the parsed values after validation rather than parsing the original input again.

## Validation middleware

Prefer reusable validation middleware.

```ts
validate({
  body: createUserBodySchema,
  params: userParamsSchema,
  query: listUsersQuerySchema,
});
```

Keep it focused on validating and parsing transport input.

Do not put entity-specific business rules inside generic validation middleware.

Use one consistent convention for exposing validated values.

## Controller and Service

Controllers should not repeat structural checks already guaranteed by validation.

Use:

```text
validated input
  ↓
Controller
  ↓
Service
```

The Service still enforces application invariants.

Do not use `AppError` as a substitute for request validation.

```text
malformed transport input
→ Validation

valid input rejected by application rule
→ Service / AppError
```

## Writable fields

Create and Update schemas expose only fields intentionally writable by that operation.

Do not pass arbitrary:

```ts
request.body;
```

directly into persistence.

Distinguish:

```text
required
optional
nullable
```

Choose a consistent convention for rejecting or stripping unknown fields.

## Separate concerns

Do not mix validation with authentication or authorization.

```text
Validation
→ Is the input structurally valid?

Authentication
→ Who is making the request?

Authorization
→ May they perform the operation?
```

`ensureAuthenticated` is not validation.

## Persistence constraints

Validation and Service checks do not replace database constraints.

```text
Validation → valid format
Service    → application rule
Database   → integrity constraint
```

Each protects a different boundary.

## Rules

- Validate HTTP input before the use case.
- Keep structural and business validation separate.
- Validate body, params, and query when relevant.
- Use explicit HTTP schemas.
- Do not use Prisma models as request schemas.
- Keep Repository, Prisma, and database access out of schemas.
- Use parsed values after validation.
- Prefer reusable validation middleware.
- Do not repeat structural checks in Controllers.
- Keep business invariants in Services.
- Use `AppError` for application failures, not malformed transport input.
- Expose only intentionally writable fields.
- Do not pass arbitrary request bodies into persistence.
- Keep authentication and authorization separate.
- Preserve database constraints for integrity.
