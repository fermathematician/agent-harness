# CRUD

## Purpose

CRUD organizes application behavior around entities while implementing each operation as an explicit use case.

The entity provides the conceptual grouping.

The use case provides the implementation boundary.

Example:

    User
    ├── CreateUser
    ├── GetUser
    ├── ListUsers
    ├── SearchUsers
    ├── UpdateUser
    ├── DeleteUser
    ├── DeactivateUser
    └── ChangeUserEmail

Do not treat CRUD as a single generic service with four methods.

Prefer explicit use cases with their own Controller and Service while sharing the entity Repository contract.

The general flow is:

    HTTP
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

Each layer follows its dedicated project skill.

This document defines how those layers are assembled around entity use cases.

## Organizing around entities

Use the entity as the primary conceptual grouping.

Examples:

    User
    Order
    Invoice
    Company
    Product

Each entity may expose several use cases.

Example:

    User
    ├── CreateUser
    ├── GetUser
    ├── ListUsers
    ├── SearchUsers
    ├── UpdateUser
    └── DeleteUser

This does not mean that all behavior must remain generic CRUD.

When an operation represents meaningful domain behavior, give it its own use case.

Example:

    User
    ├── UpdateUser
    ├── DeactivateUser
    ├── ChangeUserEmail
    └── ResetUserPassword

Do not hide meaningful domain actions inside a generic update operation merely because they modify the same entity.

## One use case per operation

Each application operation should normally have:

    <UseCase>Controller
    <UseCase>Service

Example:

    CreateUserController
    CreateUserService

The Controller handles the HTTP boundary.

The Service implements the application use case.

The Service uses the shared entity Repository contract for persistence operations.

Example:

    CreateUserController
        ↓
    CreateUserService
        ↓
    UserRepository.create()

Another use case:

    GetUserController
        ↓
    GetUserService
        ↓
    UserRepository.findById()

The Repository does not need a new class for every use case.

Repository contracts are organized around the entity or aggregate and expose the persistence capabilities required by its use cases.

Example:

    interface UserRepository {
      findById(id: string): Promise<User | null>;
      findByEmail(email: string): Promise<User | null>;
      findMany(options: FindUsersOptions): Promise<User[]>;
      create(data: CreateUserData): Promise<User>;
      update(id: string, data: UpdateUserData): Promise<User>;
      delete(id: string): Promise<void>;
    }

Multiple User Services may depend on the same `UserRepository` contract.

## Create

Create represents the use case that creates a new entity.

Typical structure:

    CreateUserController
        ↓
    CreateUserService
        ↓
    UserRepository

Example flow:

    POST /users
        ↓
    CreateUserController.handle()
        ↓
    CreateUserService.execute()
        ↓
    UserRepository.findByEmail()
        ↓
    UserRepository.create()

The Controller extracts the HTTP input.

Example:

    const {
      name,
      email,
    } = request.body;

    const user =
      await this.createUserService.execute({
        name,
        email,
      });

    return response
      .status(201)
      .json(user);

The Service implements creation rules.

Example:

    async execute({
      name,
      email,
    }: CreateUserRequest) {
      const existingUser =
        await this.userRepository.findByEmail(
          email,
        );

      if (existingUser) {
        throw new AppError(
          "Email already exists",
          409,
        );
      }

      return this.userRepository.create({
        name,
        email,
      });
    }

The Repository performs the persistence operation.

Example:

    async create(
      data: CreateUserData,
    ): Promise<User> {
      return this.prisma.user.create({
        data,
      });
    }

Creation rules belong to the Service.

Persistence details belong to the Repository implementation.

HTTP semantics such as `201 Created` belong to the Controller.

## Read

Read operations should not be treated as one single use case.

Reading an entity commonly expands into multiple distinct use cases.

Typical categories include:

    Read one
    Read many
    Search
    Filtered queries
    Domain-specific queries

These use cases may all operate on the same entity and Repository while representing different application behavior.

## Read one

Use a dedicated use case when retrieving one entity.

Examples:

    GetUser
    GetOrder
    GetInvoice

