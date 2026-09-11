# Authentication

## Purpose

Authentication establishes the identity of the actor making a request.

It answers:

```text
"Who is making this request?"
```

Authentication does not decide whether that identity may perform a specific application operation.

Keep the concerns separate:

```text
Validation
→ Is the request input structurally valid?

Authentication
→ Who is making the request?

Authorization
→ May this identity perform the operation?
```

Authentication verifies identity.

Authorization uses that identity to make access decisions.

## Authentication boundary

A typical authenticated request flows through:

```text
HTTP Request
  ↓
Authentication
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

Exact middleware ordering may vary according to route requirements.

The important boundary is:

```text
credentials
  ↓
authentication mechanism
  ↓
authenticated identity
  ↓
application
```

Application code should not repeatedly parse and verify credentials.

Authentication should happen at the application entry boundary.

## Authentication vs authorization

Do not treat authentication and authorization as synonyms.

Authentication establishes identity:

```text
token
  ↓
verify
  ↓
userId = "..."
```

Authorization decides what that identity may do:

```text
userId = "..."
  ↓
application/resource context
  ↓
allowed or denied
```

Example:

```text
GET /users/me
```

Authentication may establish:

```text
authenticated user = User 123
```

But:

```text
DELETE /users/456
```

requires another question:

```text
May User 123 delete User 456?
```

That is authorization.

A valid credential does not imply permission to perform every operation.

## Credentials

Authentication begins with some credential or authentication mechanism.

Common examples include:

```text
session identifier
access token
JWT
API key
OAuth/OIDC identity
```

The authentication layer is responsible for interpreting the credential according to the project's chosen mechanism.

Do not spread credential parsing throughout Controllers or Services.

For example, with bearer authentication:

```text
Authorization: Bearer <token>
```

the authentication layer may:

```text
extract credential
  ↓
verify credential
  ↓
extract trusted identity
  ↓
attach authentication context
```

The rest of the application consumes the established identity rather than parsing the token again.

## Authentication middleware

For HTTP applications, authentication is commonly implemented through middleware.

Conceptually:

```ts
async function ensureAuthenticated(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  // extract credentials
  // verify credentials
  // establish authenticated identity
  // expose authentication context
  // call next()
}
```

A protected route may then use:

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

The authentication middleware should focus on establishing identity.

It should not implement unrelated business rules.

## Public and protected routes

Not every route requires authentication.

Examples of potentially public routes:

```text
POST /sessions
POST /users
GET /health
```

Examples of potentially protected routes:

```text
GET /users/me
PATCH /users/me
POST /orders
DELETE /sessions/current
```

Whether a route is public or protected is an application decision.

Do not automatically require authentication for every endpoint.

Do not accidentally expose a protected endpoint by forgetting authentication at route composition.

The route layer should make authentication requirements visible.

## Authentication context

After successful authentication, expose a trusted authentication context to the remaining HTTP/application flow.

For example:

```ts
interface AuthContext {
  userId: string;
}
```

The exact context depends on the application.

It may eventually contain:

```text
userId
sessionId
tenantId
authentication method
```

Keep the context intentional.

Do not copy the entire token payload into application state merely because it is available.

Prefer the minimum trusted identity information required by the application.

## Trusted identity

Distinguish authenticated identity from client-provided identity.

Never trust:

```json
{
  "userId": "123"
}
```

as proof that the caller is User 123.

Likewise:

```text
?userId=123
```

or:

```text
X-User-Id: 123
```

does not establish identity unless that header is part of a trusted infrastructure authentication mechanism.

Identity must come from the authentication process.

Example:

```text
request body
→ untrusted client input

request.auth.userId
→ authenticated identity
```

This distinction is critical.

## Token verification

When using signed tokens such as JWTs, authentication must verify the token according to the project's security configuration.

Conceptually:

```text
receive token
  ↓
verify signature
  ↓
verify required claims
  ↓
verify temporal validity
  ↓
extract trusted identity
```

Do not merely decode a token and trust its contents.

Decoding answers:

```text
"What data is inside this token?"
```

Verification answers:

```text
"Was this token issued and signed according to the trusted authentication configuration?"
```

Only verified claims should become trusted authentication context.

## Token claims

Token claims may include information such as:

```text
sub
iss
aud
exp
iat
```

Their exact meaning depends on the authentication system.

A common convention is:

```text
sub
→ subject identity
```

For example:

```text
sub = userId
```

Do not assume arbitrary token fields are trustworthy or meaningful unless the project's authentication contract defines them.

Verify the claims required by the chosen mechanism.

## Expiration

Credentials with expiration must be rejected after they expire.

For example:

```text
access token
  ↓
exp
  ↓
expired?
  ├── yes → authentication failure
  └── no  → continue
```

Do not treat an expired credential as an authorization failure.

The caller has failed to provide currently valid authentication.

## Sessions

Session-based authentication follows the same conceptual boundary.

Example:

```text
session cookie
  ↓
