# Module Structure

## Purpose

Module structure defines how application code is organized into cohesive features and responsibilities.

The goal is to make it easy to answer:

```text
Where does this code belong?
What feature owns it?
Which layer is this?
What can depend on what?
Where should a new use case be added?
```

A good module structure should make the architecture visible from the filesystem.

---

## Core principle

Organize code so that:

```text
feature ownership
+
layer responsibility
```

remain clear.

For example:

```text
users/
├── controllers/
├── services/
├── repositories/
├── validation/
└── routes/
```

A developer should be able to open `users/` and find the code related to the User feature.

At the same time, each file should still preserve its architectural responsibility.

---

## Feature-oriented organization

Prefer grouping code by feature when the application has multiple business areas.

Example:

```text
src/
└── modules/
    ├── users/
    ├── sessions/
    ├── orders/
    └── invoices/
```

Each module may contain:

```text
controllers
services
repositories
validation
routes
```

Example:

```text
src/
└── modules/
    └── users/
        ├── controllers/
        ├── services/
        ├── repositories/
        ├── validation/
        └── routes/
```

This keeps related behavior close together.

---

## Avoid global layer folders as the application grows

A purely layer-oriented structure may begin as:

```text
src/
├── controllers/
├── services/
├── repositories/
├── validation/
└── routes/
```

This can work for a small application.

But as features grow:

```text
controllers/
├── CreateUserController.ts
├── CancelOrderController.ts
├── ApproveInvoiceController.ts
├── CreateSessionController.ts
└── ...
```

the feature relationship becomes harder to see.

Prefer feature ownership when the project benefits from it:

```text
modules/
├── users/
├── orders/
├── invoices/
└── sessions/
```

Do not reorganize an existing project without reason.

Follow the established project convention unless the task explicitly includes restructuring.

---

## Recommended module shape

A feature may look like:

```text
modules/
└── users/
    ├── controllers/
    │   ├── CreateUserController.ts
    │   ├── GetUserController.ts
    │   ├── ListUsersController.ts
    │   └── UpdateUserController.ts
    │
    ├── services/
    │   ├── CreateUserService.ts
    │   ├── GetUserService.ts
    │   ├── ListUsersService.ts
    │   └── UpdateUserService.ts
    │
    ├── repositories/
    │   ├── UserRepository.ts
    │   └── PrismaUserRepository.ts
    │
    ├── validation/
    │   ├── create-user.schema.ts
    │   ├── update-user.schema.ts
    │   └── list-users.schema.ts
    │
    └── routes/
        └── users.routes.ts
```

The exact file names may vary.

The important part is that ownership and responsibility remain obvious.

---

## Use cases as implementation boundaries

Inside a feature, prefer explicit application use cases.

For example:

```text
CreateUser
GetUser
ListUsers
UpdateUser
DeleteUser
DeactivateUser
```

Each use case typically has:

```text
Controller
Service
```

Example:

```text
CreateUser
├── CreateUserController
└── CreateUserService
```

The Repository is normally shared by use cases that operate on the same entity or aggregate.

```text
User
│
├── CreateUser
├── GetUser
├── UpdateUser
└── DeactivateUser
     │
     └── UserRepository
```

Do not create one Repository per use case without a specific reason.

---

## Naming by use case

Prefer names that communicate application intent.

Examples:

```text
CreateUserService
UpdateUserController
ApproveInvoiceService
CancelOrderController
CreateSessionService
```

Avoid generic names such as:

```text
UserManager
UserHandler
UserProcessor
CommonService
GeneralController
```

The filename should make the application operation clear.

---

## One Service per use case

Prefer one Service per application use case.

Example:

```text
CreateUserService
GetUserService
UpdateUserService
DeactivateUserService
```

Avoid growing a single class into:

```ts
class UserService {
  create() {}
  get() {}
  list() {}
  update() {}
  delete() {}
  deactivate() {}
  resetPassword() {}
  approveSomething() {}
}
```

A generic Service tends to accumulate unrelated application behavior.

Use-case Services keep responsibilities explicit.

---

## One Controller per HTTP action

Prefer Controllers aligned with application actions.

Example:

```text
CreateUserController
GetUserController
ListUsersController
UpdateUserController
```

Avoid a large Controller that handles many unrelated endpoints.

For example:

```ts
class UserController {
  create() {}
  get() {}
  list() {}
  update() {}
  delete() {}
}
```

may become harder to evolve and inject cleanly.

Follow the project's established convention if it already uses a different Controller style.

---

## Repository placement

Repository contracts and implementations belong close to the feature they represent when they are feature-specific.

Example:

```text
users/
└── repositories/
    ├── UserRepository.ts
    └── PrismaUserRepository.ts
```

Conceptually:

```text
UserRepository
→ application persistence contract

PrismaUserRepository
→ infrastructure implementation
```

For larger architectures, contracts and infrastructure implementations may be separated further.

For example:

```text
users/
└── repositories/
    └── UserRepository.ts

infrastructure/
└── prisma/
    └── repositories/
        └── PrismaUserRepository.ts
```

Both structures can work.

Use the project convention consistently.

---

## Keep Prisma isolated

Prisma-specific code should remain in infrastructure-aware files.

Prefer:

```text
Service
→ UserRepository
→ PrismaUserRepository
→ Prisma
```

Do not spread Prisma imports across:

```text
Services
Controllers
Routes
Validation
```

The filesystem should reinforce the same dependency boundary as the architecture.

---

## Validation placement

Endpoint/use-case schemas should live near the feature that owns them.

Example:

```text
users/
└── validation/
    ├── create-user.schema.ts
    ├── update-user.schema.ts
    └── list-users.schema.ts
```

Schemas should reflect operations, not merely database entities.

Prefer:

```text
create-user.schema.ts
update-user.schema.ts
```

over:

```text
user.schema.ts
```

when the operations accept different structures.

Shared generic validation utilities may live outside the feature.

Example:

```text
shared/
└── validation/
    └── validate.ts
```

---

## Route placement

Routes may live inside the feature:

```text
users/
└── routes/
    └── users.routes.ts
```

or in a central route directory:

```text
routes/
├── users.routes.ts
├── orders.routes.ts
└── sessions.routes.ts
```

Both are valid.

Choose based on the project convention.

The route file should remain a composition boundary regardless of location.

---

## Composition placement

Dependency composition may be centralized:

```text
src/
└── composition/
    ├── users.ts
    ├── sessions.ts
    └── orders.ts
```

or live with each feature:

```text
modules/
└── users/
    └── composition/
        └── users.composition.ts
```

Composition code constructs:

```text
Repository implementation
→ Service
→ Controller
→ Route
```

Do not put business logic in composition files.

---

## Shared code

Not every reusable file belongs in `shared/`.

Create shared code only when multiple modules genuinely depend on the same capability.

Examples may include:

```text
AppError
validate middleware
authentication middleware
logging
configuration
common infrastructure contracts
```

Avoid immediately moving code into:

```text
shared/
common/
utils/
helpers/
```

merely because it could theoretically be reused.

Prefer keeping code with its owning feature until reuse is real.

---

## Avoid the shared dumping ground

Directories such as:

```text
utils/
helpers/
common/
shared/
```

can become architectural dumping grounds.

Avoid files such as:

```text
helpers.ts
utils.ts
common.ts
functions.ts
```

Prefer names that describe responsibility.

Example:

```text
PasswordHasher
TokenProvider
validate
AppError
Clock
```

A shared abstraction should still represent a cohesive capability.

---

## Cross-module dependencies

Modules should not casually reach into each other's internal files.

Avoid:

```text
orders/
  ↓ imports
users/services/internal-helper.ts
```

If one module requires behavior owned by another module, prefer an explicit application boundary.

Depending on the project, this may be:

```text
a Service
a Repository contract
a domain/application interface
a public module API
```

The exact mechanism depends on architecture.

The important rule is to avoid accidental coupling through internal implementation files.

---

## Module ownership

Every important piece of business behavior should have a clear owner.

For example:

```text
User profile
→ users

Login/session creation
→ sessions/auth

Order cancellation
→ orders

Invoice approval
→ invoices
```

Do not place behavior based only on which entity happens to be touched.

Choose the module that owns the application capability.

---

## Authentication module

Authentication-related use cases may form their own feature.

Example:

```text
modules/
└── sessions/
    ├── controllers/
    │   └── CreateSessionController.ts
    ├── services/
    │   └── CreateSessionService.ts
    ├── validation/
    │   └── create-session.schema.ts
    └── routes/
        └── sessions.routes.ts
```

Shared authentication middleware may live in:

```text
auth/
middleware/
```

or another project-wide infrastructure area.

Separate:

```text
login/session use cases
```

from:

```text
request authentication middleware
```

when they serve different architectural responsibilities.

---

## Domain actions

Non-CRUD behavior remains inside the module that owns it.

Example:

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

for behavior that naturally belongs to a feature.

---

## Infrastructure

Infrastructure used by many modules may live outside feature modules.

Example:

```text
src/
├── modules/
│   ├── users/
│   ├── orders/
│   └── invoices/
│
└── infrastructure/
    ├── prisma/
    ├── mail/
    ├── auth/
    └── storage/
```

Possible structure:

```text
infrastructure/
└── prisma/
    ├── client.ts
    └── repositories/
```

Application modules depend on contracts.

Infrastructure provides concrete implementations.

---

## Project-wide HTTP concerns

Global HTTP infrastructure may live outside feature modules.

Example:

```text
src/
└── http/
    ├── middleware/
    │   ├── ensureAuthenticated.ts
    │   └── errorHandler.ts
    └── server.ts
```

Feature-specific routing remains within or near its module.

Project-wide middleware should not be duplicated inside every feature.

---

## Example project structure