Typical structure:

    GetUserController
        ↓
    GetUserService
        ↓
    UserRepository.findById()

Example Controller:

    async handle(
      request: Request,
      response: Response,
    ) {
      const { userId } =
        request.params;

      const user =
        await this.getUserService.execute({
          userId,
        });

      return response
        .status(200)
        .json(user);
    }

Example Service:

    async execute({
      userId,
    }: GetUserRequest) {
      const user =
        await this.userRepository.findById(
          userId,
        );

      if (!user) {
        throw new AppError(
          "User not found",
          404,
        );
      }

      return user;
    }

The Repository lookup may return `null`.

The Service decides whether absence is acceptable or represents an application failure.

Do not encode the application's "not found" semantics inside the Repository.

## Read by alternate identifier

Some entities may be retrieved by identifiers other than the primary ID.

Examples:

    findByEmail()
    findBySlug()
    findByExternalId()

Whether these require separate use cases depends on application behavior.

Example:

    GetUserByEmailService

may be appropriate when searching by email is a meaningful application operation.

Do not create separate use cases merely because the Repository supports multiple lookup methods unless the application actually exposes or requires those behaviors.

## Read many

Use a dedicated use case for collections.

Example:

    ListUsersController
        ↓
    ListUsersService
        ↓
    UserRepository.findMany()

Typical concerns include:

- pagination;
- filtering;
- ordering;
- visibility rules;
- tenant or company scope.

Example Controller:

    const page =
      Number(request.query.page ?? 1);

    const pageSize =
      Number(request.query.pageSize ?? 20);

    const active =
      request.query.active === undefined
        ? undefined
        : request.query.active === "true";

    const result =
      await this.listUsersService.execute({
        page,
        pageSize,
        active,
      });

    return response
      .status(200)
      .json(result);

The Controller translates HTTP query representation.

The Service decides application rules for listing.

The Repository translates listing options into persistence queries.

Example Service input:

    interface ListUsersRequest {
      page: number;
      pageSize: number;
      active?: boolean;
    }

Example Repository input:

    interface FindUsersOptions {
      page: number;
      pageSize: number;
      active?: boolean;
    }

The Service may adapt application input before passing persistence criteria to the Repository.

Do not pass raw Express query objects into Repository methods.

## Pagination

Collections that may grow should normally be paginated.

Typical flow:

    HTTP page/pageSize
        ↓
    Controller parses values
        ↓
    Service validates application limits
        ↓
    Repository executes paginated query

Example Service rule:

    const pageSize =
      Math.min(input.pageSize, 100);

The Service may enforce application-level limits such as maximum page size.

The Repository performs the persistence mechanics.

Example:

    const skip =
      (page - 1) * pageSize;

    return this.prisma.user.findMany({
      skip,
      take: pageSize,
      orderBy: {
        createdAt: "desc",
      },
    });

Use cursor pagination when required by dataset size, consistency, or performance.

Do not force one pagination strategy into every entity without a concrete reason.

## List result metadata

When the API requires pagination metadata, represent it explicitly.

Example:

    interface ListUsersResult {
      items: User[];
      page: number;
      pageSize: number;
      total: number;
    }

The Repository may provide the persistence data required to construct this result.

Example:

    findMany(...)
    count(...)

The Service may coordinate both operations.

Example:

    const [users, total] =
      await Promise.all([
        this.userRepository.findMany(options),
        this.userRepository.count(options),
      ]);

    return {
      items: users,
      page,
      pageSize,
      total,
    };

If both operations must observe exactly the same transactional snapshot, use the project's transaction strategy.

## Search

Search should be represented as its own use case when it differs meaningfully from ordinary listing.

Example:

    SearchUsersController
        ↓
    SearchUsersService
        ↓
    UserRepository.search()

or:

    UserRepository.findMany(
      searchCriteria,
    )

Choose the Repository API according to the persistence abstraction.

Use an explicit method when the search has a clear, repeated meaning.

Examples:

    searchByNameOrEmail(query)
    findUsersEligibleForReview(criteria)

