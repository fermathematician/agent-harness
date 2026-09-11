---
name: crud
description: Backend CRUD conventions for explicit use cases, repositories, services, controllers, and expected application errors.
---

# CRUD

## Purpose

Organize application behavior around entities or aggregates while implementing operations as explicit use cases.

Prefer:

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

Do not create one generic Service containing all CRUD methods.

Each use case normally has:

```text
<UseCase>Controller
        ↓
<UseCase>Service
        ↓
<Entity>Repository
```

Use:

```text
Controller.handle()
        ↓
Service.execute()
```

Standard flow:

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

## CRUD naming

Prefer:

```text
Create<Entity>
Get<Entity>
List<Entities>
Update<Entity>
Delete<Entity>
```

Example:

```text
CreateUserController
CreateUserService

GetUserController
GetUserService

ListUsersController
ListUsersService

UpdateUserController
UpdateUserService

DeleteUserController
DeleteUserService
```

Use `Search<Entities>` only when search is meaningfully different from ordinary listing with filters.

When an operation gains specific application semantics, use a domain action instead of hiding it inside generic CRUD.

Prefer:

```text
DeactivateUser
ChangeUserEmail
CancelOrder
ApproveInvoice
ConfirmPayment
```

Do not force meaningful domain actions into generic `update()` use cases.

Physical deletion, soft deletion, deactivation, and archival are different operations.

Use names that represent the real behavior.

## CRUD completeness

Implement only operations required by the application.

Do not generate Create/Get/List/Update/Delete merely for symmetry.

An entity may legitimately support:

```text
read only
create + read
create + read + update
domain actions without generic update
```

Avoid generic abstractions such as:

```ts
GenericCrudController<T>;
GenericCrudService<T>;
BaseRepository<T>;
```

when they erase application intent.

Prefer explicit use cases even when some structure repeats.

---

# Repository

## Purpose

A Repository encapsulates persistence for one entity or aggregate.

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

Services depend on Repository contracts, not Prisma.

## Structure

Prefer an explicit contract:

```ts
export interface UserRepository {
  findById(id: string): Promise<User | null>;

  findByEmail(email: string): Promise<User | null>;

  findMany(options?: FindUsersOptions): Promise<User[]>;

  create(data: CreateUserData): Promise<User>;

  update(id: string, data: UpdateUserData): Promise<User>;
}
```

Concrete implementation:

```ts
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}
}
```

Keep Prisma-specific behavior inside the concrete implementation.

## Repository reuse

Repositories are organized around entities or aggregates, not use cases.

```text
CreateUserService ──┐
GetUserService ─────┤
UpdateUserService ──┼──→ UserRepository
DeleteUserService ──┘
```

Do not create one Repository per use case.

Add Repository capabilities only when actual use cases require them.

## Contract design

Repository contracts describe application persistence needs.

Prefer:

```text
findById()
findByEmail()
findMany()
existsByEmail()
count()
create()
update()
```

Use domain-specific names when clearer:

```text
findPendingInvoices()
findOverduePayments()
markAsVerified()
```

Do not expose raw Prisma query APIs through contracts:

```text
where
include
select
orderBy
```

Avoid contracts that merely recreate Prisma:

```ts
repository.find({
  where,
  include,
  select,
  orderBy,
});
```

Use application-specific inputs instead.

```ts
interface FindUsersOptions {
  active?: boolean;
  page?: number;
  pageSize?: number;
}
```

## Lookups

For optional single-record lookups:

```text
findById()
findByEmail()
findBySlug()
```

return:

```ts
Promise<Entity | null>;
```

A missing Repository result is not automatically an application error.

The Service decides what `null` means for the use case.

Do not throw business `AppError`s merely because a lookup returned no record.

## Collections

Use:

```text
findMany(options)
```

for flexible collections.

Use explicit Repository methods when the query itself has stable application meaning.

Paginate collections that may grow.

Make ordering explicit when it matters.

Do not fetch entire tables and filter large datasets in application code.

## Persistence efficiency

Inside Prisma implementations:

```text
select only required fields
include relations only when required
avoid broad relation trees
avoid N+1 queries
avoid unnecessary round trips
prefer set-based operations
```

Do not fetch a complete entity merely to answer an existence check when an efficient alternative exists.

## Writes

Use explicit application input types:

```text
CreateUserData
UpdateUserData
```

