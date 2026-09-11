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

## Actor and target

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
actorId → authenticated identity
userId  → target User
```

Never trust client input as proof of actor identity.

Use identity established by Authentication.

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

Do not make generic middleware load arbitrary domain resources and reproduce Service rules.

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

## Layer boundaries

Controller:

```text
passes trusted actor information
```

Service:

```text
owns resource/application authorization
```

Repository:

```text
provides persistence
does not decide application permission
```

Validation:

```text
validates structure
does not decide permission
```

Do not put authorization rules in request schemas or Repository methods.

## Authorization vs business rules

Keep permission and resource state conceptually separate.

```text
Only managers may approve invoices.
→ Authorization

Only pending invoices may be approved.
→ Business rule
```

Both may be evaluated by the same Service.

## Errors

```text
No valid identity
→ 401

Valid identity without permission
→ 403
```

Expected authorization failures may use `AppError`.

Follow project convention if unauthorized resource access intentionally returns `404`.

## Rules

- Use authenticated identity as the actor.
- Keep actor and target distinct.
- Use middleware for broad authorization.
- Use Services for ownership and resource-specific authorization.
- Load resources before authorization when the decision requires resource state.
- Do not duplicate authorization between middleware and Service.
- Keep resource authorization out of Controllers.
- Keep authorization out of Validation and Repositories.
- Pass actor identity explicitly into Services.
- Distinguish authorization from business-state rules.
- Use `401` for failed authentication and `403` for denied authorization.