session identifier
  ↓
session store
  ↓
authenticated identity
```

The browser may hold only a session identifier while the trusted authentication state lives on the server.

The application still receives an authenticated identity after the authentication layer verifies the session.

Do not couple Services to session storage mechanics.

## Access tokens and refresh tokens

When the project uses access and refresh tokens, keep their purposes distinct.

Typically:

```text
Access token
→ authenticate ordinary protected requests

Refresh token
→ obtain a new access token through the refresh flow
```

A refresh token should not automatically be accepted wherever an access token is expected.

The exact expiration, rotation, storage, and revocation strategy belongs to the project's authentication design.

Do not invent these policies when the project already defines them.

## Password authentication

Password verification usually belongs to an authentication use case such as:

```text
AuthenticateUser
CreateSession
SignIn
```

Conceptually:

```text
email + password
  ↓
AuthenticateUserService
  ↓
find user
  ↓
verify password
  ↓
create authentication result
```

Passwords are credentials used to establish identity.

They should not be treated as ordinary persistent text values.

Store password hashes according to the project's password hashing strategy.

Never store plaintext passwords.

Never return password hashes through public API responses.

## Password hashing

Password hashing and password verification are infrastructure/security operations used by authentication use cases.

Prefer an abstraction when appropriate:

```ts
interface PasswordHasher {
  hash(value: string): Promise<string>;
  compare(value: string, hash: string): Promise<boolean>;
}
```

Then:

```text
AuthenticateUserService
  ↓
UserRepository
PasswordHasher
TokenProvider / SessionProvider
```

The Service coordinates the authentication use case.

The concrete hashing library remains an implementation detail.

Do not embed hashing-library-specific calls throughout application Services.

## Authentication use case

Signing in is itself an application use case.

For example:

```text
CreateSessionController
  ↓
CreateSessionService
  ├── UserRepository
  ├── PasswordHasher
  └── TokenProvider
```

The Controller receives validated HTTP credentials.

The Service coordinates authentication behavior.

Infrastructure components perform cryptographic or session-specific mechanics.

This keeps authentication consistent with the rest of the application architecture.

## Token provider

If the application issues tokens, hide token-library mechanics behind an application-facing abstraction when useful.

Example:

```ts
interface TokenProvider {
  sign(payload: TokenPayload): Promise<string>;
  verify(token: string): Promise<TokenPayload>;
}
```

A concrete implementation may use the selected JWT or authentication library.

Application Services should not need to understand low-level signing APIs.

Keep cryptographic configuration centralized.

## Authentication failures

Authentication failures typically represent situations such as:

```text
missing credential
malformed credential
invalid credential
expired credential
invalid session
incorrect login credentials
```

Protected HTTP requests generally map authentication failure to:

```text
401 Unauthorized
```

Despite the HTTP status name, `401` represents missing or invalid authentication.

`403 Forbidden` is normally used when identity is established but permission is denied.

Conceptually:

```text
No valid identity
→ 401

Valid identity, insufficient permission
→ 403
```

Keep this distinction consistent.

## Login failure

Do not unnecessarily reveal sensitive account information during login.

For example, avoid creating externally observable differences such as:

```text
"Email does not exist"
```

versus:

```text
"Password is incorrect"
```

when the application's security policy intentionally uses a generic authentication failure.

Prefer the project's established response convention.

Do not leak password hashes, token secrets, internal verification details, or stack traces.

## Authentication and AppError

Expected authentication failures may be represented through the project's expected-error convention.

For example:

```ts
throw new AppError("Invalid credentials", 401);
```

or:

```ts
throw new AppError("Authentication required", 401);
```

Do not convert unexpected infrastructure or cryptographic failures into fake authentication failures without reason.

Expected invalid credentials and unexpected system failures are different categories.

## Authentication and validation

Validation and authentication may both occur before the Controller, but they protect different boundaries.

Example login:

```text
POST /sessions
  ↓
Validation
→ Is email structurally valid?
→ Is password present?
  ↓
CreateSessionController
  ↓
CreateSessionService
→ Are the credentials correct?
```

For a protected route:

```text
PATCH /users/:userId
  ↓
Authentication
→ Who is calling?
  ↓
Validation
→ Is userId structurally valid?
→ Is the body valid?
  ↓
Controller
  ↓
Service
```

Do not perform password verification or token verification inside request schemas.

Do not perform ordinary structural request validation inside authentication middleware.

## Authentication and Controller

Controllers should consume authentication context rather than interpret credentials themselves.

Prefer:

```ts
const authenticatedUserId = request.auth.userId;
```

over:

```ts
const token = request.headers.authorization;

// decode/verify token here
```

Controllers remain focused on translating HTTP input into application use cases.

## Authentication and Service

A Service may receive authenticated actor information as explicit application input.

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
→ target resource
```

These are not necessarily the same identity.