Use `findMany(options)` when search is simply one more filter in a generic collection query.

Do not create many narrowly named Repository methods for every possible combination of optional filters.

Avoid:

    findByNameAndActiveAndCompanyAndRole()

when the application actually needs a flexible search object.

Prefer:

    findMany({
      name,
      active,
      companyId,
      role,
    })

when those fields represent optional collection filters.

The distinction is:

    stable domain-specific query
        → explicit repository method

    flexible list/filter criteria
        → structured findMany/search options

## Filtering

Filters should be explicit and typed.

Example:

    interface FindUsersOptions {
      active?: boolean;
      role?: UserRole;
      companyId?: string;
      search?: string;
      page: number;
      pageSize: number;
    }

Do not expose Prisma `where` objects through the Repository contract.

Avoid:

    repository.findMany({
      where: request.query,
    });

The Repository contract should describe application persistence needs rather than expose ORM query syntax.

## Ordering

If ordering is configurable, expose a constrained application representation.

Example:

    type UserOrderBy =
      | "name"
      | "createdAt"
      | "email";

    type OrderDirection =
      | "asc"
      | "desc";

Then translate it inside the Repository.

Do not expose arbitrary Prisma `orderBy` objects across the Repository boundary.

When ordering has domain meaning, prefer explicit intent.

Example:

    findLatestUsers()
    findOldestPendingOrders()

## Update

Update represents a general modification use case.

Typical structure:

    UpdateUserController
        ↓
    UpdateUserService
        ↓
    UserRepository

Example flow:

    PATCH /users/:userId
        ↓
    UpdateUserController.handle()
        ↓
    UpdateUserService.execute()
        ↓
    UserRepository.findById()
        ↓
    business validation
        ↓
    UserRepository.update()

Example Service:

    async execute({
      userId,
      name,
      email,
    }: UpdateUserRequest) {
      const user =
        await this.userRepository.findById(
          userId,
        );

      if (!user) {
        throw new AppError(
          "User not found",
          404,
        );
      }

      if (
        email &&
        email !== user.email
      ) {
        const existingUser =
          await this.userRepository.findByEmail(
            email,
          );

        if (
          existingUser &&
          existingUser.id !== user.id
        ) {
          throw new AppError(
            "Email already exists",
            409,
          );
        }
      }

      return this.userRepository.update(
        userId,
        {
          name,
          email,
        },
      );
    }

The Service determines whether the update is allowed.

The Repository performs the update mechanics.

## Partial updates

For PATCH-style operations, define optional update fields explicitly.

Example:

    interface UpdateUserRequest {
      userId: string;
      name?: string;
      email?: string;
    }

Avoid passing the full request body directly into persistence.

Do not do:

    userRepository.update(
      userId,
      request.body,
    );

Prefer an intentional input object.

A partial update should modify only fields that the use case allows to change.

Do not assume that every persisted field is publicly updateable.

## General update vs domain action

Do not overload `Update<Entity>` with meaningful domain operations.

A generic update may handle ordinary editable properties.

Example:

    UpdateUser
      → name
      → email
      → phone

But operations such as:

    DeactivateUser
    BlockUser
    ApproveUser
    ChangeUserPassword
    VerifyUserEmail

should normally be separate use cases when they represent distinct business behavior.

These operations may still use Repository update methods internally.

Example:

    DeactivateUserService
        ↓
    UserRepository.findById()
        ↓
    validate deactivation
        ↓
    UserRepository.updateStatus()

Use case names should communicate domain intent.

## Delete

Delete represents removal of an entity.

Typical structure:

    DeleteUserController
        ↓
    DeleteUserService
        ↓
    UserRepository

Example:

    async execute({
      userId,
    }: DeleteUserRequest) {
      const user =
        await this.userRepository.findById(
          userId,
        );

      if (!user) {
        throw new AppError(
          "User not found",
          404,
        );
      }

      await this.userRepository.delete(
        userId,
      );
    }

Controller:

    await this.deleteUserService.execute({
      userId,
    });

    return response
      .status(204)
      .send();

The Service decides whether deletion is allowed.

