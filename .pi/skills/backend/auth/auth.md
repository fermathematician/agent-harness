# Auth

## Purpose

Auth connects Authentication and Authorization across the application.

```text
Validation
→ Is the input structurally valid?

Authentication
→ Who is the actor?

Authorization
→ May this actor perform the operation?
```

Keep these responsibilities separate.

## Overall flow

```text
HTTP Request
  ↓
Authentication
  ↓
trusted actor
  ↓
Validation
  ↓
Controller
  ↓
Service
  ├── business rules
  └── resource-specific Authorization
  ↓
Repository
```

Broad Authorization may happen before the Controller:

```text
Authentication
  ↓
broad Authorization
  ↓
Controller
  ↓
Service
```

Middleware order may vary.

Responsibility boundaries must not.

## Authentication

Authentication converts credentials into trusted identity.

```text
credential
  ↓
verify
  ↓
request.auth
```

Never treat client input as authenticated identity.

```text
request.body.userId
→ client input

request.auth.userId
→ trusted actor
```

Follow `authentication.md` for implementation details.

## Authorization

Authorization decides what the trusted actor may do.

```text
actor + operation + resource
  ↓
allowed / denied
```

Use:

```text
broad/static authorization
→ middleware

ownership/resource authorization
→ Service
```

Follow `authorization.md` for implementation details.

## Actor vs target

Always distinguish:

```text
actor
→ who performs the operation

target
→ resource affected
```

Example:

```ts
service.execute({
  actorId: request.auth.userId,
  userId: request.validated.params.userId,
});
```

Authentication establishes `actorId`.

Authorization decides whether it may operate on `userId`.

## Layer boundaries

```text
Route
→ declares public/protected access
→ composes auth middleware

Controller
→ consumes request.auth
→ passes actor identity

Service
→ coordinates auth use cases
→ owns resource authorization

Repository
→ persistence only

Validation
→ structure only
```

Do not pass Express `Request` into Services.

Do not put authentication or authorization decisions in Repositories or request schemas.

## Login

Login is an application use case.

```text
POST /sessions
  ↓
Validation
  ↓
CreateSessionController
  ↓
CreateSessionService
  ├── UserRepository
  ├── PasswordHasher
  └── TokenProvider / SessionProvider
```

The Service coordinates the use case.

Infrastructure implements credential mechanics.

## Errors

```text
No valid identity
→ 401

Valid identity without permission
→ 403
```

Follow project convention when unauthorized resource access intentionally returns `404`.

## Security

Backend authorization is authoritative.

Frontend restrictions do not secure endpoints.

Never expose or log credentials, tokens, password hashes, or secrets.

## Rules

- Keep Validation, Authentication, and Authorization separate.
- Authentication establishes trusted identity.
- Authorization decides what that identity may do.
- Keep actor and target distinct.
- Use middleware for broad auth decisions.
- Use Services for resource-specific authorization.
- Pass actor identity explicitly into Services.
- Keep credential verification out of Controllers.
- Keep auth decisions out of Repositories and schemas.
- Treat login as an explicit use case.
- Use `401` for authentication failure and `403` for authorization failure.
