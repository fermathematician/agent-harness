# Authorization

## Purpose

Authorization decides whether an authenticated actor may perform a specific operation.

It answers:

```text
"May this identity perform this operation?"
```

Keep the concerns separate:

```text
Validation
→ Is the request input structurally valid?

Authentication
→ Who is making the request?

Authorization
→ May this identity perform the operation?
```

Authentication establishes identity.

Authorization uses that identity together with the requested operation and application state to make an access decision.

## Authorization boundary

Authorization happens after an identity has been established when the operation requires authentication.

Conceptually:

```text
Request
  ↓
Authentication
  ↓
actor identity
  ↓
Authorization
  ↓
allowed?
  ├── no  → reject
  └── yes → continue
```

Authorization may happen at different application boundaries depending on what information the decision requires.

Simple route-level authorization may happen before the Controller.

Resource-specific or business-sensitive authorization commonly belongs in the Service.

## Authentication vs authorization

A valid identity does not imply permission.

Example:

```text
User 123
```

is successfully authenticated.

The request is:

```text
DELETE /users/456
```

Authentication answers:

```text
Who is calling?
→ User 123
```

Authorization answers:

```text
May User 123 delete User 456?
```

These are separate decisions.

Use:

```text
no valid identity
→ authentication failure
→ 401

valid identity without permission
→ authorization failure
→ 403
```

Do not use authentication middleware as a replacement for authorization.

## Authorization inputs

An authorization decision may depend on:

```text
actor
operation
target resource
role
permission
ownership
tenant
resource state
application rules
```

Conceptually:

```text
Can(actor, action, resource)?
```

For example:

```text
Can(
  User 123,
  "update",
  User 456
)?
```

Authorization is therefore often contextual.

Knowing only the actor is not always enough.

## Actor and target

Keep the actor performing the operation separate from the target resource.

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
→ who is performing the operation

userId
→ which User is being modified
```

They may be equal:

```text
actorId === userId
```

or different.

Do not assume that an authenticated User may operate only on themselves or automatically on every other User.

The Service decides according to application rules.

## Authorization strategies

Applications may use one or more authorization strategies.

Common examples:

```text
role-based
permission-based
ownership-based
tenant-based
resource-based
policy-based
business-state-based
```

These strategies may coexist.

Example:

```text
Admin
→ may manage all Users

Regular User
→ may update own profile

Support Agent
→ may view User
→ may not change security settings
```

Do not force every authorization rule into one mechanism when the domain requires different kinds of decisions.

## Role-based authorization

Roles represent broad categories of access.

Examples:

```text
ADMIN
MANAGER
USER
```

A simple route may require:

```text
authenticated actor
  ↓
required role
  ↓
allowed / denied
```

Conceptually:

```ts
ensureRole("ADMIN");
```

Role checks are useful for broad and stable access rules.

Do not assume roles alone can express every application rule.

A role may grant general capability while the Service still needs resource-specific authorization.

## Permission-based authorization

Permissions represent capabilities more directly.

Examples:

```text
users:read
users:update
users:delete
orders:approve
reports:export
```

Conceptually:

```text
actor
  ↓
permissions
  ↓
required permission
  ↓
allowed / denied
```

Permissions may provide finer-grained control than roles.

Roles may map to permissions:

```text
ADMIN
  ├── users:read
  ├── users:update
  └── users:delete
```

The exact model depends on the application.

Do not introduce a complex permission system when simple authorization rules are sufficient.

## Ownership-based authorization

Some operations depend on who owns the target resource.

Example:

```text
User may update their own profile.
```

The rule depends on:

```text
actorId
targetUserId
```

For example:

```ts
if (actorId !== userId) {
  throw new AppError("Forbidden", 403);
}
```

This rule belongs where the application has enough context to make the decision.

If ownership requires loading a resource, the Service commonly performs the authorization after retrieving it.

## Resource-based authorization

Many authorization decisions require resource state.

Example:

```text
May User 123 edit Order 456?
```

The answer may depend on:

```text
who owns Order 456
which tenant owns it
its current status
the actor's role
the requested operation
```

Conceptually:

```text
Service
  ↓
load resource
  ↓
evaluate authorization
  ↓
perform operation
```

Example:

```ts
const order = await orderRepository.findById(orderId);

if (!order) {
  throw new AppError("Order not found", 404);
}

if (order.userId !== actorId) {
  throw new AppError("Forbidden", 403);
}
```

Do not move resource-specific authorization into generic authentication middleware merely to run it earlier.

## Authorization middleware

Middleware is useful when authorization depends only on information already available at the HTTP boundary.

Examples:

```text
authenticated?
has ADMIN role?
has reports:read permission?
```

Conceptually:

```ts
router.get(
  "/admin/users",
  ensureAuthenticated,
  ensureRole("ADMIN"),
  listUsersController.handle,
);
```

Keep middleware authorization broad and transport-level when possible.

Do not make generic middleware responsible for loading arbitrary domain resources and reproducing Service rules.

## Authorization in the Service

Use the Service when authorization depends on application or resource context.

Examples:

```text
Does actor own this resource?
May this actor modify this Order in its current state?
Does actor belong to the same Company?
May this manager approve this Invoice?
```

Example:

```ts
class UpdateUserService {
  constructor(private readonly userRepository: UserRepository) {}