Examples of deletion rules:

- entity must exist;
- user cannot delete themselves;
- invoice cannot be deleted after issuance;
- company cannot be deleted while active contracts exist.

The Repository performs physical persistence deletion.

## Physical delete vs logical delete

Distinguish physical deletion from logical state changes.

Physical deletion:

    UserRepository.delete(id)

Logical deletion:

    UserRepository.softDelete(id)

or a domain-specific operation:

    DeactivateUserService
        ↓
    UserRepository.updateStatus(
      id,
      "inactive",
    )

Do not call an operation `delete` when the record remains persisted unless that naming is explicitly defined by the project.

Prefer domain-accurate terminology.

## Domain actions beyond CRUD

CRUD is a foundation, not a limit on application behavior.

As the application grows, many important operations will not naturally fit into generic CRUD names.

Examples:

    ApproveInvoice
    CancelOrder
    ActivateSubscription
    TransferOwnership
    ResetPassword
    ConfirmPayment
    SuspendAccount

Implement them using the same architectural pattern:

    <Action>Controller
        ↓
    <Action>Service
        ↓
    Repository contracts / other dependencies

Example:

    CancelOrderController
        ↓
    CancelOrderService
        ↓
    OrderRepository.findById()
        ↓
    validate current state
        ↓
    OrderRepository.updateStatus()

The architecture remains use-case oriented even when the operation is not CRUD.

Do not force domain actions into:

    update()

merely to preserve CRUD terminology.

## Entity Repository reuse

An entity normally has one Repository contract reused by its Services.

Example:

    UserRepository

used by:

    CreateUserService
    GetUserService
    ListUsersService
    UpdateUserService
    DeleteUserService
    DeactivateUserService

Add Repository methods when actual application use cases require new persistence capabilities.

Do not pre-build a large Repository API for hypothetical future operations.

At the same time, keep method naming and structure consistent with the project's Repository conventions.

## Repository methods and use cases

A Service may use several Repository methods.

Example:

    CreateUserService
      → findByEmail()
      → create()

A Repository method may support several Services.

Example:

    findById()

used by:

    GetUserService
    UpdateUserService
    DeleteUserService
    DeactivateUserService

There is not necessarily a one-to-one mapping between Service and Repository method.

The Service represents the use case.

The Repository represents persistence capabilities.

## Multiple entities in one use case

A use case may involve more than one entity.

Example:

    CreateOrderService
        ↓
    UserRepository
    ProductRepository
    OrderRepository

This is acceptable when the use case genuinely coordinates multiple domain objects.

Example:

    const customer =
      await this.userRepository.findById(
        customerId,
      );

    const products =
      await this.productRepository.findManyByIds(
        productIds,
      );

    // validate application rules

    return this.orderRepository.create(
      orderData,
    );

The Service coordinates the use case.

Do not force all persistence into one Repository simply because the Service touches multiple entities.

Keep Repository ownership aligned with entity or aggregate responsibility.

## Transactions across repositories

When a use case performs several persistence operations that must succeed or fail together, use the project's transaction strategy.

Example:

    CreateOrder
      → create order
      → reserve inventory
      → create payment record

If all operations must be atomic, they should participate in the same transaction.

Do not start unrelated independent transactions inside each Repository call if the entire use case requires one atomic boundary.

The exact transaction wiring belongs to the project's persistence architecture, but the Service should express that the operations form one cohesive use case.

## Dependency wiring

Controllers and Services should receive dependencies from outside.

Example:

    const userRepository =
      new PrismaUserRepository(prisma);

    const createUserService =
      new CreateUserService(
        userRepository,
      );

    const createUserController =
      new CreateUserController(
        createUserService,
      );

The dependency direction is:

    Controller
      depends on
    Service
      depends on
    Repository contract

The concrete Prisma Repository is selected during application composition.

Do not instantiate `PrismaUserRepository` inside a Service.

Do not instantiate `CreateUserService` inside the Controller request handler.

Centralize dependency composition according to the project bootstrap/container convention.

## Naming conventions

Use consistent names across CRUD use cases.

