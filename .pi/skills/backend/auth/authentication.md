# Authentication

## Purpose

Authentication establishes the identity of the actor making a request.

```text
Authentication
→ Who is making the request?

Authorization
→ May this actor perform the operation?
```

Authentication establishes identity, not permission.

## Boundary

Authenticate protected requests at the application entry boundary.

```text
HTTP Request
  ↓
Authentication
  ↓
trusted identity
  ↓
Controller
  ↓
Service
```

Application code should consume the established identity instead of repeatedly parsing credentials.

## Authentication middleware

For protected HTTP routes:

```text
credential
  ↓
extract
  ↓
verify
  ↓
establish identity
  ↓
request.auth
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

Authentication middleware should establish identity.

It should not implement:

```text
ownership
resource authorization
business rules
```

Make public and protected routes explicit at route composition.

## Authentication context

Expose a small trusted context:

```ts
interface AuthContext {
  userId: string;
}
```

Add `sessionId`, `tenantId`, or other fields only when required.

Never treat client input as authenticated identity:

```text
request.body.userId
→ untrusted input

request.auth.userId
→ trusted actor
```

Do not copy the entire token payload into application state.

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

Only verified claims may become authentication context.

Follow existing project conventions for token lifetime, refresh, revocation, issuer, and audience.

When access and refresh tokens exist:

```text
Access token
→ authenticate protected requests

Refresh token
→ obtain new access token
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

The Service coordinates authentication.

Infrastructure implements hashing, token, or session mechanics.

## Password and token infrastructure

Never store plaintext passwords or expose password hashes.

Use application-facing abstractions when appropriate:

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

Keep concrete hashing and token libraries outside application Services.

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
receives actor identity explicitly when needed
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

## Authentication vs Authorization

```text
Authentication
→ actorId = 123

Authorization
→ may actor 123 update User 456?
```

Do not make authentication middleware load resources, check ownership, or enforce business state.

## Failures

```text
Missing or invalid identity
→ 401

Valid identity without permission
→ 403
```

Expected authentication failures may use:

```ts
throw new AppError("Invalid credentials", 401);
```

Do not convert unexpected infrastructure failures into fake authentication failures.

## Security

Never expose, log, or hardcode:

```text
plaintext passwords
raw access or refresh tokens
signing secrets
private keys
password hashes
```

Use the project's configuration/secrets mechanism.

## Rules

- Authenticate protected routes at the entry boundary.
- Centralize credential extraction and verification.
- Expose a small trusted authentication context.
- Never trust client-provided identity as the actor.
- Verify tokens instead of merely decoding them.
- Keep credential verification out of Controllers.
- Keep HTTP authentication mechanics out of Services and Repositories.
- Keep login as an explicit application use case.
- Keep cryptographic mechanics behind infrastructure abstractions.
- Never store plaintext passwords.
- Use `401` for authentication failure and `403` for authorization failure.
- Keep Authentication separate from Validation and Authorization.
- Follow existing project token and session policies.