Do not expose raw Prisma input types unnecessarily.

Use generic `update()` for ordinary editable fields.

Use explicit methods when modification carries meaningful intent.

```text
updateEmail()
updateStatus()
markAsVerified()
archive()
deactivate()
```

## Repository boundaries

Repository may:

```text
access persistence
translate application inputs into Prisma queries
optimize database access
persist entities/aggregates
```

Repository must not:

```text
handle HTTP
implement business rules
decide that missing data is a 404
depend on Controllers
expose raw Prisma query APIs
```

Do not catch persistence errors without a concrete reason.

Do not silently swallow persistence failures.

---

# Service

## Purpose

A Service implements one application use case.

Prefer:

```text
CreateUserService
UpdateUserEmailService
DeactivateUserService
CancelOrderService
```

Avoid generic god Services such as:

```text
UserService
OrderService
```

containing many unrelated operations.

## Structure

Use `execute()` consistently.

```ts
export interface CreateUserRequest {
  name: string;
  email: string;
}

export class CreateUserService {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: CreateUserRequest): Promise<User> {
    // application logic
  }
}
```

## Dependencies

Inject dependencies through the constructor.

Depend on application contracts:

```ts
constructor(
  private readonly userRepository:
    UserRepository,
  private readonly emailGateway:
    EmailGateway,
) {}
```

Never:

```text
instantiate Prisma repositories
instantiate gateways
access Prisma directly
```

inside the Service.

## Input and output

Service input contains only application data required by the use case.

Prefer:

```ts
service.execute({
  userId,
  email,
});
```

Never pass:

```text
Express Request
Express Response
raw HTTP query objects
transport middleware objects
```

Return an intentional application result.

Do not return HTTP-specific structures such as:

```text
statusCode
headers
response body wrappers
```

## Business rules

Business rules belong in Services.

Examples:

```text
uniqueness/conflict rules
resource-specific authorization
valid state transitions
balance rules
stock rules
eligibility rules
whether an operation is allowed
```

Example:

```ts
const user = await this.userRepository.findById(userId);

if (!user) {
  throw new AppError("User not found", 404);
}
```

Repositories return persistence information.

Services interpret that information according to the use case.

## Validation boundary

Structural validation belongs to the HTTP validation boundary.

Examples:

```text
required field
primitive type
UUID format
email format
query parsing
```

Business validation belongs in the Service.

Do not duplicate structural validation already guaranteed by the HTTP boundary unless an independent application invariant requires it.

## Orchestration

A Service may coordinate multiple Repositories or Gateways when the use case requires it.

Example:

```text
CreateOrderService
├── UserRepository
├── ProductRepository
└── OrderRepository
```

Do not merge unrelated persistence responsibilities into one Repository merely because one Service needs all of them.

If multiple persistence operations must be atomic, follow the project's transaction convention.

## Error handling

Use `AppError` for expected application failures.

Do not return error objects.

Do not catch errors unless there is a concrete need to:

```text
recover
retry
translate a known failure
add meaningful application context
```

Unexpected infrastructure failures should normally propagate.

Do not convert unexpected failures into `AppError`.

## Service boundaries

Service may:

```text
enforce business rules
coordinate application operations
interpret Repository results
perform resource-specific authorization
throw expected AppErrors
```

Service must not:

```text
handle HTTP
use Express Request/Response
access Prisma directly
instantiate infrastructure
parse structural HTTP input
return HTTP responses
```

---

# Controller

## Purpose

A Controller is the HTTP boundary for one application use case.

```text
HTTP request
  ↓
extract validated input
  ↓
Service.execute()
  ↓
HTTP response
```

Prefer one Controller per HTTP-facing use case.

Use `handle()` consistently.

## Structure

```ts
export class CreateUserController {
  constructor(private readonly createUserService: CreateUserService) {}

  async handle(request: Request, response: Response): Promise<Response> {
    const { name, email } = request.body;

    const user = await this.createUserService.execute({
      name,
      email,
    });

    return response.status(201).json(user);
  }
}
```

## Dependencies

Inject the required Service.

Do not instantiate Services inside `handle()`.

A Controller should normally call one cohesive application Service for the HTTP action.

Do not use Controllers to orchestrate unrelated Services.

## Input

Translate HTTP input into explicit application input.

Possible HTTP sources:

```text
request.body
request.params
request.query
authenticated request context
```

Extract only what the Service requires.