### Create

    Create<Entity>Controller
    Create<Entity>Service

Example:

    CreateUserController
    CreateUserService

Repository:

    create()

### Read one

    Get<Entity>Controller
    Get<Entity>Service

Example:

    GetUserController
    GetUserService

Repository:

    findById()
    findByEmail()
    findBySlug()

depending on the use case.

### Read many

    List<Entities>Controller
    List<Entities>Service

Example:

    ListUsersController
    ListUsersService

Repository:

    findMany()

### Search

Use:

    Search<Entities>Controller
    Search<Entities>Service

when search is a distinct application use case.

Example:

    SearchUsersController
    SearchUsersService

Do not create a separate Search use case if search is simply an optional filter of the ordinary List operation.

### Update

    Update<Entity>Controller
    Update<Entity>Service

Example:

    UpdateUserController
    UpdateUserService

Repository:

    update()

or an intentional specific operation such as:

    updateEmail()
    updateStatus()

### Delete

    Delete<Entity>Controller
    Delete<Entity>Service

Example:

    DeleteUserController
    DeleteUserService

Repository:

    delete()

### Domain actions

Use the action itself.

Examples:

    DeactivateUserController
    DeactivateUserService

    ApproveInvoiceController
    ApproveInvoiceService

    CancelOrderController
    CancelOrderService

Do not name these operations as generic updates when the domain action has meaningful semantics.

## File organization

Organize files predictably around application entities and use cases.

A project may use feature-oriented organization such as:

    src/
    ├── modules/
    │   └── users/
    │       ├── controllers/
    │       │   ├── create-user-controller.ts
    │       │   ├── get-user-controller.ts
    │       │   ├── list-users-controller.ts
    │       │   ├── update-user-controller.ts
    │       │   └── delete-user-controller.ts
    │       │
    │       ├── services/
    │       │   ├── create-user-service.ts
    │       │   ├── get-user-service.ts
    │       │   ├── list-users-service.ts
    │       │   ├── update-user-service.ts
    │       │   └── delete-user-service.ts
    │       │
    │       ├── repositories/
    │       │   ├── user-repository.ts
    │       │   └── prisma-user-repository.ts
    │       │
    │       └── types/
    │
    └── shared/

Prefer grouping by feature/entity in larger applications rather than having one global folder containing every Controller or Service in the entire project.

Example to avoid at scale:

    src/
    ├── controllers/
    │   ├── create-user-controller.ts
    │   ├── create-order-controller.ts
    │   ├── create-invoice-controller.ts
    │   ├── update-user-controller.ts
    │   ├── ...
    │
    ├── services/
    │   ├── create-user-service.ts
    │   ├── create-order-service.ts
    │   ├── ...

As the project grows, feature-oriented organization makes entity boundaries easier to navigate.

Follow the project's established module structure when one already exists.

Do not reorganize an established codebase solely to satisfy this example.

## CRUD completeness

Do not assume that every entity automatically requires all four CRUD operations.

An entity may support:

    Create
    Read
    Update

but not deletion.

Another may only expose:

    Read

Another may expose domain actions instead of generic updates.

Implement the operations required by the application.

Do not generate unused CRUD endpoints merely for symmetry.

The architecture should be consistent, but the application surface should reflect actual requirements.

## Authorization

Authorization rules belong to the use case.

Example:

    UpdateUserService.execute({
      authenticatedUserId,
      userId,
      ...
    })

The Service decides whether the operation is allowed.

Do not rely only on route visibility or frontend controls for authorization.

Middleware may establish authentication context or broad access constraints, but resource-specific business authorization should be enforced by the application use case.

Example:

    if (
      authenticatedUserId !== user.id &&
      !actor.isAdmin
    ) {
      throw new AppError(
        "Forbidden",
        403,
      );
    }

Do not duplicate the same authorization decision independently across Controller and Service.

## Validation

Use the project's validation convention consistently.

Typical separation:

    Controller / schema
      → structural request validation

    Service
      → business validation

    Repository
      → persistence constraints and query mechanics

Example structural validation:

    email must be a valid email string

