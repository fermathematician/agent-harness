---
name: architecture
description: Backend architecture conventions for request flow, routes, module organization, dependency direction, and dependency injection.
---

# Backend Architecture

## Architecture map

Use this architecture:

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

Keep each responsibility in its owning boundary.

```text
Route
→ HTTP method, path, middleware, Controller selection

Authentication
→ trusted actor identity

Authorization middleware
→ broad/static access rules

Validation
→ structural params/body/query validation

Controller
→ HTTP ↔ application translation

Service
→ business rules
→ application orchestration
→ resource-specific authorization

Repository
→ application persistence contract

Repository implementation
→ Prisma-specific persistence

Composition
→ concrete dependency construction
```

Runtime dependency flow:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository contract
  ↓
Infrastructure
```

Dependency construction happens in the opposite direction:

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

Avoid shortcuts:

```text
Route → Prisma
Controller → Prisma
Service → PrismaClient

Repository → Express Request
Service → Express Response

Validation → database

Controller → resource-specific authorization

Composition → business logic
```

---

# Routes

## Purpose

Routes define HTTP entry points.

They compose:

```text
HTTP method + path
  ↓
middleware
  ↓
Controller
```

A Route should make visible:

```text
endpoint
authentication
broad authorization
validation
Controller
```

Routes compose behavior.

They do not implement application behavior.

## Boundary

Never put in Routes:

```text
Prisma
database queries
resource loading
ownership checks
business rules
application orchestration
error translation
```

Use:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository
```

The Route selects the Controller.

The Controller translates HTTP into a use case.

## Endpoint mapping

Prefer one endpoint mapped to one explicit application action.

```text
POST /users
→ CreateUser

GET /users/:userId
→ GetUser

GET /users
→ ListUsers

PATCH /users/:userId
→ UpdateUser

DELETE /users/:userId
→ DeleteUser
```

Domain actions remain explicit:

```text
POST /orders/:orderId/cancel
→ CancelOrder

POST /invoices/:invoiceId/approve
→ ApproveInvoice

POST /users/:userId/deactivate
→ DeactivateUser
```

Do not hide meaningful application actions behind generic CRUD endpoints.

## HTTP methods

Use methods according to semantics.

```text
GET
→ retrieve

POST
→ create or trigger an action

PUT
→ replace

PATCH
→ partially modify

DELETE
→ remove
```

## Paths

Prefer resource-oriented paths.

```text
/users
/users/:userId

/orders
/orders/:orderId
```

Use explicit action segments for non-CRUD operations.

```text
/orders/:orderId/cancel
/invoices/:invoiceId/approve
```

Avoid vague paths:

```text
/doUpdate
/processUser
/executeAction
```

Prefer explicit parameter names:

```text
:userId
:orderId
:companyId
```

instead of generic `:id` when clarity benefits.

## Params

Route:

```text
declares the parameter
```

Validation:

```text
checks structural correctness
```

Service:

```text
determines whether the resource exists
```

Do not query persistence from Routes merely to validate that an identifier exists.

## Authentication

Protected routes should make Authentication explicit.

```ts
router.get("/me", ensureAuthenticated, getCurrentUserController.handle);
```

Public routes intentionally omit it.

```ts
router.post(
  "/sessions",
  validate({
    body: createSessionBodySchema,
  }),
  createSessionController.handle,
);
```

A reader should be able to determine whether an endpoint is public or protected from route composition.

## Authorization

Use Route middleware for broad/static authorization.

Examples:

```text
authenticated?
ADMIN?
reports:read?
```

```ts
router.get(
  "/admin/users",
  ensureAuthenticated,
  ensureRole("ADMIN"),
  listUsersController.handle,
);
```

Keep resource-specific authorization in Services.

If the decision requires:

```text
ownership
tenant
resource state
resource loading
business relationship
```

it belongs to the application boundary, normally the Service.

## Validation

Attach structural validation explicitly to the endpoint.

```ts
router.patch(
  "/:userId",
  ensureAuthenticated,
  validate({
    params: updateUserParamsSchema,
    body: updateUserBodySchema,
  }),
  updateUserController.handle,
);
```

Prefer endpoint-specific schemas.

```text
CreateUser
→ createUserBodySchema

UpdateUser
→ updateUserBodySchema

ListUsers
→ listUsersQuerySchema
```

