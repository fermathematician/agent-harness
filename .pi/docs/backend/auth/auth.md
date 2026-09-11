# Auth

## Purpose

Auth defines how authentication and authorization work together across the application.

Keep the concerns separate:

```text
Validation
→ Is the request input structurally valid?

Authentication
→ Who is making the request?

Authorization
→ May this identity perform the operation?
```

Authentication establishes a trusted actor.

Authorization decides what that actor may do.

Validation remains independent from both.

## Overall flow

A typical protected request follows:

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
  ↓
Authorization when resource/application context is required
  ↓
Repository
  ↓
Database
```

The exact middleware order may vary by route.

The important separation is:

```text
credentials
→ Authentication

request data
→ Validation

actor + operation + resource
→ Authorization
```

Do not merge these responsibilities merely because they participate in the same request.

## Authentication

Authentication establishes identity.

```text
credential
  ↓
verify
  ↓
trusted authentication context
```

Examples of credentials:

```text
session
access token
JWT
API key
OAuth/OIDC identity
```

After authentication, the application may receive:

```ts
interface AuthContext {
  userId: string;
}
```

The exact context depends on the project.

Keep it intentional and trusted.

Do not treat client-provided identifiers as authenticated identity.

```text
request.body.userId
→ client input

request.auth.userId
→ authenticated actor
```

Detailed authentication behavior belongs to `authentication.md`.

## Authorization

Authorization determines whether the authenticated actor may perform an operation.

Conceptually:

```text
actor
+ action
+ resource/context
  ↓
allowed / denied
```

Authorization may depend on:

```text
roles
permissions
ownership
tenant
resource
application state
```

Broad authorization may happen in middleware.

Resource-specific authorization normally happens in the Service or an explicit authorization policy.

Detailed authorization behavior belongs to `authorization.md`.

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

They may be equal or different.

Never infer permission merely because the actor is authenticated.

## Public routes

Public routes do not require authenticated identity.

Examples may include:

```text
POST /sessions
POST /users
GET /health
```

Whether a route is public is an application decision.

Public routes may still require Validation.

Example:

```text
POST /sessions
  ↓
Validation
  ↓
CreateSessionController
  ↓
CreateSessionService
```

Login credentials are validated structurally before the authentication use case evaluates them.

## Protected routes

Protected routes require authentication.

Example:

```text
GET /users/me
```

Flow:

```text
Request
  ↓
ensureAuthenticated
  ↓
trusted actor
  ↓
Controller
  ↓
Service
```

A protected route may additionally require authorization.

```text
Request
  ↓
Authentication
  ↓
Authorization
  ↓
Controller
  ↓
Service
```

or:

```text
Request
  ↓
Authentication
  ↓
Controller
  ↓
Service
  ↓
resource-specific Authorization
```

Choose the authorization boundary according to the information required by the decision.

## Route-level authorization

Use route middleware for broad access rules that can be evaluated before the use case.

Examples:

```text
must be authenticated
must have ADMIN role
must have reports:read permission
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

Do not make route middleware reproduce resource-specific application logic.

## Service-level authorization

Use the Service when authorization depends on application context.

Examples:

```text
Does actor own this resource?
Does actor belong to this Company?
May actor modify this Order?
May actor perform this state transition?
```

Conceptually:

```text
Controller
  ↓
Service
  ↓
load resource
  ↓
authorize actor
  ↓
apply business rules
  ↓
persist
```

The Service may perform authorization directly or delegate complex reusable decisions to a policy.

## Authorization policies

When authorization logic becomes complex or reused, extract an explicit policy.

Example:

```text
UpdateUserService
  ↓
UpdateUserPolicy
  ↓
allowed / denied
```

Policies represent authorization decisions.

Do not introduce them when a simple explicit Service rule is clearer.

## Auth and Controller

Controllers consume established authentication context.

Prefer:

```ts
const actorId = request.auth.userId;
```

Do not:

```text
parse tokens
verify JWTs
load sessions
evaluate business permissions
```

inside Controllers.

The Controller translates trusted HTTP context into explicit Service input.

## Auth and Service

Services receive application-level actor information when required.

Prefer:

```ts
service.execute({
  actorId,
  resourceId,
});
```

Do not pass:

```ts
service.execute({
  request,
});
```

Services should not depend on Express authentication objects.

