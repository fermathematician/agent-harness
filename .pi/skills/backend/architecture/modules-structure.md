# Module Structure

## Purpose

Organize the backend so the filesystem exposes:

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

This is a convention, not a mandatory filesystem.

Inspect and preserve a coherent existing project structure before reorganizing it.

## Feature modules

Keep related application behavior together.

Example:

```text
users/
├── controllers/
│   ├── CreateUserController.ts
│   └── UpdateUserController.ts
├── services/
│   ├── CreateUserService.ts
│   └── UpdateUserService.ts
├── repositories/
│   ├── UserRepository.ts
│   └── PrismaUserRepository.ts
├── validation/
└── routes/
```

Prefer explicit use-case names over generic classes such as:

```text
UserManager
UserHandler
GeneralService
```

Prefer one Service per application use case.

Repositories may be shared by multiple use cases.

## Alternative: use-case folders

When a feature grows, use cases may be grouped directly:

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

Use this when grouping related files by use case improves navigation.

For smaller modules, layer folders are usually simpler.

Do not introduce nesting without practical value.

## Avoid excessive nesting

Avoid structures such as:

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

unless the existing architecture genuinely requires it.

Prefer the minimum nesting needed to preserve:

```text
feature
responsibility
dependency direction
discoverability
```

## Domain actions

Non-CRUD behavior stays inside the module that owns it.

```text
orders/
├── controllers/
│   └── CancelOrderController.ts
└── services/
    └── CancelOrderService.ts
```

Likewise:

```text
invoices/
├── controllers/
│   └── ApproveInvoiceController.ts
└── services/
    └── ApproveInvoiceService.ts
```

Do not create generic directories such as:

```text
actions/
special/
misc/
```

for behavior naturally owned by a feature.

## Infrastructure

Infrastructure shared across modules may live outside feature modules.

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

Example Prisma infrastructure:

```text
infrastructure/
└── prisma/
    ├── client.ts
    └── repositories/
```

Keep infrastructure-specific code out of application layers.

Preserve:

```text
Service
→ Repository contract
→ infrastructure implementation
→ Prisma
```

## Repository placement

For a compact project:

```text
users/
└── repositories/
    ├── UserRepository.ts
    └── PrismaUserRepository.ts
```

When infrastructure is separated:

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

Follow one convention consistently.

## Validation and Routes

Keep feature-specific validation and Routes with their owning feature when appropriate.

```text
users/
├── validation/
│   ├── create-user.schema.ts
│   └── update-user.schema.ts
└── routes/
    └── users.routes.ts
```

Project-wide HTTP middleware may remain outside modules:

```text
http/
└── middleware/
    ├── ensureAuthenticated.ts
    └── errorHandler.ts
```

## Composition

Keep dependency construction separate from application behavior.

Example:

```text
composition/
├── users.ts
├── sessions.ts
└── orders.ts
```

Composition assembles:

```text
Repository
  ↓
Service
  ↓
Controller
  ↓
Route
```

Do not place business logic in composition files.

## Shared code

Move code to shared areas only when ownership is genuinely cross-cutting.

Possible examples:

```text
AppError
authentication middleware
validation middleware
logging
configuration
```

Avoid dumping unrelated code into:

```text
shared/
common/
utils/
helpers/
```

Prefer explicit names and clear ownership.

## Cross-module boundaries

Do not casually import internal implementation files from another module.

Avoid:

```text
orders
  ↓
users/services/internal-helper.ts
```

If modules must collaborate, use an explicit application or infrastructure boundary.

Place behavior according to the capability that owns it, not merely the database entity it touches.

## Adding behavior

A new use case belongs to its owning module.

Example:

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

Reuse existing Repository, validation, composition, and infrastructure where appropriate.

Do not create a new architectural pattern for each use case.

Create a new module only for a cohesive application capability, not for every endpoint.

## Rules

- Prefer feature-oriented modules.
- Preserve clear layer responsibilities inside each feature.
- Prefer explicit use-case names.
- Prefer one Service per application use case.
- Share Repositories across related use cases when appropriate.
- Keep domain actions inside their owning module.
- Keep shared infrastructure outside feature modules when appropriate.
- Keep Prisma-specific code behind infrastructure-aware Repository implementations.
- Keep feature-specific Routes and validation near their owning feature.
- Keep project-wide HTTP middleware separate when appropriate.
- Keep dependency composition separate from application behavior.
- Avoid `actions`, `special`, `misc`, `utils`, or `helpers` dumping grounds.
- Avoid unnecessary nesting.
- Avoid importing another module's internal implementation directly.
- Preserve coherent existing project conventions.
- Prefer the simplest structure that keeps ownership and boundaries obvious.
