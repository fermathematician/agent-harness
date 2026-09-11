# CRUD

## Purpose

CRUD organizes application behavior around entities or aggregates while implementing operations as explicit use cases.

The entity provides the conceptual grouping.

The use case provides the implementation boundary.

Example:

```text
User
├── CreateUser
├── GetUser
├── ListUsers
├── UpdateUser
├── DeleteUser
├── DeactivateUser
└── ChangeUserEmail
```

Do not treat CRUD as one generic Service containing `create`, `get`, `update`, and `delete`.

Prefer explicit use cases with their own Controller and Service while sharing the entity Repository contract.

## Architecture

Use the standard application flow:

```text
Route
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

Each layer follows its dedicated skill.

This skill defines how those layers are assembled around entity use cases.

## Entity and use case

Organize related application behavior around an entity or aggregate.

Examples:

```text
User
Order
Invoice
Company
Product
```

Implement application behavior through explicit use cases.

Prefer:

```text
CreateUser
GetUser
ListUsers
UpdateUser
DeleteUser
```

over generic methods such as:

```text
UserService.create()
UserService.get()
UserService.update()
UserService.delete()
```

When an operation develops meaningful application semantics, use a dedicated action:

```text
DeactivateUser
ChangeUserEmail
ApproveInvoice
CancelOrder
ConfirmPayment
```

Do not hide meaningful domain behavior inside generic CRUD operations merely because the same entity is modified.

## Use-case composition

A CRUD operation normally has:

```text
<UseCase>Controller
<UseCase>Service
```

Example:

```text
CreateUserController
  ↓
CreateUserService
  ↓
UserRepository
```

Keep entry points consistent:

```text
Controller.handle()
  ↓
Service.execute()
```

The Controller handles transport.

The Service implements the application use case.

The Repository exposes the persistence capabilities required by that use case.

## Repository reuse

Repositories are organized around entities or aggregates, not individual use cases.

Multiple Services may depend on the same Repository contract.

```text
CreateUserService ──┐
GetUserService ─────┤
UpdateUserService ──┼──→ UserRepository
DeleteUserService ──┘
```

A Service may call multiple Repository methods.

A Repository method may support multiple Services.

There is no required one-to-one relationship between Services and Repository methods.

Add Repository capabilities when actual use cases require them.

Do not create one Repository per use case.

Do not pre-build Repository APIs for hypothetical future operations.

## Naming conventions

Use predictable names across equivalent application operations.

### Create

```text
Create<Entity>Controller
Create<Entity>Service
Repository.create()
```

Example:

```text
CreateUserController
CreateUserService
UserRepository.create()
```

### Read one

```text
Get<Entity>Controller
Get<Entity>Service
Repository.findBy...()
```

Example:

```text
GetUserController
GetUserService
UserRepository.findById()
```

### Read many

```text
List<Entities>Controller
List<Entities>Service
Repository.findMany(...)
```

Example:

```text
ListUsersController
ListUsersService
UserRepository.findMany(...)
```

### Search

Use:

```text
Search<Entities>Controller
Search<Entities>Service
```

only when search represents a meaningfully distinct application operation.

If search is simply an optional filter of ordinary listing, keep it inside `List<Entities>`.

### Update

Use:

```text
Update<Entity>Controller
Update<Entity>Service
```

for ordinary editable properties.

When modification represents meaningful application behavior, use an explicit action:

```text
DeactivateUser
BlockUser
ChangeUserPassword
ApproveInvoice
CancelOrder
```

### Delete

Use:

```text
Delete<Entity>Controller
Delete<Entity>Service
```

only when actual deletion is intended.

Do not call deactivation, archival, or another state transition `Delete`.

## Read operations

Read is not necessarily one generic operation.

Common forms include:

```text
Get<Entity>
List<Entities>
Search<Entities>
domain-specific queries
```

Do not create a new application use case merely because the Repository supports another lookup method.

For example:

```ts
findByEmail();
```

may simply support another use case internally.

Create:

```text
GetUserByEmail
```

only when retrieval by email is itself meaningful application behavior.

## Lists, filters, and search

Collection use cases may support:

```text
pagination
filtering
ordering
search
visibility
scope
```

Keep responsibility separated:

```text
HTTP representation
  ↓
Controller / validation
  ↓
application input
  ↓
Service
  ↓
persistence criteria
  ↓
Repository
```

Do not pass raw Express query objects into Services or Repositories.

Do not expose raw Prisma query objects through Repository contracts.

Prefer typed application input:

```ts
interface ListUsersRequest {
  page: number;
  pageSize: number;
  active?: boolean;
  search?: string;
}
```

For flexible filters:

```text
findMany(options)
```

For stable domain-specific queries:

```text
explicit Repository method
```

Do not create a Repository method for every possible combination of optional filters.

## Create

Creation normally follows:

```text
Create<Entity>Controller
  ↓
Create<Entity>Service
  ↓
application checks
  ↓
Repository.create()
```

The Controller owns HTTP representation.

The Service owns creation rules.

The Repository owns persistence.

## Update

General updates normally follow:

```text
Update<Entity>Controller
  ↓
Update<Entity>Service
  ↓
load current state
  ↓
apply application rules
  ↓