Authentication establishes the actor before the Service.

The Service uses that actor when application rules require identity.

## Auth and Repository

Repositories do not authenticate or authorize requests.

They may provide persistence capabilities required by auth use cases:

```text
find user
find session
find membership
find role assignment
```

But interpretation belongs outside the Repository.

Use:

```text
Service / Policy
→ authorization decision

Repository
→ persistence
```

Do not hide application permission rules inside Repository methods.

## Auth and Validation

Keep Validation independent.

```text
Validation
→ structure

Authentication
→ identity

Authorization
→ permission
```

Do not use request schemas to:

```text
verify tokens
authenticate users
check ownership
load permissions
authorize resources
```

Likewise, authentication middleware should not become generic request validation.

## Login

Login is an application use case.

Example:

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

The Service coordinates the authentication use case.

Infrastructure components implement credential-specific mechanics.

Keep password hashing, token libraries, and session implementations behind their appropriate boundaries.

## Authenticated requests

For token-based authentication:

```text
Authorization: Bearer <token>
  ↓
ensureAuthenticated
  ↓
verify credential
  ↓
request.auth
  ↓
application
```

For session-based authentication:

```text
session credential
  ↓
ensureAuthenticated
  ↓
verify session
  ↓
request.auth
  ↓
application
```

The mechanism may change.

The application boundary remains:

```text
credential
→ trusted actor
```

## Errors

Keep authentication and authorization failures distinct.

```text
No valid authenticated identity
→ 401

Authenticated actor lacks permission
→ 403
```

A project may intentionally use `404` for some unauthorized resource access to conceal resource existence.

Follow one consistent project convention.

Expected auth failures may use `AppError`.

Unexpected infrastructure failures should not automatically become fake `401` or `403` errors.

## Domain actions

Authorize the actual application operation.

Do not assume generic CRUD permission automatically grants every domain action.

Example:

```text
Invoice

UpdateInvoice
ApproveInvoice
CancelInvoice
```

These operations may have different authorization rules.

Prefer authorization aligned with explicit use cases.

## Backend authority

Frontend access control does not replace backend authorization.

For example:

```text
hide "Delete" button
```

may improve user experience.

It does not secure:

```text
DELETE /users/:id
```

Protected backend operations must enforce their own authentication and authorization requirements.

## Security boundaries

Never trust client-provided identity as authenticated identity.

Never store plaintext passwords.

Never expose password hashes.

Never log raw credentials, tokens, refresh tokens, or secrets.

Never hardcode authentication secrets.

Verify credentials according to the project's authentication mechanism.

Keep cryptographic and session mechanics centralized.

## Overall convention

```text
Request
  │
  ├── Validation
  │   └── Is the input structurally valid?
  │
  ├── Authentication
  │   └── Who is the actor?
  │
  └── Authorization
      └── May the actor perform the operation?
```

Across the application:

```text
Route
  ↓
Authentication middleware
  ↓
Validation middleware
  ↓
Controller
  ↓
Service
  ├── business rules
  └── resource-specific authorization
  ↓
Repository
  ↓
Database
```

Broad authorization may also occur at the route boundary:

```text
Route
  ↓
Authentication
  ↓
broad Authorization
  ↓
Validation
  ↓
Controller
  ↓
Service
```

Do not treat middleware ordering as the architectural distinction.

The responsibilities are the important part.

## Rules

- Keep Validation, Authentication, and Authorization separate.
- Authentication establishes trusted identity.
- Authorization decides what that identity may do.
- Never trust client-provided identity as the actor.
- Keep actor and target resource distinct.
- Make public and protected routes explicit.
- Use middleware for broad authentication and authorization.
- Use Services for resource-specific authorization.
- Extract policies when authorization complexity justifies them.
- Pass application-level actor information into Services.
- Do not pass Express Request objects into Services.
- Keep credential verification out of Controllers.
- Keep authentication and authorization decisions out of Repositories.
- Keep auth logic out of request schemas.
- Use `401` for failed authentication.
- Use `403` for denied authorization unless project policy intentionally uses another representation.
- Treat login as an explicit application use case.
- Keep authentication infrastructure behind appropriate abstractions.
- Authorize explicit domain actions according to their semantics.
- Enforce backend authorization independently from frontend UI restrictions.
- Do not expose or log credentials and secrets.