The Service may use `actorId` when application rules depend on who is performing the operation.

Do not pass the entire Express `Request` object into the Service.

## Authentication and Repository

Repositories do not authenticate requests.

Avoid putting token, cookie, session-header, or Express-specific logic inside Repositories.

A Repository may participate in authentication by loading required persistence state:

```text
find user by email
find session by id
find account by identity
```

But the Repository remains a persistence abstraction.

It does not own the authentication flow.

## Authentication and authorization

Authentication should establish enough trusted identity for authorization to make decisions.

Example:

```text
Authentication
→ actorId = 123

Authorization
→ may actor 123 update User 456?
```

Avoid encoding all authorization decisions into authentication middleware.

For example, authentication middleware should not become:

```text
authenticate
+ load every permission
+ load target resource
+ evaluate ownership
+ enforce business state
```

unless the project's architecture explicitly defines such a mechanism.

Keep identity establishment and permission decisions conceptually separate.

## Roles and permissions

Roles and permissions are primarily authorization concepts.

Authentication may expose trusted claims relevant to authorization when the project's identity system defines them.

For example:

```text
request.auth.userId
request.auth.roles
```

But authentication should not independently decide:

```text
Admin may delete this invoice.
```

That is an authorization rule.

Be careful with stale role or permission information stored in long-lived credentials.

Follow the project's authorization and token strategy.

## Multi-tenant identity

In multi-tenant applications, authentication context may include tenant identity when it is part of the trusted authentication model.

Example:

```ts
interface AuthContext {
  userId: string;
  tenantId: string;
}
```

Do not trust a client-provided `tenantId` as equivalent to an authenticated tenant context.

Authorization and application rules still determine whether an operation is allowed within that tenant.

## Secrets

Authentication systems handle sensitive material.

Examples:

```text
JWT signing secrets
private keys
OAuth client secrets
session secrets
password hashes
refresh tokens
```

Do not hardcode secrets into source code.

Use the project's configuration/secrets mechanism.

Do not log credentials or secrets.

Do not expose them through API responses.

## Logging

Authentication logging may record useful security events such as:

```text
authentication success
authentication failure
session creation
session revocation
token refresh failure
```

Avoid logging:

```text
plaintext passwords
raw access tokens
raw refresh tokens
signing secrets
sensitive credential material
```

Logs should provide operational evidence without becoming a credential leak.

## Testing

Authentication tests should focus on identity establishment and authentication failures.

Useful cases include:

```text
missing credential rejected
valid credential accepted
invalid credential rejected
expired credential rejected
authenticated identity exposed correctly
incorrect login credentials rejected
valid login produces expected authentication result
```

Do not duplicate authorization tests inside authentication tests.

Example:

```text
Authentication test
→ valid token establishes User 123

Authorization test
→ User 123 may not delete User 456
```

These protect different boundaries.

## Example: protected request

Request:

```text
GET /users/me
Authorization: Bearer <access-token>
```

Flow:

```text
HTTP Request
  ↓
ensureAuthenticated
  ↓
verify token
  ↓
request.auth.userId
  ↓
Controller
  ↓
Service
  ↓
Repository
```

Invalid token:

```text
HTTP Request
  ↓
Authentication
  ↓
401
```

Valid token:

```text
HTTP Request
  ↓
authenticated identity
  ↓
application
```

## Example: login

Request:

```text
POST /sessions
```

Body:

```json
{
  "email": "gabriel@example.com",
  "password": "..."
}
```

Flow:

```text
HTTP Request
  ↓
Validation
  ↓
CreateSessionController
  ↓
CreateSessionService
  ↓
UserRepository.findByEmail()
  ↓
PasswordHasher.compare()
  ↓
TokenProvider / SessionProvider
  ↓
authentication result
```

Validation answers whether the login request is structurally valid.

The Service determines whether the supplied credentials establish a valid identity.

The provider implements the authentication mechanism.

## Rules

When implementing authentication:

- establish identity before protected application behavior executes;
- keep authentication separate from validation and authorization;
- do not trust client-provided identity as authenticated identity;
- centralize credential extraction and verification;
- verify tokens rather than merely decoding them;
- expose a small, trusted authentication context;
- keep Controllers free from credential verification logic;
- pass actor identity explicitly into Services when needed;
- keep HTTP authentication mechanics out of Services and Repositories;
- use `401` for missing or invalid authentication;
- reserve `403` for authenticated identities denied permission;
- keep login as an explicit application use case;
- keep cryptographic and session mechanics behind appropriate infrastructure boundaries;
- never store plaintext passwords;
- never expose password hashes;
- do not log credentials, tokens, or secrets;
- do not hardcode authentication secrets;
- distinguish expected authentication failures from unexpected infrastructure failures;
- do not merge authentication middleware with resource-specific authorization rules;
- follow project conventions for token lifetime, refresh, revocation, sessions, and credential storage;
- test authentication behavior independently from authorization behavior.
