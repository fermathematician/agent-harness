---
name: auth
description: Backend authentication and authorization conventions, including trusted actor context, login flow, middleware boundaries, and resource-specific permission checks.
---

# Auth

## Purpose

Keep these responsibilities separate:

```text
Validation
→ Is the input structurally valid?

Authentication
→ Who is the actor?

Authorization
→ May this actor perform the operation?
```

Overall flow:

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

Broad authorization may happen before the Controller:

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

---

# Authentication

## Purpose

Authentication establishes the trusted identity of the actor.

It answers:

```text
Who is making the request?
```

It does not decide permission.

## Boundary

Authenticate protected requests at the HTTP entry boundary.

```text
credential
  ↓
extract
  ↓
verify
  ↓
trusted identity
  ↓
request.auth
```

Application code should consume established identity instead of repeatedly parsing credentials.

Make public and protected routes explicit.

## Trusted actor

Expose a small trusted context.

```ts
interface AuthContext {
  userId: string;
}
```

Add fields such as:

```text
sessionId
tenantId
role
```

only when required.

Always distinguish trusted identity from client input.

```text
request.body.userId
→ untrusted input

request.auth.userId
→ trusted actor
```

Never treat a body, param, query, or header value supplied by the client as proof of actor identity.

## Authentication middleware

Authentication middleware should:

```text
extract credentials
verify credentials
establish trusted identity
populate request.auth
```

It should not implement:

```text
ownership
resource-specific authorization
business rules
```

Example:

```ts
router.patch(
  "/users/:userId",
  ensureAuthenticated,
  validate({
    params: userParamsSchema,
    body: updateUserBodySchema,
  }),
  updateUserController.handle,
);
```

## Token authentication

When using signed tokens:

```text
receive token
  ↓
verify signature
  ↓
verify required claims
  ↓
verify expiration
  ↓
extract trusted identity
```

Do not merely decode and trust a token.

Only verified claims may enter `request.auth`.

Follow the project's existing policies for:

```text
token lifetime
refresh
revocation
issuer
audience
```

If access and refresh tokens exist:

```text
access token
→ authenticate protected requests

refresh token
→ obtain a new access token
```

Do not use refresh tokens as access tokens.

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

The Controller receives validated credentials.

The Service coordinates the login use case.

Infrastructure implements credential mechanics.

Do not verify passwords or issue tokens directly in Controllers.

## Credential infrastructure

Use application-facing abstractions where appropriate.

```ts
interface PasswordHasher {
  hash(value: string): Promise<string>;

  compare(value: string, hash: string): Promise<boolean>;
}
```

```ts
interface TokenProvider {
  sign(payload: TokenPayload): Promise<string>;

  verify(token: string): Promise<TokenPayload>;
}
```

Keep concrete hashing, token, and session libraries outside application Services.

## Layer boundaries

Controller:

```text
consumes request.auth
passes actor identity to Service
does not verify credentials
```

Service:

```text
coordinates authentication use cases
receives actor identity explicitly
does not receive Express Request
```

Repository:

```text
loads persistence state
does not authenticate requests
```

Validation:

```text
validates structure
does not authenticate
```

## Authentication failures

Use:

```text
missing or invalid identity
→ 401
```

Expected failures may use:

```ts
throw new AppError("Invalid credentials", 401);
```

Do not convert unexpected infrastructure failures into fake authentication failures.

---

# Authorization

## Purpose

Authorization decides whether an authenticated actor may perform an operation.

```text
Authentication
→ Who is the actor?

Authorization
→ May this actor perform this operation?
```

A valid identity does not imply permission.

Authorization may depend on:

```text
actor
operation
role
permission
ownership
tenant
target resource
resource state
```

## Actor vs target

Always distinguish:

```text
actor
→ who performs the operation

target
→ resource affected by the operation
```

Example:

```ts
await updateUserService.execute({
  actorId: request.auth.userId,

  userId: request.validated.params.userId,

  name: request.validated.body.name,
});
```

Here:

```text
actorId
→ authenticated identity

userId
→ target User
```

Authentication establishes the actor.