Repository.update()
```

Only fields intentionally exposed by the use case may be changed.

Do not pass arbitrary request bodies directly into persistence.

When distinct application behavior appears, extract it from generic Update.

Prefer:

```text
ChangeOrderAddress
CancelOrder
ConfirmOrder
```

when those operations have their own semantics.

## Delete

Deletion normally follows:

```text
Delete<Entity>Controller
  ↓
Delete<Entity>Service
  ↓
validate operation
  ↓
Repository.delete()
```

Distinguish:

```text
delete       → physical removal
soft delete  → logical removal
deactivate   → state transition
archive      → archival behavior
```

Use names that match the real operation.

## Domain actions beyond CRUD

CRUD is a starting vocabulary, not a restriction.

Domain actions use the same architecture:

```text
<Action>Controller
  ↓
<Action>Service
  ↓
Repository contracts / other dependencies
```

Examples:

```text
ApproveInvoice
CancelOrder
ActivateSubscription
TransferOwnership
ResetPassword
ConfirmPayment
SuspendAccount
```

Do not force domain actions into generic `update()` operations.

The architecture remains stable while the application vocabulary becomes more expressive.

## Multiple repositories

One use case may coordinate multiple entities or aggregates when required.

Example:

```text
CreateOrderService
├── UserRepository
├── ProductRepository
└── OrderRepository
```

The Service coordinates the application operation.

Do not merge unrelated persistence responsibilities into one Repository merely because one Service uses them together.

Keep Repository ownership aligned with entities or aggregates.

## Transactions

When several persistence operations must succeed or fail together, follow the project's transaction convention.

The atomic boundary should represent the cohesive use case.

Do not create independent transaction boundaries that break required atomicity.

## Dependency direction

Use:

```text
Controller
  depends on
Service
  depends on
Repository contract
```

Concrete implementations are selected during application composition.

Do not instantiate concrete Repositories inside Services.

Do not instantiate Services inside `Controller.handle()`.

Dependencies are supplied from outside according to the project composition convention.

## Validation and authorization

Follow their dedicated skills.

At the CRUD composition level, preserve:

```text
transport validation
→ structural input

Service
→ business rules
→ resource-specific authorization

Repository / database
→ persistence integrity
```

Do not duplicate the same responsibility across layers.

## Persistence integrity

Application checks do not replace database constraints required to preserve invariants under concurrency.

Use application checks for application behavior and database constraints for integrity guarantees.

## CRUD completeness

Do not generate all CRUD operations merely for symmetry.

An entity may expose:

```text
Create + Read
Read only
Create + Read + Update
domain actions without generic Update
```

Implement only the operations required by the application.

Architectural consistency does not require endpoint symmetry.

## Avoid generic CRUD abstractions

Avoid abstractions such as:

```ts
GenericCrudController<T>;
GenericCrudService<T>;
BaseRepository<T>;
```

when they erase application intent.

Prefer explicit use cases even when this creates some repetition.

Clarity of application behavior is more important than removing every repeated structural pattern.

## Evolution

Start with CRUD names when they accurately describe application behavior.

As rules grow, evolve operations into more explicit use cases.

Example:

```text
UpdateOrder
  ↓
ChangeOrderAddress
CancelOrder
ConfirmOrder
```

When a generic CRUD name stops describing the real operation, replace it with a meaningful use case.

## Overall convention

```text
User
│
├── CreateUser
│   ├── CreateUserController
│   └── CreateUserService
│
├── GetUser
│   ├── GetUserController
│   └── GetUserService
│
├── ListUsers
│   ├── ListUsersController
│   └── ListUsersService
│
├── UpdateUser
│   ├── UpdateUserController
│   └── UpdateUserService
│
├── DeleteUser
│   ├── DeleteUserController
│   └── DeleteUserService
│
└── UserRepository
    ├── findById()
    ├── findByEmail()
    ├── findMany()
    ├── create()
    └── update()
```

## Rules

- Organize related behavior around entities or aggregates.
- Implement operations as explicit use cases.
- Prefer one Controller and one Service per use case.
- Use `handle()` for Controllers.
- Use `execute()` for Services.
- Reuse the entity Repository contract across Services.
- Do not create one Repository per use case.
- Keep concrete persistence behind Repository contracts.
- Use consistent Create/Get/List/Update/Delete naming.
- Use Search only when distinct from ordinary List.
- Treat Read as several possible application operations.
- Use typed application inputs for collection queries.
- Do not pass raw HTTP or Prisma query objects across boundaries.
- Use generic Update only for ordinary edits.
- Extract meaningful domain behavior into dedicated use cases.
- Distinguish physical deletion from other state changes.
- Allow Services to use multiple Repository methods.
- Allow Repository methods to support multiple Services.
- Allow one use case to coordinate multiple Repositories when required.
- Keep Repository ownership aligned with entities or aggregates.
- Follow the project transaction strategy for atomic operations.
- Inject dependencies from outside.
- Follow dedicated validation and authorization skills for detailed rules.
- Preserve database constraints for concurrency-sensitive invariants.
- Do not generate unused CRUD operations for symmetry.
- Avoid generic CRUD abstractions that erase application intent.
- Let CRUD operations evolve into domain-specific use cases as application behavior grows.