Avoid one giant entity schema reused indiscriminately.

## Router grouping

Group cohesive endpoint families.

```text
users.routes.ts
sessions.routes.ts
orders.routes.ts
invoices.routes.ts
```

Do not put the entire API into one route file.

Feature-local routing is also valid:

```text
modules/
└── users/
    └── routes/
        └── users.routes.ts
```

Follow the coherent existing convention.

## Route registration

Use one consistent registration convention.

Example:

```ts
app.use("/users", usersRouter);
```

with:

```ts
router.get("/:userId", getUserController.handle);
```

giving:

```text
GET /users/:userId
```

Do not randomly mix full and relative paths.

## Current actor

Use `/me` when the endpoint specifically targets the authenticated actor.

```text
GET /users/me
PATCH /users/me
```

Identity comes from:

```text
request.auth.userId
```

The client does not need to provide its own identifier.

## Controller binding

When passing class methods to Express, preserve `this`.

One valid convention:

```ts
class CreateUserController {
  handle = async (request: Request, response: Response) => {
    // ...
  };
}
```

Another:

```ts
router.post("/users", createUserController.handle.bind(createUserController));
```

Follow one convention consistently.

## Route rules

- Keep Routes as HTTP composition boundaries.
- Keep Prisma and business rules out of Routes.
- Route requests through Controllers.
- Map endpoints to explicit application actions.
- Use resource-oriented paths.
- Use explicit action paths for domain actions.
- Make public/protected access visible.
- Use middleware for broad authorization.
- Keep resource authorization in Services.
- Attach structural validation at the Route boundary.
- Keep resource existence checks out of Routes.
- Group related endpoints coherently.
- Preserve centralized error handling.

---

# Module Structure

## Purpose

The filesystem should expose:

```text
feature ownership
layer responsibility
dependency direction
discoverability
```

Prefer the simplest structure that preserves these properties.

Architecture should reduce ambiguity, not create ceremony.

## Default structure

Prefer feature-oriented modules.

```text
src/
├── modules/
│   ├── users/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── validation/
│   │   └── routes/
│   │
│   ├── sessions/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── validation/
│   │   └── routes/
│   │
│   └── orders/
│       ├── controllers/
│       ├── services/
│       ├── repositories/
│       ├── validation/
│       └── routes/
│
├── infrastructure/
│   ├── prisma/
│   ├── mail/
│   ├── auth/
│   └── storage/
│
├── http/
│   └── middleware/
│
├── composition/
│   ├── users.ts
│   ├── sessions.ts
│   └── orders.ts
│
└── shared/
    └── errors/
        └── AppError.ts
```

This is the preferred shape, not a reason to reorganize a coherent existing project unnecessarily.

Inspect the project first.

## Feature modules

Keep related behavior together.

```text
users/
├── controllers/
│   ├── CreateUserController.ts
│   └── UpdateUserController.ts
├── services/
│   ├── CreateUserService.ts
│   └── UpdateUserService.ts
├── repositories/
│   └── UserRepository.ts
├── validation/
└── routes/
```

Prefer explicit use-case names.

Avoid:

```text
UserManager
UserHandler
GeneralService
```

Prefer one Service per application use case.

Repositories may serve many Services.

## Use-case folders

When a feature grows substantially, grouping by use case is allowed.

```text
users/
├── create-user/
│   ├── CreateUserController.ts
│   └── CreateUserService.ts
├── get-user/
│   ├── GetUserController.ts
│   └── GetUserService.ts
├── update-user/
│   ├── UpdateUserController.ts
│   └── UpdateUserService.ts
├── repositories/
└── routes/
```

Use this only when it improves navigation.

For smaller modules, layer folders are simpler.

## Avoid excessive nesting

Do not introduce structures such as:

```text
modules/
└── users/
    └── application/
        └── use-cases/
            └── commands/
                └── create/
                    └── services/
                        └── CreateUserService.ts
```

without a concrete architectural need.

Use the minimum nesting necessary to preserve:

```text
feature
responsibility
dependency direction
discoverability
```

## Domain actions

Domain behavior remains in the module that owns it.

```text
orders/
├── controllers/
│   └── CancelOrderController.ts
└── services/
    └── CancelOrderService.ts
```

Do not create generic directories such as:

```text
actions/
special/
misc/
```