Authorization decides what that actor may do to the target.

## Broad authorization

Use middleware when the decision depends only on information already available at the HTTP boundary.

Examples:

```text
authenticated?
has ADMIN role?
has reports:read permission?
```

Example:

```ts
router.get(
  "/admin/users",
  ensureAuthenticated,
  ensureRole("ADMIN"),
  listUsersController.handle,
);
```

Keep middleware authorization broad and transport-level.

Do not make generic middleware load arbitrary domain resources just to reproduce application rules.

## Resource-specific authorization

Use the Service when authorization depends on application or resource context.

Examples:

```text
Does actor own this resource?

Does actor belong to the same tenant?

May actor modify this Order in its current state?

May this manager approve this Invoice?
```

Conceptually:

```text
Service
  ↓
load resource
  ↓
evaluate authorization
  ↓
apply business rules
  ↓
perform operation
```

Example:

```ts
const order = await this.orderRepository.findById(orderId);

if (!order) {
  throw new AppError("Order not found", 404);
}

if (order.userId !== actorId) {
  throw new AppError("Forbidden", 403);
}
```

If the authorization decision requires loading a resource, it usually belongs in the Service.

## Ownership

Ownership is resource-specific authorization.

Example:

```text
User may update their own profile.
```

Possible check:

```ts
if (actorId !== userId) {
  throw new AppError("Forbidden", 403);
}
```

Do not move ownership checks into authentication middleware merely to execute them earlier.

## Middleware vs Service

Use middleware for broad/static decisions.

```text
route requires ADMIN
route requires reports:read
```

Use the Service when the decision depends on:

```text
target resource
ownership
tenant membership
resource state
business relationship
operation-specific rules
```

A request may use both:

```text
Authentication middleware
  ↓
broad Authorization middleware
  ↓
Controller
  ↓
Service
  ↓
resource-specific Authorization
```

Do not duplicate the same authorization rule in both places.

## Authorization vs business rules

Keep the concepts distinct even when both are checked by the same Service.

```text
Only managers may approve invoices.
→ Authorization

Only pending invoices may be approved.
→ Business rule
```

The Service may enforce both.

## Layer boundaries

Route:

```text
declares public/protected access
composes auth middleware
```

Controller:

```text
consumes trusted request.auth
passes actor identity explicitly
```

Service:

```text
coordinates auth use cases
owns resource-specific authorization
owns application decisions
```

Repository:

```text
persistence only
does not decide permission
```

Validation:

```text
structure only
does not decide permission
```

Do not place authorization rules in schemas or Repositories.

Do not pass Express `Request` into Services.

## Authorization failures

Use:

```text
no valid identity
→ 401

valid identity without permission
→ 403
```

Follow project convention when unauthorized resource access intentionally returns `404`.

---

# Security

Backend authorization is authoritative.

Frontend restrictions do not secure endpoints.

Never expose, log, or hardcode:

```text
plaintext passwords
raw access tokens
raw refresh tokens
password hashes
signing secrets
private keys
```

Use the project's configuration and secrets mechanism.

---

# Final rules

- Keep Validation, Authentication, and Authorization separate.
- Authentication establishes trusted identity.
- Authorization decides what that identity may do.
- Keep actor and target distinct.
- Never trust client-provided identity as the authenticated actor.
- Authenticate protected routes at the entry boundary.
- Centralize credential extraction and verification.
- Keep `request.auth` small and trusted.
- Verify tokens instead of merely decoding them.
- Keep login as an explicit application use case.
- Keep cryptographic mechanics behind infrastructure abstractions.
- Use middleware for broad/static authorization.
- Use Services for ownership and resource-specific authorization.
- Pass actor identity explicitly into Services.
- Do not pass Express `Request` into Services.
- Keep authentication and authorization decisions out of Repositories.
- Keep authorization out of validation schemas.
- Do not duplicate authorization rules across middleware and Services.
- Use `401` for authentication failure.
- Use `403` for denied authorization.
- Follow project convention when unauthorized resource access intentionally maps to `404`.
- Never expose or log credentials, tokens, password hashes, or secrets.