A moderate backend may look like:

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
│   └── auth/
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

This is an example, not a mandatory filesystem.

The project's established convention remains authoritative.

---

## Alternative: use-case folders

A feature may instead organize each use case as a folder.

Example:

```text
users/
├── create-user/
│   ├── CreateUserController.ts
│   └── CreateUserService.ts
│
├── get-user/
│   ├── GetUserController.ts
│   └── GetUserService.ts
│
├── update-user/
│   ├── UpdateUserController.ts
│   └── UpdateUserService.ts
│
├── repositories/
└── routes/
```

This can work well when use cases contain several related files.

For smaller modules, layer folders may be simpler.

Do not introduce nesting that adds navigation cost without value.

---

## Flat vs nested structure

Avoid excessive nesting.

Bad:

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

unless the project genuinely needs that architecture.

Prefer the simplest structure that preserves:

```text
feature ownership
layer responsibility
dependency direction
discoverability
```

Architecture should reduce ambiguity, not create ceremony.

---

## File size and responsibility

A growing file may indicate several responsibilities were combined.

Examples:

```text
UserService.ts with every User operation
users.routes.ts with unrelated features
helpers.ts with dozens of unrelated functions
```

Prefer splitting by application responsibility rather than arbitrary line count.

Do not split files merely because they are long.

Split when responsibilities become meaningfully distinct.

---

## Barrel exports

Files such as:

```text
index.ts
```

may simplify module imports.

Example:

```ts
export { CreateUserService } from "./CreateUserService";

export { UpdateUserService } from "./UpdateUserService";
```

Use them only if they improve the project.

Avoid deep chains of barrel exports that hide dependency origins or introduce circular dependencies.

Direct imports are acceptable.

---

## Circular dependencies

Module structure should avoid circular dependency relationships.

For example:

```text
users
→ orders
→ users
```

may indicate unclear ownership or badly placed shared behavior.

Do not solve circular dependencies merely with import tricks.

Inspect the architectural relationship.

Possible solutions may include:

```text
extracting a meaningful contract
moving behavior to its true owning module
introducing application orchestration
removing unnecessary cross-module knowledge
```

---

## Existing project conventions

Before creating or moving files, inspect the repository.

Determine:

```text
current module structure
naming conventions
route organization
composition approach
repository placement
validation placement
test placement
```

Do not impose this document mechanically on an established project.

Preserve existing conventions when they are compatible with the architecture.

Introduce structural changes deliberately.

---

## Adding a new use case

When adding a new application action:

```text
DeactivateUser
```

identify:

```text
owning module
Service
Controller if HTTP-exposed
validation if required
Repository methods if persistence is required
Route if HTTP-exposed
composition changes
tests
```

Conceptually:

```text
users/
├── controllers/
│   └── DeactivateUserController.ts
├── services/
│   └── DeactivateUserService.ts
└── routes/
    └── users.routes.ts
```

Reuse existing module infrastructure where appropriate.

Do not create an entirely new architectural pattern for each use case.

---

## Adding a new feature

When a new cohesive business capability appears, create a module if it has meaningful independent behavior.

For example:

```text
orders/
```

may own:

```text
CreateOrder
GetOrder
CancelOrder
ShipOrder
```

Do not create a new module for every individual endpoint.

Modules represent cohesive application capabilities.

Use cases represent individual operations inside them.

---

## Overall convention

Prefer:

```text
Application
│
├── Users
│   ├── CreateUser
│   ├── GetUser
│   ├── UpdateUser
│   └── UserRepository
│
├── Orders
│   ├── CreateOrder
│   ├── CancelOrder
│   └── OrderRepository
│
└── Sessions
    └── CreateSession
```

Each module owns cohesive application behavior.

Inside each module:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository
```

Project-wide infrastructure remains outside individual use cases where appropriate.

---

## Rules

When organizing modules:

- prefer clear feature ownership;
- preserve architectural layer responsibilities inside features;
- prefer explicit use-case names;
- prefer one Service per application use case;
- prefer Controllers aligned with HTTP/application actions;
- share Repositories across related use cases when appropriate;
- keep Prisma-specific code in infrastructure-aware Repository implementations;
- keep endpoint validation close to the feature that owns it;
- group cohesive Routes together;
- keep dependency composition separate from application behavior;
- create shared code only when reuse or cross-cutting ownership is real;
- do not use `shared`, `common`, `utils`, or `helpers` as dumping grounds;
- avoid modules importing each other's internal implementation details;
- place behavior in the module that owns the capability;
- keep project-wide infrastructure separate when it serves multiple modules;
- avoid unnecessary nesting and architectural ceremony;
- do not introduce abstractions solely to mirror a theoretical architecture;
- investigate circular dependencies as architectural problems;
- inspect existing repository conventions before creating or moving files;
- preserve compatible existing structure instead of reorganizing automatically;
- create new modules for cohesive capabilities, not individual endpoints;
- keep the filesystem understandable as a map of the application.
