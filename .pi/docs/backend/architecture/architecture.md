# Backend Architecture

## Purpose

This document defines how the backend architecture fits together.

It connects:

```text
Routes
Authentication
Authorization
Validation
Controllers
Services
Repositories
Infrastructure
Dependency Injection
Modules
Errors
```

Detailed rules belong to their specific documents.

This document defines the overall architectural map and dependency boundaries.

---

## Architecture overview

The standard request flow is:

```text
Client
  ↓
Route
  ↓
Authentication
  ↓
Broad Authorization
  ↓
Validation
  ↓
Controller
  ↓
Service
  ↓
Repository contract
  ↓
Repository implementation
  ↓
Prisma
  ↓
Database
```

Not every endpoint requires every step.

For example, a public endpoint may omit Authentication and Authorization.

The important rule is that each responsibility remains at the correct boundary.

---

## Responsibility map

### Route

The Route defines the HTTP endpoint and assembles the HTTP pipeline.

It decides:

```text
HTTP method
path
authentication middleware
broad authorization middleware
validation middleware
Controller
```

Example:

```ts
router.patch(
  "/users/:userId",
  ensureAuthenticated,
  requireRole("ADMIN"),
  validate({
    params: userIdParamsSchema,
    body: updateUserBodySchema,
  }),
  updateUserController.handle,
);
```

Routes should not contain:

```text
business rules
Prisma queries
persistence logic
resource ownership checks
application orchestration
```

---

## Authentication

Authentication establishes the actor making the request.

Conceptually:

```text
request
  ↓
authentication middleware
  ↓
verified identity
  ↓
request.auth
```

After authentication, downstream code may rely on the trusted authentication context established by the middleware.

Authentication answers:

```text
Who is making this request?
```

It does not decide whether that actor may perform a resource-specific action.

---

## Authorization

Authorization answers:

```text
May this actor perform this action?
```

Broad/static authorization may happen before the Controller.

Examples:

```text
ADMIN only
authenticated users only
required global permission
```

Resource-specific authorization belongs in the Service.

Examples:

```text
Does this user own this order?
Does this actor belong to this tenant?
Can this invoice still be approved?
Can this actor modify this specific resource?
```

Therefore:

```text
Route middleware
→ broad/static authorization

Service
→ resource-specific authorization
```

---

## Validation

Validation protects the application boundary from structurally invalid input.

Validate:

```text
body
params
query
```

before invoking the Controller.

Example:

```text
Route
  ↓
validation schema
  ↓
Controller receives validated input
```

Validation answers questions such as:

```text
Is this a valid UUID?
Is email structurally valid?
Is this required field present?
Is this enum value allowed?
```

Business questions belong to the Service.

Examples:

```text
Does the user exist?
Is the email already registered?
Can this order be cancelled?
```

Do not query the database from structural validation.

---

## Controller

The Controller is the HTTP-to-application boundary.

It translates:

```text
HTTP request
→ Service input
```

and:

```text
Service output
→ HTTP response
```

Example:

```ts
class UpdateUserController {
  constructor(private readonly updateUserService: UpdateUserService) {}

  handle = async (request: Request, response: Response) => {
    const user = await this.updateUserService.execute({
      actorId: request.auth.userId,
      userId: request.validated.params.userId,
      data: request.validated.body,
    });

    return response.json(user);
  };
}
```

Controllers should remain thin.

They should not contain:

```text
business rules
Prisma
persistence logic
resource-specific authorization
dependency construction
```

---

## Service

The Service represents an application use case.

Examples:

```text
CreateUserService
UpdateUserService
CancelOrderService
ApproveInvoiceService
CreateSessionService
```

The Service owns:

```text
business rules
application orchestration
resource-specific authorization
Repository coordination
expected application failures
```

Example:

```text
CancelOrderService

1. load order
2. verify it exists
3. verify actor may cancel it
4. verify current state allows cancellation
5. update order
6. return result
```

The Service should not know HTTP details.

Avoid:

```text
Request
Response
HTTP status codes
Express middleware
```

inside Services.

The Service should also not know Prisma directly.

---

## Repository

The Repository defines the persistence boundary used by Services.

Conceptually:

```text
Service
  ↓
Repository contract
```

