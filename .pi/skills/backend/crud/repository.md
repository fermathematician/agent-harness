# Repository

## Purpose

A Repository encapsulates persistence access for a specific domain entity or aggregate.

Its responsibility is to provide a stable application-facing API for reading and writing data while hiding Prisma-specific query details behind the repository implementation.

Repositories should expose operations in terms of application intent rather than exposing raw ORM behavior.

## Structure

Prefer two parts:

- a repository contract
- a Prisma implementation

Example:

    export interface UserRepository {
      findById(id: string): Promise<User | null>;
      findByEmail(email: string): Promise<User | null>;
      create(data: CreateUserData): Promise<User>;
      update(id: string, data: UpdateUserData): Promise<User>;
      delete(id: string): Promise<void>;
    }

Implementation:

    export class PrismaUserRepository implements UserRepository {
      constructor(private readonly prisma: PrismaClient) {}

      async findById(id: string): Promise<User | null> {
        return this.prisma.user.findUnique({
          where: { id },
        });
      }
    }

The repository contract should express what the application needs from persistence.

The Prisma implementation should translate that contract into Prisma queries.

## Naming

Prefer repository method names that describe application intent.

Good examples:

- `findById`
- `findByEmail`
- `findMany`
- `create`
- `update`
- `delete`
- `existsByEmail`
- `findActiveUsers`
- `findByCustomerId`

Avoid leaking Prisma method names into the application contract unnecessarily.

For example, prefer:

    findByEmail(email)

over:

    findFirstUserWhereEmailEquals(email)

Repository methods should be predictable and concise.

## Inputs

Do not pass arbitrary Prisma query objects through the repository API.

Avoid:

    repository.findMany({
      where: ...,
      include: ...,
      orderBy: ...
    });

That makes the repository a thin alias for Prisma and leaks ORM semantics to its callers.

Prefer application-specific input types:

    interface FindUsersOptions {
      active?: boolean;
      page?: number;
      pageSize?: number;
    }

Then translate those options into Prisma inside the implementation.

## Outputs

Return types should be intentional.

Do not return more data than the caller needs.

When a use case requires only a subset of fields, prefer a specific result type rather than fetching the entire model.

Example:

    export interface UserSummary {
      id: string;
      name: string;
      email: string;
    }

Repository method:

    findSummaries(): Promise<UserSummary[]>;

Prisma implementation:

    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

## Prisma query conventions

### findUnique

Use `findUnique` when querying a field or combination of fields backed by a Prisma unique constraint.

Example:

    return this.prisma.user.findUnique({
      where: { id },
    });

### findFirst

Use `findFirst` when looking for the first record matching a non-unique predicate.

Example:

    return this.prisma.user.findFirst({
      where: {
        companyId,
        active: true,
      },
    });

Do not use `findFirst` when a true unique lookup exists.

### findMany

Use `findMany` for collections.

For collections that may become large, support filtering and pagination rather than loading the entire table.

Avoid unrestricted:

    prisma.user.findMany()

when the dataset can grow significantly.

### select

Prefer `select` when the caller only needs specific fields.

Example:

    select: {
      id: true,
      name: true,
      email: true,
    }

This makes the query explicit and avoids retrieving unnecessary data.

### include

Use `include` when related records are genuinely required by the repository operation.

Avoid broad nested `include` trees by default.

Do not eagerly fetch relations "just in case".

### orderBy

Make ordering explicit when result order matters.

Do not rely on implicit database ordering.

### pagination

For ordinary paginated lists, support explicit pagination parameters.

Example:

    const skip = (page - 1) * pageSize;

    return this.prisma.user.findMany({
      skip,
      take: pageSize,
      orderBy: {
        createdAt: "desc",
      },
    });

For very large or frequently changing datasets, consider cursor-based pagination when appropriate.

## Creation and update inputs

Prefer dedicated input types rather than using raw Prisma generated input types everywhere.

Example:

    export interface CreateUserData {
      name: string;
      email: string;
      age: number;
    }

    export interface UpdateUserData {
      name?: string;
      email?: string;
      age?: number;
    }

This keeps the repository contract stable even if the Prisma schema changes.

## Existence checks

When the caller only needs to know whether a record exists, prefer an explicit repository method.

Example:

    existsByEmail(email: string): Promise<boolean>;

The implementation may use an efficient query such as:

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    return user !== null;

Do not fetch a full record only to discard all of its fields.

## Transactions

Use Prisma transactions when multiple persistence operations must succeed or fail atomically.

Example:

    await this.prisma.$transaction(async (tx) => {
      await tx.order.create(...);
      await tx.inventory.update(...);
    });

Keep transactional persistence logic cohesive.

Do not split operations that must be atomic across unrelated transaction boundaries.

When several repositories must participate in the same transaction, use a project-level transaction pattern rather than creating independent transactions inside each repository call.

## Error handling

Do not catch Prisma errors unless there is a concrete reason to translate or enrich them.

Avoid:

    try {
      return await this.prisma.user.create(...);
    } catch {
      throw new Error("Database error");
    }

This destroys useful error information.

If a Prisma-specific error must be handled, narrow it explicitly and preserve useful context.

Do not silently swallow persistence failures.

## Query efficiency

Repositories should avoid unnecessary database work.

Prefer:

- selecting only needed fields;
- filtering in the database instead of filtering large result sets in memory;
- using unique indexes for unique lookups;
- paginating potentially large collections;
- avoiding unnecessary relation loading;
- batching or restructuring repeated queries when an N+1 pattern appears.

Avoid:

- fetching an entire table and filtering in JavaScript;
- fetching full related objects when only identifiers are required;
- repeated queries inside loops when a set-based query is possible;
- broad `include` trees without a concrete use case.

## Repository size

Keep repositories cohesive around one entity or aggregate.

If a repository becomes a collection of unrelated queries, split it by domain responsibility rather than creating a generic database utility.

Avoid generic repositories such as:

    BaseRepository<T>

when they erase useful domain-specific method names and force all persistence concerns into generic CRUD primitives.

Prefer explicit repositories such as:

- `UserRepository`
- `OrderRepository`
- `InvoiceRepository`

with methods that communicate domain intent.

## Rules

When implementing a repository:

- define an explicit repository contract;
- provide a Prisma-backed implementation;
- keep Prisma details inside the implementation;
- use intentional method names;
- use application-specific input and output types;
- prefer `findUnique` for unique lookups;
- prefer `findFirst` for non-unique predicates;
- use `select` when only part of a record is required;
- use `include` only when relations are needed;
- paginate collections that can grow;
- make important ordering explicit;
- avoid passing raw Prisma query objects through the repository API;
- avoid exposing unnecessary Prisma-generated types as the application contract;
- do not catch database errors without a specific reason;
- avoid N+1 queries and unnecessary database round trips;
- use transactions for persistence operations that must be atomic;
- prefer explicit domain repositories over generic base repositories.

## Naming conventions

Repository method names should describe the persistence intent clearly and consistently.

Prefer predictable verbs and suffixes across the project.

### Single record lookup

Use `findBy<Field>` when the lookup is based on one or more fields and may return no result.

Examples:

    findById(id: string)
    findByEmail(email: string)
    findBySlug(slug: string)
    findByCompanyId(companyId: string)
    findByEmailAndCompanyId(email: string, companyId: string)

Return:

    Promise<Entity | null>

Prefer `findBy...` over ambiguous names such as:

    getUser()
    searchUser()
    loadUser()
    fetchUser()

unless the project defines a separate semantic distinction for those verbs.

### Collection lookup

Use `findMany` for generic collection queries.

Example:

    findMany(options: FindUsersOptions)

Use `findManyBy<Field>` when the collection is constrained by a specific field.

Examples:

    findManyByCompanyId(companyId: string)
    findManyByStatus(status: UserStatus)
    findManyByRole(role: UserRole)

For domain-specific queries, prefer names that describe the result intent.

Examples:

    findActiveUsers()
    findPendingInvoices()
    findOverduePayments()
    findUsersEligibleForReview()

Do not force every query into generic CRUD naming when a domain-specific name communicates intent better.

### Existence checks

Use `existsBy<Field>` when only existence matters.

Examples:

    existsByEmail(email: string)
    existsById(id: string)
    existsByExternalId(externalId: string)

Return:

    Promise<boolean>

Do not use `findBy...` and discard the result when the application only needs a boolean.

### Creation

Use `create`.

Example:

    create(data: CreateUserData)

Return the created entity or an intentional result type.

Avoid names such as:

    insertUser()
    addUser()
    saveNewUser()

unless they have a distinct project-level meaning.

### Update

Use `update` for a general entity update.

Example:

    update(id: string, data: UpdateUserData)

For narrow or domain-specific updates, prefer explicit names.

Examples:

    updateEmail(id: string, email: string)
    updateStatus(id: string, status: UserStatus)
    incrementLoginAttempts(id: string)
    markAsVerified(id: string)

Do not use a generic `update()` when a more explicit method communicates an important persistence operation better.

### Delete

Use `delete` for physical deletion.

Example:

    delete(id: string)

For logical deletion or state changes, use the actual intent.

Examples:

    softDelete(id: string)
    archive(id: string)
    deactivate(id: string)

Do not call a soft-delete operation `delete` if the record remains persisted.

### Count

Use `count` for generic counting.

Example:

    count(options?: CountUsersOptions)

Use `countBy<Field>` when counting by a specific condition.

Examples:

    countByStatus(status: UserStatus)
    countByCompanyId(companyId: string)

### Aggregations

Name aggregation methods after the value being produced.

Examples:

    sumOutstandingBalance()
    calculateAverageOrderValue()
    countActiveUsers()
    findHighestInvoiceValue()

Prefer explicit aggregate intent over generic names such as:

    aggregate()
    calculate()
    queryStats()

### Ordering and pagination

Do not encode incidental query implementation details into method names.

Avoid:

    findManyOrderByCreatedAtDescWithPagination()

Prefer:

    findMany(options)

where the contract defines:

    interface FindUsersOptions {
      page?: number;
      pageSize?: number;
      orderBy?: UserOrderBy;
    }

If ordering is part of the actual domain meaning, an explicit method name is acceptable.

Example:

    findLatestUsers()
    findOldestPendingOrders()

### Prisma-specific names

Do not mirror Prisma method names in the repository contract unless they also express application intent.

Avoid:

    findUnique()
    findFirst()
    upsertPrismaUser()

Prefer:

    findByEmail()
    findActiveByCompanyId()
    upsertByExternalId()

Prisma-specific operations belong in the implementation.

### General naming rules

Prefer:

- `findBy...` for one optional record;
- `findMany...` for collections;
- `existsBy...` for boolean existence checks;
- `count...` for counts;
- `create` for creation;
- `update` or explicit update intent for changes;
- `delete` only for physical deletion;
- domain-specific names when they communicate intent better than generic CRUD verbs.

Method names should describe what the repository provides to the application, not which Prisma function is used internally.

Do not use `getBy...` as an alias for `findBy...`.

Standardize on `findBy...` for lookups that may return `null`.