  async execute({ actorId, userId, name }: UpdateUserRequest) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (actorId !== user.id) {
      throw new AppError("Forbidden", 403);
    }

    return this.userRepository.update({
      id: userId,
      name,
    });
  }
}
```

The Service already owns application decisions.

Resource-specific authorization naturally fits there.

## Middleware vs Service

Use middleware when the decision is broad and available before the use case.

Example:

```text
route requires ADMIN
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
broad authorization middleware
  ↓
Controller
  ↓
Service
  ↓
resource-specific authorization
```

Do not duplicate the same authorization rule in both places.

## Authorization policies

When authorization rules become complex or repeated, extract them into explicit policies.

Conceptually:

```ts
interface UpdateUserPolicy {
  canUpdate(actor: Actor, user: User): boolean;
}
```

Then:

```text
UpdateUserService
  ↓
UpdateUserPolicy
  ↓
allowed / denied
```

A policy centralizes a reusable authorization decision.

Use policies when they improve clarity or reuse.

Do not introduce policy abstractions for trivial one-line rules without reason.

## Policy naming

Prefer names that describe the authorization decision.

Examples:

```text
UpdateUserPolicy
DeleteUserPolicy
ApproveInvoicePolicy
OrderAccessPolicy
```

Avoid vague abstractions such as:

```text
AuthorizationHelper
PermissionUtils
AccessManager
```

when a more explicit application concept is available.

## Roles and permissions in Services

Do not couple Services unnecessarily to HTTP authentication objects.

Avoid:

```ts
service.execute({
  request,
});
```

Prefer explicit application input:

```ts
service.execute({
  actorId,
  actorRole,
  userId,
});
```

or a deliberate actor abstraction:

```ts
interface Actor {
  id: string;
  roles: string[];
}
```

Choose according to project complexity.

The Service should receive application-level identity information, not Express-specific state.

## Trusted authorization data

Authorization decisions must use trusted identity information.

Prefer:

```text
request.auth.userId
```

established by authentication.

Do not trust:

```text
request.body.userId
request.query.userId
request.headers["x-user-id"]
```

as proof of actor identity.

Client-provided identifiers may identify target resources, but they do not establish who the actor is.

## Authorization and validation

Validation checks structure.

Authorization checks permission.

Example:

```text
PATCH /users/:userId
```

Validation:

```text
Is userId a valid UUID?
Is name a valid string?
```

Authorization:

```text
May the authenticated actor update this User?
```

Do not encode permission decisions into request schemas.

Avoid database-backed schema checks such as:

```text
validate userId
→ load User
→ check ownership
```

That is no longer structural request validation.

## Authorization and Repository

Repositories do not decide whether the actor is allowed to perform an application operation.

Avoid:

```ts
userRepository.updateIfAuthorized(actorId, userId, data);
```

when authorization is an application rule.

Prefer:

```text
Service
  ↓
authorization decision
  ↓
Repository operation
```

Repositories may expose persistence operations required to evaluate authorization.

Examples:

```text
findById()
findMembership()
findRoleAssignments()
```

But the Service or authorization policy interprets that data.

## Authorization and database

Database constraints protect persistence integrity, not application authorization.

A foreign key may guarantee:

```text
companyId refers to an existing Company
```

but it does not necessarily guarantee:

```text
the authenticated actor may modify this Company's data
```

Do not use database constraints as a substitute for authorization rules.

## Multi-tenant authorization

Multi-tenant systems require special attention to resource boundaries.

Example:

```text
actor
→ tenant A

resource
→ tenant B
```

The operation should normally be denied unless the application explicitly allows cross-tenant access.

Prefer making tenant scope explicit in application behavior.

For example:

```ts
await orderRepository.findByIdAndTenant(orderId, tenantId);
```

may be appropriate when tenant scoping is fundamentally part of persistence access.

However, do not trust a client-provided tenant identifier as authenticated tenant identity.

Use the trusted authentication context.

## Resource visibility

Sometimes authorization affects whether a resource should appear to exist to the caller.

An application may intentionally return:

```text
404
```

instead of:

```text
403
```

for unauthorized access to certain resources to avoid revealing their existence.

This is an application/API security convention.

Follow the project's established policy.

Do not randomly alternate between `403` and `404`.

## 401 vs 403

Keep the normal distinction:

```text
401 Unauthorized
→ valid authentication was not established

403 Forbidden
→ identity is established but operation is not allowed
```

Examples:

```text
missing token
→ 401

invalid token
→ 401

expired token
→ 401

valid User without permission
→ 403
```

A project may intentionally conceal resource existence with `404` in specific cases.

## Authorization failures

Expected permission failures may use the project's `AppError` convention.

Example:

```ts
throw new AppError("Forbidden", 403);
```

Do not expose unnecessary internal authorization details.

For example, avoid responses that reveal:

```text
internal role structure
hidden resource state
private tenant information
security policy internals
```

unless the API intentionally exposes them.

## State-based authorization

Authorization and business rules sometimes overlap.

Example:

```text
Only managers may approve invoices.
Invoices may only be approved while pending.
```

These are two distinct questions:

```text
May this actor approve invoices?
→ authorization

