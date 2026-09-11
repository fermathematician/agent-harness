# Repository

## Purpose

A Repository encapsulates persistence for one entity or aggregate.

Services depend on Repository contracts, never directly on Prisma.

```text
Service
  ↓
Repository contract
  ↓
Prisma implementation
  ↓
Prisma
  ↓
Database
```

## Structure

Prefer an explicit contract:

```ts
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  update(id: string, data: UpdateUserData): Promise<User>;
  delete(id: string): Promise<void>;
}
```

and a concrete Prisma implementation:

```ts
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}
}
```

Keep Prisma-specific details inside the implementation.

## Contract

Repository contracts must describe application persistence needs.

Do not expose raw Prisma query APIs such as:

```text
where
include
select
orderBy
```

through the contract.

Prefer application-specific inputs:

```ts
interface FindUsersOptions {
  active?: boolean;
  page?: number;
  pageSize?: number;
}
```

Prefer intentional output types when callers do not need the complete persistence model.

Avoid exposing Prisma-generated input/output types as the application contract unless the project explicitly follows that convention.

## Lookups

For one optional record, use:

```ts
findById(id);
findByEmail(email);
findBySlug(slug);
```

Return:

```ts
Promise<Entity | null>;
```

Repository lookup misses return `null`.

The Service decides whether `null` represents an application error.

Do not throw `AppError` merely because a record was not found.

Internally:

```text
unique constraint     → findUnique
non-unique predicate  → findFirst
collection            → findMany
```

Do not expose these Prisma method names through the Repository contract.

## Collections

Use:

```ts
findMany(options);
```

for flexible collection queries.

Use:

```ts
findManyByCompanyId(companyId);
findManyByStatus(status);
```

for stable field-based collection lookups.

Use domain-specific names when they communicate intent better:

```ts
findActiveUsers();
findPendingInvoices();
findOverduePayments();
```

Paginate collections that may grow.

Make ordering explicit when result order matters.

Do not fetch whole tables and filter large datasets in application code.

## Query efficiency

Inside Prisma implementations:

- use `select` when only specific fields are required;
- use `include` only when relations are required;
- avoid broad relation trees;
- avoid N+1 queries;
- avoid unnecessary database round trips;
- prefer set-based queries over repeated queries in loops.

When only existence matters, expose:

```ts
existsByEmail(email): Promise<boolean>
existsById(id): Promise<boolean>
```

Do not fetch complete entities only to discard them.

## Create and update

Use dedicated application input types:

```ts
CreateUserData;
UpdateUserData;
```

Use:

```ts
create(data);
update(id, data);
```

for ordinary persistence operations.

Prefer explicit methods when the operation has meaningful intent:

```ts
updateEmail(id, email);
updateStatus(id, status);
incrementLoginAttempts(id);
markAsVerified(id);
```

Do not expose raw Prisma input types unnecessarily.

## Delete

Use:

```ts
delete id;
```

only for physical deletion.

For other semantics, use explicit names:

```ts
softDelete(id);
archive(id);
deactivate(id);
```

## Transactions

Use transactions when persistence operations must succeed or fail atomically.

When multiple Repositories participate in the same atomic use case, follow the project's shared transaction strategy.

Do not create independent transaction boundaries that break use-case atomicity.

## Errors

Do not catch Prisma errors without a concrete reason.

Do not silently swallow persistence failures.

Do not replace useful infrastructure errors with generic errors.

Business failures belong to the Service and follow the AppError convention.

## Naming

Standardize on:

```text
findBy...      → one optional record
findMany...    → collections
existsBy...    → existence boolean
count...       → counts
create         → creation
update         → general modification
delete         → physical deletion
```

Prefer domain-specific names when clearer.

Do not use `getBy...`, `loadBy...`, or `fetchBy...` as aliases for `findBy...`.

Do not encode incidental query mechanics in method names.

Avoid:

```ts
findManyOrderByCreatedAtDescWithPagination();
```

Prefer:

```ts
findMany(options);
```

unless ordering itself expresses domain intent:

```ts
findLatestUsers();
```

## Boundaries

Repository may:

```text
→ access persistence
→ translate application inputs into Prisma queries
→ optimize database access
→ implement entity/aggregate persistence operations
```

Repository must not:

```text
→ handle HTTP
→ implement business rules
→ decide that missing data is a 404
→ depend on Controllers
→ expose raw Prisma query APIs
```

Prefer explicit repositories:

```text
UserRepository
OrderRepository
InvoiceRepository
```

Avoid generic abstractions such as:

```ts
BaseRepository<T>;
```

when they erase useful domain intent.

## Rules

- Define an explicit Repository contract.
- Provide a Prisma-backed implementation.
- Keep Prisma inside the implementation.
- Make Services depend on Repository contracts.
- Use application-specific inputs and intentional outputs.
- Return `null` for optional lookup misses.
- Let Services interpret missing records.
- Do not throw business `AppError`s from Repositories.
- Use Prisma lookup methods according to unique/non-unique/collection semantics.
- Select only required data when practical.
- Load relations only when required.
- Paginate growing collections.
- Make important ordering explicit.
- Avoid N+1 queries and unnecessary database work.
- Do not expose raw Prisma query objects.
- Do not catch persistence errors without a concrete reason.
- Use transactions when atomicity is required.
- Prefer explicit entity/aggregate Repositories over generic base repositories.
- Follow Repository naming conventions consistently.