Example:

```ts
interface UserRepository {
  findById(id: string): Promise<User | null>;

  findByEmail(email: string): Promise<User | null>;

  create(data: CreateUserData): Promise<User>;

  update(id: string, data: UpdateUserData): Promise<User>;
}
```

Services depend on this contract rather than a specific ORM implementation.

---

## Repository implementation

Infrastructure provides the concrete implementation.

Example:

```text
UserRepository
        ↑
PrismaUserRepository
        ↓
Prisma
        ↓
Database
```

The Prisma implementation translates application persistence operations into ORM operations.

Prisma-specific behavior should remain behind this boundary.

Do not expose Prisma as the persistence API of Controllers or Services.

---

## Dependency direction

Runtime execution flows downward:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository
  ↓
Infrastructure
```

Source dependencies should preserve architectural boundaries.

The application core should not depend on HTTP or ORM implementation details.

Conceptually:

```text
HTTP
  ↓
Application
  ↓
Persistence contracts

Infrastructure
  └── implements persistence contracts
```

A Service may know:

```text
UserRepository
TokenProvider
PasswordHasher
MailProvider
```

but should not need to know:

```text
PrismaUserRepository
JwtTokenProvider
BcryptPasswordHasher
ResendMailProvider
```

when those are replaceable infrastructure implementations.

---

## Dependency Injection

Execution flows top-down:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository
```

Construction happens bottom-up:

```text
Prisma
  ↓
PrismaRepository
  ↓
Service
  ↓
Controller
  ↓
Route
```

Example:

```ts
const userRepository = new PrismaUserRepository(prisma);

const updateUserService = new UpdateUserService(userRepository);

const updateUserController = new UpdateUserController(updateUserService);
```

Components use dependencies.

Composition constructs dependencies.

Do not construct infrastructure inside Services or Controllers.

---

## Composition Root

Concrete dependency selection belongs to composition code.

Example:

```text
composition/
└── users.ts
```

It may decide:

```text
UserRepository
→ PrismaUserRepository

PasswordHasher
→ BcryptPasswordHasher

TokenProvider
→ JwtTokenProvider
```

Composition knows concrete implementations.

Application Services generally do not.

Do not place business logic in composition code.

---

## Module structure

Organize application behavior by cohesive feature.

Example:

```text
src/
├── modules/
│   ├── users/
│   ├── sessions/
│   ├── orders/
│   └── invoices/
│
├── infrastructure/
├── http/
├── composition/
└── shared/
```

A feature may contain:

```text
users/
├── controllers/
├── services/
├── repositories/
├── validation/
└── routes/
```

The filesystem should expose:

```text
feature ownership
layer responsibility
dependency direction
discoverability
```

Do not introduce unnecessary architectural nesting.

---

## CRUD and domain actions

CRUD operations are application use cases.

Example:

```text
User
│
├── CreateUser
├── GetUser
├── ListUsers
├── UpdateUser
└── DeleteUser
```

Non-CRUD behavior follows the same architecture.

Example:

```text
Order
│
├── CreateOrder
├── GetOrder
├── CancelOrder
└── ShipOrder
```

`CancelOrder` is not a special architectural category.

It is another application use case owned by the `orders` module.

Example:

```text
Route
  ↓
CancelOrderController
  ↓
CancelOrderService
  ↓
OrderRepository
```

Do not force domain actions into CRUD semantics.

---

## Actor and target

For protected operations, distinguish the authenticated actor from the target resource.

Example:

```text
PATCH /users/:userId
```

There may be:

```text
actorId
→ authenticated user

userId
→ user being modified
```

Do not assume they are identical.

The Controller passes the relevant identity information to the Service.

The Service applies resource-specific authorization.

Example:

```text
request.auth.userId
        ↓
     actorId

request.params.userId
        ↓
     targetId
```

This distinction is important for:

```text
ownership
admin operations
tenant boundaries
delegated actions
```

---

## Error flow

Expected application failures should use the application's error abstraction.

Example:

```ts
throw new AppError("User not found", 404);
```

The Service may raise expected failures.

Controllers and Routes should not repeatedly translate those failures manually.

Prefer centralized HTTP error handling:

```text
Service
  ↓
AppError
  ↓
global error handler
  ↓
HTTP response
```

Unexpected errors should remain distinguishable from expected application failures.

Do not duplicate error translation across Controllers.

---

## Complete request example

Consider:

```text
PATCH /orders/:orderId/cancel
```

The request may flow as:

```text
Client
  ↓
Route
  │
  ├── ensureAuthenticated
  ├── validate orderId
  └── CancelOrderController
            ↓
      CancelOrderService
            │
            ├── load Order
            ├── verify existence
            ├── verify actor authorization
            ├── verify cancellable state
            └── persist cancellation
            ↓
       OrderRepository
            ↓
    PrismaOrderRepository
            ↓
          Prisma
            ↓
         Database
```

Responsibilities remain separated.

The Route knows HTTP composition.

Authentication establishes the actor.

Validation verifies input structure.

The Controller translates HTTP into Service input.

The Service makes application decisions.

The Repository exposes persistence operations.

The Prisma implementation performs persistence.

---

## Boundary test

When deciding where code belongs, ask what kind of decision it represents.

```text
HTTP endpoint composition?
→ Route

Who is the caller?
→ Authentication

Broad access restriction?
→ Route authorization middleware

Input shape or format?
→ Validation

HTTP ↔ application translation?
→ Controller

Business rule?
→ Service

Resource-specific authorization?
→ Service

Persistence operation?
→ Repository

Prisma-specific implementation?
→ PrismaRepository

Concrete dependency construction?
→ Composition

Cross-cutting infrastructure?
→ Infrastructure/shared boundary
```

If a piece of code appears in the wrong layer, move the responsibility rather than hiding it behind a helper.

---

## Avoid architectural leakage

Avoid:

```text
Route → Prisma
Controller → Prisma
Service → PrismaClient
Repository → Express Request
Service → Express Response
Validation → database query
Controller → resource ownership logic
Composition → business logic
```

These relationships blur architectural boundaries.

Prefer:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository
  ↓
Infrastructure
```

with cross-cutting concerns applied at their appropriate boundaries.

---

## Existing repository first

Before implementing a task, inspect the existing repository.

Determine:

```text
module organization
layer conventions
dependency composition
Repository contracts
error handling
authentication context
validation approach
route registration
test conventions
```

Do not restructure working architecture merely to match an example in this document.

When existing code is compatible with these boundaries, follow its convention.

When a task requires an architectural change, make the change deliberately and consistently.

---

## Overall architecture

The application should remain understandable as:

```text
                 HTTP boundary
                      │
                      ▼
                    Route
                      │
       ┌──────────────┼──────────────┐
       │              │              │
Authentication  Authorization   Validation
       │              │              │
       └──────────────┼──────────────┘
                      ▼
                  Controller
                      │
                      ▼
                   Service
             ┌────────┼────────┐
             │        │        │
         Business   Resource   Application
          rules      authz     orchestration
             └────────┼────────┘
                      ▼
             Repository contract
                      │
                      ▼
          Repository implementation
                      │
                      ▼
                   Prisma
                      │
                      ▼
                  Database
```

Dependency construction remains separate:

```text
Infrastructure
      ↓
Repository implementation
      ↓
Service
      ↓
Controller
      ↓
Route
```

---

## Architectural rules

- Routes define HTTP composition, not business behavior.
- Authentication establishes trusted actor identity.
- Broad/static authorization may happen in route middleware.
- Resource-specific authorization belongs in Services.
- Validation handles structural input correctness.
- Controllers translate HTTP into application calls and responses.
- Services own application use cases and business decisions.
- Services must not depend directly on Prisma.
- Repositories define persistence boundaries.
- Concrete Repository implementations may depend on Prisma.
- Infrastructure details must not leak into application layers.
- Use constructor injection for required collaborators.
- Construct concrete dependencies in composition code.
- Keep business logic out of composition code.
- Organize behavior around cohesive feature modules.
- Keep domain actions inside their owning module.
- Distinguish authenticated actor from target resource.
- Use centralized error translation.
- Preserve dependency direction.
- Avoid unnecessary abstraction and nesting.
- Inspect existing project conventions before changing structure.
- Prefer explicit boundaries over hidden dependencies.