for behavior naturally owned by a feature.

## Infrastructure

Infrastructure shared by multiple features may live outside modules.

```text
infrastructure/
├── prisma/
├── mail/
├── auth/
└── storage/
```

Infrastructure-specific code must remain outside application logic.

Preserve:

```text
Service
  ↓
Repository contract
  ↓
infrastructure implementation
  ↓
Prisma
```

## Repository placement

Compact project:

```text
modules/
└── users/
    └── repositories/
        ├── UserRepository.ts
        └── PrismaUserRepository.ts
```

Separated infrastructure:

```text
modules/
└── users/
    └── repositories/
        └── UserRepository.ts

infrastructure/
└── prisma/
    └── repositories/
        └── PrismaUserRepository.ts
```

Both are acceptable.

Pick one coherent convention.

## Validation and Routes

Feature-specific files normally remain near the owning feature.

```text
users/
├── validation/
│   ├── create-user.schema.ts
│   └── update-user.schema.ts
└── routes/
    └── users.routes.ts
```

Project-wide middleware may remain outside modules.

```text
http/
└── middleware/
    ├── ensureAuthenticated.ts
    └── errorHandler.ts
```

## Shared code

Move code into shared areas only when ownership is genuinely cross-cutting.

Possible examples:

```text
AppError
global middleware
logging
configuration
```

Do not use:

```text
shared/
common/
utils/
helpers/
```

as dumping grounds for unrelated code.

Prefer explicit ownership.

## Cross-module boundaries

Do not casually import another module's internal implementation.

Avoid:

```text
orders
  ↓
users/services/internal-helper.ts
```

When modules need to collaborate, use an explicit application or infrastructure boundary.

Place behavior with the capability that owns it, not simply with whichever database table it touches.

## Adding behavior

New use cases stay inside their owning module.

```text
DeactivateUser
```

may add:

```text
users/
├── controllers/
│   └── DeactivateUserController.ts
├── services/
│   └── DeactivateUserService.ts
└── routes/
    └── users.routes.ts
```

Reuse existing Repository, validation, infrastructure, and composition where appropriate.

Do not invent a new architectural pattern for each endpoint.

Create a new module for a cohesive application capability, not for every use case.

## Module rules

- Prefer feature-oriented modules.
- Keep layer responsibilities visible.
- Prefer explicit use-case names.
- Prefer one Service per use case.
- Share Repositories across related Services.
- Keep domain actions inside their owning feature.
- Keep shared infrastructure outside feature modules when useful.
- Keep feature-specific Routes and validation near their feature.
- Keep global HTTP middleware separate when appropriate.
- Avoid `actions`, `special`, `misc`, `utils`, and `helpers` dumping grounds.
- Avoid unnecessary nesting.
- Avoid importing another module's internals directly.
- Preserve coherent project conventions.

---

# Dependency Injection

## Purpose

Components use dependencies.

Composition constructs dependencies.

Runtime:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository contract
  ↓
PrismaRepository
  ↓
Prisma
```

Construction:

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

## Constructor injection

Prefer constructor injection for required collaborators.

```ts
class CreateUserService {
  constructor(private readonly userRepository: UserRepository) {}
}
```

Do not construct dependencies inside application components.

Avoid:

```ts
class CreateUserService {
  async execute(input: CreateUserInput) {
    const repository = new PrismaUserRepository(prisma);

    // ...
  }
}
```

Dependencies should be supplied from outside.

## Service dependencies

Services receive only the collaborators needed by the use case.

```ts
class CreateSessionService {
  constructor(
    private readonly userRepository: UserRepository,

    private readonly passwordHasher: PasswordHasher,

    private readonly tokenProvider: TokenProvider,
  ) {}
}
```

Services must not instantiate:

```text
PrismaClient
Prisma repositories
hashers
token providers
mail providers
payment gateways
external API clients
```

Services must not access Prisma directly.

## Repository dependencies

Services depend on contracts:

```text
CreateUserService
        ↓
UserRepository
```

not concrete persistence:

```text
CreateUserService
        ↓