Prefer:

```ts
await service.execute({
  userId,
  email,
});
```

Avoid:

```ts
service.execute(request);
service.execute(request.body);
service.execute(request.query);
```

unless that exact validated shape intentionally represents the application input.

Do not pass Express infrastructure into Services.

## Authentication context

Extract authenticated identity as application data.

Prefer:

```ts
await service.execute({
  actorId: request.auth.userId,
});
```

Do not pass:

```text
tokens
sessions
middleware objects
Request
```

into the Service.

## Success response

The Controller owns successful HTTP representation.

It may choose:

```text
status code
response body
headers
cookies
redirects
streams/files
```

Example:

```ts
return response.status(201).json(user);
```

The Service returns application data.

The Controller translates it into HTTP.

Do not make Services return:

```ts
{
  statusCode: 201,
  body: user,
}
```

## Response data

Return intentional public data.

Do not expose sensitive or internal persistence fields accidentally.

Follow existing Presenter or Response DTO conventions when transformation is required.

Do not turn Controllers into large mapping layers.

## Errors

Do not catch `AppError` individually.

Let expected and unexpected failures propagate to global error handling unless transport-specific handling is deliberately required.

Do not duplicate global error handling across Controllers.

## Controller boundaries

Controller may:

```text
read Request
write Response
extract validated input
extract authentication context
call Service
choose successful HTTP representation
```

Controller must not:

```text
access Prisma
query the database
call Repository directly
contain business rules
perform resource-specific authorization
instantiate Services
```

Keep Controllers thin:

```text
extract input
  ↓
call Service
  ↓
return response
```

---

# AppError

## Purpose

Use `AppError` for expected application failures that should become HTTP error responses.

Do not convert unexpected errors into `AppError`.

## Implementation

Use:

```ts
export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
  }
}
```

Do not add fields unless required by the task or existing architecture.

## Usage

Throw `AppError` where an expected application failure is detected, normally in the Service.

```ts
const user = await userRepository.findById(id);

if (!user) {
  throw new AppError("User not found", 404);
}
```

```ts
const existingUser = await userRepository.findByEmail(email);

if (existingUser) {
  throw new AppError("Email already exists", 409);
}
```

Repositories must not throw business `AppError`s for conditions such as:

```text
user not found
email already exists
operation not permitted
```

Controllers must not catch `AppError` individually.

## Error flow

Expected failure:

```text
Service
  ↓
throw AppError
  ↓
global error handler
  ↓
HTTP error response
```

Unexpected failure:

```text
unexpected error
  ↓
global error handler
  ↓
generic 500 response
```

## Status codes

Use status codes according to semantics.

```text
400 → invalid request when no better status applies
401 → authentication required or invalid
403 → authenticated but forbidden
404 → resource not found
409 → conflict with current state
422 → structurally valid input rejected by application/domain rule
```

Do not deliberately wrap unexpected failures as:

```ts
throw new AppError("Internal server error", 500);
```

Let unexpected errors propagate.

## Global error handler

Use one global HTTP error handler.

Conceptually:

```ts
export function errorHandler(error, request, response, next) {
  if (error instanceof AppError) {
    return response.status(error.statusCode).json({
      error: error.message,
    });
  }

  return response.status(500).json({
    error: "Internal server error",
  });
}
```

Never expose:

```text
stack traces
database errors
unexpected internal errors
implementation details
```

to clients.

## Final rules

- Organize related behavior around entities or aggregates.
- Implement application operations as explicit use cases.
- Prefer one Controller and one Service per use case.
- Use `handle()` for Controllers.
- Use `execute()` for Services.
- Reuse the entity Repository across related Services.
- Do not create one Repository per use case.
- Keep Prisma behind concrete Repository implementations.
- Keep business rules and resource-specific authorization in Services.
- Keep structural HTTP validation outside Services.
- Keep HTTP representation inside Controllers.
- Do not pass Express or Prisma-specific objects across application boundaries.
- Return `null` from optional Repository lookups and let Services interpret it.
- Do not throw business `AppError`s from Repositories.
- Let `AppError` propagate to the global HTTP error handler.
- Let unexpected errors propagate instead of disguising them as application failures.
- Use meaningful domain actions when CRUD names stop expressing the real operation.
- Do not generate unused CRUD endpoints merely for symmetry.
- Avoid generic CRUD abstractions that erase application intent.