Example business validation:

    email must not already belong to another user

Example persistence constraint:

    database unique index on email

These layers may reinforce each other without representing the same responsibility.

Database constraints remain valuable even when the Service performs a pre-check.

The application should not depend solely on a pre-check for invariants that must remain correct under concurrent requests.

## Concurrency and persistence constraints

Business checks followed by writes may be subject to race conditions.

Example:

    findByEmail()
        ↓
    no user found
        ↓
    create()

Two concurrent requests may both pass the initial lookup.

When an invariant must be guaranteed, enforce it at the persistence level as well.

Example:

    email @unique

The Service pre-check provides application-friendly behavior.

The database constraint guarantees correctness.

Do not treat Repository lookup checks as replacements for database constraints.

Translate known persistence conflicts according to the project's error-handling convention when required.

## Avoid generic CRUD abstractions

Do not create highly generic CRUD layers that erase use-case intent.

Avoid architectures centered around abstractions such as:

    GenericCrudController<T>
    GenericCrudService<T>
    BaseRepository<T>

when they reduce meaningful operations to generic:

    create
    get
    update
    delete

This may remove repetitive code while also hiding application behavior.

Prefer explicit:

    CreateUserService
    DeactivateUserService
    SearchUsersService

when those operations have distinct semantics.

Small repetition is acceptable when it preserves architectural clarity.

## Evolution beyond CRUD

Start with explicit CRUD use cases where they accurately describe application behavior.

As business rules grow, evolve operations into domain-specific use cases.

Example evolution:

    UpdateOrderService

may eventually become:

    ChangeOrderAddressService
    CancelOrderService
    ConfirmOrderService

when each operation develops its own rules.

Do not keep expanding one generic update service indefinitely.

The use-case boundary should evolve with application behavior.

## Example: complete User flow

A simple User module may look like:

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
        ├── count()
        ├── create()
        ├── update()
        └── delete()

Concrete persistence:

    PrismaUserRepository
        implements
    UserRepository

Runtime flow:

    Route
      ↓
    Controller.handle()
      ↓
    Service.execute()
      ↓
    UserRepository
      ↓
    PrismaUserRepository
      ↓
    Prisma

Error flow:

    Service
      ↓
    throw AppError
      ↓
    Global error middleware
      ↓
    HTTP error response

This structure should remain predictable across entities.

## Rules

When implementing CRUD:

- organize application behavior around entities or aggregates;
- implement operations as explicit use cases;
- prefer one Controller and one Service per use case;
- use `handle()` as the Controller entry point;
- use `execute()` as the Service entry point;
- reuse the entity Repository contract across its Services;
- keep Prisma behind the concrete Repository implementation;
- use `Create<Entity>` for creation use cases;
- use `Get<Entity>` for single-record reads;
- use `List<Entities>` for ordinary collection reads;
- use `Search<Entities>` only when search is meaningfully distinct from listing;
- treat Read as multiple possible use cases rather than one generic operation;
- support typed filtering, pagination, and ordering for collections when required;
- do not pass HTTP query objects or Prisma query objects across architectural boundaries;
- use `Update<Entity>` for ordinary general edits;
- extract meaningful state transitions and business operations into dedicated use cases;
- use `Delete<Entity>` only when actual deletion semantics are intended;
- distinguish physical deletion from deactivation, archival, or soft deletion;
- allow one Service to use multiple Repository methods;
- allow one Repository method to support multiple Services;
- allow a use case to coordinate multiple entity Repositories when required;
- use a shared transaction strategy when several writes must be atomic;
- receive dependencies from outside rather than constructing them inside Controllers or Services;
- group larger projects by feature/entity for navigability;
- do not generate CRUD operations that the application does not require;
- enforce business authorization in the appropriate Service;
- use structural validation at the transport boundary and business validation in the Service;
- preserve database constraints for invariants that must survive concurrency;
- do not replace application architecture with generic CRUD base classes;
- prefer explicit use-case names over generic methods when domain behavior becomes meaningful;
- evolve generic CRUD operations into domain-specific use cases as application complexity grows.