May this invoice currently be approved?
→ business state rule
```

Both may live in the same Service while remaining conceptually separate.

Example:

```text
actor permission
  ↓
resource state
  ↓
perform operation
```

Keeping the concepts distinct improves error handling and maintainability.

## Domain actions

Authorization should follow application use cases rather than generic CRUD assumptions.

Example:

```text
UpdateInvoice
```

may eventually become:

```text
ChangeInvoiceDescription
ApproveInvoice
CancelInvoice
```

Each operation may have different authorization rules.

For example:

```text
ChangeInvoiceDescription
→ owner

ApproveInvoice
→ manager

CancelInvoice
→ owner or manager
```

Do not assume that permission to `update` an entity implies permission to perform every state-changing action.

## Avoid scattered authorization

Do not scatter the same authorization rule across:

```text
Route
Controller
Service
Repository
```

Choose an intentional owner for each rule.

Prefer:

```text
broad/static access
→ middleware

resource/application access
→ Service or policy
```

The Controller should normally coordinate HTTP input and output rather than implement authorization logic.

## Avoid authorization by accident

Do not rely on UI restrictions for backend authorization.

Hiding a button in the frontend does not protect the backend endpoint.

Every protected backend operation must enforce its own authorization requirements.

Frontend authorization improves user experience.

Backend authorization provides security.

## Default-deny principle

When an operation requires authorization, permission should be established explicitly.

Do not assume access merely because no rule rejected the actor.

Conceptually prefer:

```text
permission established
→ allow
```

over:

```text
nothing blocked it
→ allow
```

How this is implemented depends on the application's authorization model.

## Centralization vs explicitness

Authorization benefits from reuse, but excessive abstraction can hide important application behavior.

Avoid both extremes:

```text
authorization duplicated everywhere
```

and:

```text
one magical global authorization engine
that obscures all use-case rules
```

Prefer explicit policies and middleware where they make repeated rules clearer.

Keep use-case-specific rules visible near the use case.

## Testing

Authorization tests should focus on access decisions.

Useful cases include:

```text
authorized actor succeeds
unauthorized actor is rejected
owner may access own resource
non-owner is rejected
required role succeeds
missing role is rejected
cross-tenant access is rejected
```

Keep authentication and authorization tests conceptually separate.

Example:

```text
Authentication test
→ valid token establishes User 123

Authorization test
→ User 123 may not modify User 456
```

Service tests should cover resource-specific authorization when the Service owns those rules.

## Example: own profile

Request:

```text
PATCH /users/:userId
```

Flow:

```text
Request
  ↓
Authentication
  ↓
actorId
  ↓
Validation
  ↓
Controller
  ↓
UpdateUserService
  ↓
load User
  ↓
actorId === user.id?
  ├── no  → 403
  └── yes → update
```

Authentication establishes the actor.

Validation establishes structurally valid input.

The Service evaluates ownership.

The Repository persists the update.

## Example: administrative route

Request:

```text
GET /admin/users
```

Flow:

```text
Request
  ↓
ensureAuthenticated
  ↓
ensureRole("ADMIN")
  ↓
Controller
  ↓
Service
```

Because the authorization rule is broad and independent of a particular target resource, middleware may be sufficient.

## Example: domain action

Request:

```text
POST /invoices/:invoiceId/approve
```

Flow:

```text
Request
  ↓
Authentication
  ↓
Controller
  ↓
ApproveInvoiceService
  ↓
load Invoice
  ↓
may actor approve?
  ↓
is Invoice pending?
  ↓
approve
  ↓
Repository
```

Here the Service may evaluate both:

```text
authorization
→ may this actor approve?

business rule
→ may this Invoice currently be approved?
```

They are related but remain distinct concepts.

## Rules

When implementing authorization:

- authorize protected operations explicitly;
- keep authentication and authorization separate;
- use trusted authenticated identity as the actor;
- distinguish actor identity from target resource identity;
- use `401` when authentication is missing or invalid;
- use `403` when an authenticated actor lacks permission;
- follow project policy when intentionally using `404` to conceal resources;
- use middleware for broad authorization available at the HTTP boundary;
- use Services for resource-specific and business-sensitive authorization;
- extract reusable authorization policies when complexity justifies them;
- do not put authorization rules in request schemas;
- do not put application authorization decisions in Repositories;
- do not rely on database constraints as authorization;
- do not rely on frontend restrictions for backend security;
- do not trust client-provided identity as actor identity;
- pass application-level actor information into Services when required;
- keep Controllers free from business authorization decisions;
- keep tenant boundaries explicit when applicable;
- distinguish authorization rules from resource state rules;
- authorize domain actions according to their actual semantics;
- avoid scattering the same authorization rule across layers;
- prefer explicit permission over accidental access;
- test authorization decisions independently from authentication.
