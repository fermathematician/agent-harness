---
name: prisma
description: Prisma conventions for repository integration, client lifecycle, raw SQL, performance, and existing project patterns.
---

# Prisma

## Boundary

Keep Prisma inside persistence infrastructure.

```text
Service
  ↓
Repository contract
  ↓
PrismaRepository
  ↓
Prisma
  ↓
Database
```

Do not use Prisma directly from:

```text
Routes
Controllers
Services
Validation
```

## PrismaClient

Use the project's shared application-managed `PrismaClient`.

Inject it into Prisma Repository implementations when required.

```ts
class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}
}
```

Do not create a new `PrismaClient` per request, Service, or Repository operation.

## Repository implementation

Repository methods should express application persistence needs.

Prefer:

```text
findById()
findByEmail()
findMany()
create()
update()
```

Avoid exposing Prisma query configuration through Repository contracts:

```ts
repository.find({
  where,
  include,
  select,
  orderBy,
});
```

Do not recreate Prisma's query API behind a Repository abstraction.

Services should depend on application-oriented persistence methods, not Prisma-specific query objects.

## Raw SQL

Prefer Prisma query APIs.

Use raw SQL only for a concrete need that Prisma does not handle appropriately.

Keep raw SQL inside persistence infrastructure.

Always parameterize untrusted values.

## Performance

Before optimizing, inspect:

```text
query count
rows returned
relations loaded
selected fields
pagination
indexes
aggregation
transaction scope
```

Avoid obvious N+1 queries and unnecessary data loading.

Prefer targeted query changes over architectural complexity.

Do not introduce complexity without evidence or a clear access-pattern requirement.

## Existing project first

Before modifying Prisma code, inspect:

```text
schema.prisma
PrismaClient lifecycle
Repository conventions
migration workflow
transaction strategy
query patterns
error mapping
```

Follow coherent existing project conventions.

Do not introduce a second persistence style without a task-specific reason.

## Rules

- Keep Prisma behind Repository implementations.
- Reuse the project-managed `PrismaClient`.
- Do not expose Prisma query objects through Repository contracts.
- Keep Repository methods application-oriented.
- Keep raw SQL exceptional and infrastructure-local.
- Parameterize untrusted SQL values.
- Inspect query behavior before optimizing.
- Avoid obvious N+1 queries and unnecessary data loading.
- Preserve coherent existing Prisma conventions.