PrismaUserRepository
```

Concrete implementations may depend on Prisma:

```ts
class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}
}
```

## Controller dependencies

Controllers receive Services.

```ts
class CreateUserController {
  constructor(private readonly createUserService: CreateUserService) {}
}
```

Do not construct Services, Repositories, or infrastructure from Controllers.

## Route dependencies

Routes use already-composed Controllers.

```ts
router.post(
  "/users",
  validate({
    body: createUserBodySchema,
  }),
  createUserController.handle,
);
```

Do not assemble the dependency graph inside request handlers.

## Composition Root

Centralize construction in composition code.

```ts
const userRepository = new PrismaUserRepository(prisma);

const createUserService = new CreateUserService(userRepository);

const createUserController = new CreateUserController(createUserService);
```

The Composition Root may know concrete implementations.

```text
UserRepository
→ PrismaUserRepository

PasswordHasher
→ BcryptPasswordHasher

TokenProvider
→ JwtTokenProvider
```

Composition must not contain business logic.

As the application grows:

```text
composition/
├── users.ts
├── sessions.ts
├── orders.ts
└── invoices.ts
```

## Dependency reuse

Reuse infrastructure dependencies when appropriate.

```ts
const userRepository = new PrismaUserRepository(prisma);

const createUserService = new CreateUserService(userRepository);

const getUserService = new GetUserService(userRepository);

const updateUserService = new UpdateUserService(userRepository);
```

Do not recreate infrastructure unnecessarily.

## Infrastructure contracts

Use contracts for meaningful infrastructure boundaries.

Examples:

```text
UserRepository
PasswordHasher
TokenProvider
MailProvider
PaymentGateway
FileStorage
```

Do not mechanically create an interface for every class.

Avoid unnecessary patterns such as:

```text
ICreateUserService
CreateUserServiceImpl
```

without a real architectural boundary.

## Hidden dependencies

Do not bypass DI with global infrastructure imports inside application code.

Avoid:

```ts
import { prisma } from "@/database";

class CreateUserService {
  async execute(input: CreateUserInput) {
    return prisma.user.create({
      data: input,
    });
  }
}
```

Architectural dependencies should remain explicit.

## Service Locator

Do not resolve dependencies dynamically inside Services or Controllers.

Avoid:

```ts
const repository = container.resolve("UserRepository");
```

If a DI container exists, use it only at composition.

Do not introduce one without a concrete need.

Manual DI is preferred when sufficient.

## Dependency scope

Inject only what a component actually needs.

Prefer:

```ts
constructor(
  private readonly userRepository:
    UserRepository,

  private readonly mailProvider:
    MailProvider,
) {}
```

Do not inject a generic application-wide dependency bag.

If a Service needs many unrelated dependencies, inspect whether the Service has too many responsibilities.

## Testing

Dependencies should remain replaceable through the same contracts.

Production:

```ts
new CreateUserService(new PrismaUserRepository(prisma));
```

Test:

```ts
new CreateUserService(new InMemoryUserRepository());
```

Do not modify Service behavior merely to replace infrastructure during tests.

## DI rules

- Prefer constructor injection.
- Components use dependencies; composition constructs them.
- Services do not construct infrastructure.
- Controllers do not construct Services or Repositories.
- Routes do not construct dependency graphs.
- Services depend on Repository contracts.
- Keep Prisma behind concrete Repository implementations.
- Create interfaces for meaningful boundaries, not mechanically.
- Centralize construction in composition code.
- Keep business logic out of composition.
- Reuse dependencies where appropriate.
- Do not hide dependencies behind global imports.
- Do not use Service Locator inside application components.
- Do not introduce a DI container without a concrete need.
- Inject only the dependencies each component requires.
- Preserve existing coherent composition conventions.

---

# Final architecture rules

- Keep responsibilities in their owning layer.
- Keep Routes declarative and HTTP-focused.
- Keep Controllers as HTTP/application translators.
- Keep business behavior in Services.
- Keep resource-specific authorization in Services.
- Keep Services independent from Express and Prisma.
- Keep persistence behind Repository contracts.
- Keep Prisma inside Repository implementations.
- Organize behavior by cohesive feature modules.
- Keep domain actions with their owning feature.
- Keep shared infrastructure separate when appropriate.
- Keep dependency construction in composition code.
- Keep architectural dependencies explicit.
- Prefer simple manual constructor injection.
- Avoid unnecessary abstractions and nesting.
- Inspect the existing project before introducing structural changes.
- Preserve existing conventions when they are compatible with these boundaries.
