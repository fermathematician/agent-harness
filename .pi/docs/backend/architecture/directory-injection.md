# Dependency Injection

## Purpose

Dependency Injection defines how application components receive the dependencies they need.

Instead of a component constructing its own dependencies:

```ts
class CreateUserService {
  private readonly userRepository = new PrismaUserRepository();
}
```

dependencies are provided from outside:

```ts
class CreateUserService {
  constructor(private readonly userRepository: UserRepository) {}
}
```

This separates:

```text
using a dependency
```

from:

```text
constructing a dependency
```

The component knows what it needs.

It does not need to know how that dependency is created.

---

## Core idea

Without Dependency Injection:

```text
Service
  ↓
creates Repository
  ↓
creates Prisma dependency
```

The Service becomes responsible for both:

```text
application behavior
dependency construction
```

With Dependency Injection:

```text
Composition Root
  ↓
creates infrastructure
  ↓
creates Repository
  ↓
injects Repository into Service
  ↓
injects Service into Controller
  ↓
Route uses Controller
```

The dependency graph is assembled outside the application components.

---

## Dependency direction

The application should depend on abstractions appropriate to its layer.

For example:

```text
CreateUserService
  ↓
UserRepository
```

not:

```text
CreateUserService
  ↓
PrismaUserRepository
```

The Service depends on the Repository contract.

The concrete implementation depends on Prisma:

```text
UserRepository
      ▲
      │ implements
      │
PrismaUserRepository
      ↓
    Prisma
```

This gives:

```text
Service
→ Repository contract

Infrastructure
→ implements Repository contract
```

The application use case does not need to know which persistence technology satisfies the contract.

---

## Constructor injection

Prefer constructor injection for required dependencies.

Example:

```ts
class CreateUserService {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: CreateUserRequest) {
    // use this.userRepository
  }
}
```

The constructor makes dependencies explicit.

A developer can inspect the class and immediately see:

```text
CreateUserService requires UserRepository
```

Avoid hidden dependencies created inside methods.

For example:

```ts
class CreateUserService {
  async execute(input: CreateUserRequest) {
    const repository = new PrismaUserRepository();

    // ...
  }
}
```

Now the dependency is hidden inside implementation code.

---

## Required dependencies

Constructor dependencies should represent collaborators required for the component to function.

Example:

```ts
class CreateSessionService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenProvider: TokenProvider,
  ) {}
}
```

This explicitly communicates:

```text
CreateSessionService
├── UserRepository
├── PasswordHasher
└── TokenProvider
```

Do not hide these behind global variables or instantiate them inside `execute()`.

---

## Dependency Injection across layers

For the architecture:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository
  ↓
Prisma
```

construction happens in the opposite direction.

Conceptually:

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

For example:

```ts
const userRepository = new PrismaUserRepository(prisma);

const createUserService = new CreateUserService(userRepository);

const createUserController = new CreateUserController(createUserService);
```

The runtime request then flows:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository
  ↓
Prisma
```

Construction and execution are different concerns.

---

## Composition Root

Dependency construction should be centralized in a composition boundary.

This is commonly called the:

```text
Composition Root
```

Its responsibility is to assemble the application's dependency graph.

Example:

```ts
const prisma = new PrismaClient();

const userRepository = new PrismaUserRepository(prisma);

const createUserService = new CreateUserService(userRepository);

const createUserController = new CreateUserController(createUserService);

const usersRouter = createUsersRouter({
  createUserController,
});
```

Conceptually:

```text
Composition Root

Prisma
  ↓
PrismaUserRepository
  ↓
CreateUserService
  ↓
CreateUserController
  ↓
UsersRouter
```

The composition root knows concrete implementations.

Application components generally should not.

---

## What belongs in the Composition Root

The composition root may know:

```text
PrismaClient
Prisma repositories
password hashing implementations
token providers
external API clients
Services
Controllers
routers
configuration-dependent implementations
```

For example:

```text
UserRepository
→ PrismaUserRepository

PasswordHasher
→ BcryptPasswordHasher

TokenProvider
→ JwtTokenProvider
```

The composition root chooses which implementation satisfies each dependency.

This is where concrete infrastructure meets application abstractions.

---

## What does not belong in the Composition Root

The composition root should assemble behavior, not implement it.

Avoid putting:

```text
business rules
resource authorization
validation rules
database queries
HTTP response logic
```

inside dependency construction.

Bad:

```ts
const createUserService = new CreateUserService(
  new PrismaUserRepository(prisma),
);

if (someBusinessCondition) {
  // application behavior
}
```

Composition answers:

```text
Which objects satisfy which dependencies?
```

Application code answers:

```text
What should happen during the use case?
```

---

## Service dependencies

Services should receive application-facing dependencies.

Example:

```ts
class UpdateUserService {
  constructor(private readonly userRepository: UserRepository) {}
}
```

Prefer:

```text
Service
→ UserRepository
```

over:

```text
Service
→ PrismaUserRepository
```

and especially over:

```text
Service
→ PrismaClient
```

The Service should not instantiate:

```text
Prisma repositories
API clients
hashing implementations
token libraries
mail providers
```

These dependencies are injected.

---

## Repository dependencies

Concrete Repositories may receive infrastructure dependencies.

Example:

```ts
class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ...
}
```

This is appropriate because the concrete Repository is infrastructure-aware.

Conceptually:

```text
Service
→ UserRepository contract

PrismaUserRepository
→ PrismaClient
```

The abstraction boundary remains intact.

---

## Controller dependencies

Controllers should receive the use case they execute.

Example:

```ts
class CreateUserController {
  constructor(private readonly createUserService: CreateUserService) {}

  handle = async (request: Request, response: Response) => {
    const user = await this.createUserService.execute({
      name: request.validated.body.name,
      email: request.validated.body.email,
    });

    return response.status(201).json(user);
  };
}
```

Avoid constructing Services inside Controllers.

Bad:

```ts
class CreateUserController {
  async handle(request: Request, response: Response) {
    const repository = new PrismaUserRepository(prisma);

    const service = new CreateUserService(repository);

    // ...
  }
}
```

The Controller should use the dependency, not assemble it.

---

## Route dependencies

Routes should receive or import already-composed Controllers according to the project convention.

For example:

```ts
export function createUsersRouter({
  createUserController,
  updateUserController,
}: UsersRouterDependencies) {
  const router = Router();

  router.post("/", createUserController.handle);

  router.patch("/:userId", updateUserController.handle);

  return router;
}
```

Conceptually:

```text
Composition Root
  ↓
Controller
  ↓
Route
```

Do not construct the entire dependency tree inside individual route handlers.

---

## Dependency graph

A feature may form a graph such as:

```text
PrismaClient
  │
  └── PrismaUserRepository
          │
          ├── CreateUserService
          │       │
          │       └── CreateUserController
          │
          ├── GetUserService
          │       │
          │       └── GetUserController
          │
          └── UpdateUserService
                  │
                  └── UpdateUserController
```

Notice that one Repository instance may satisfy multiple Services.

There is no requirement to construct a new Repository for every use case.

---

## Reusing dependencies

Dependencies may be shared when their lifecycle allows it.

Example:

```ts
const userRepository = new PrismaUserRepository(prisma);

const createUserService = new CreateUserService(userRepository);

const getUserService = new GetUserService(userRepository);

const updateUserService = new UpdateUserService(userRepository);
```

This is different from creating a global Service Locator.

The dependencies are still explicit.

They are simply constructed once and injected where required.

---

## Dependency Injection vs global state

Avoid using global variables as hidden dependency injection.

For example:

```ts
export const prisma = new PrismaClient();
```

and then importing it directly into every Service:

```ts
import { prisma } from "../prisma";
```

may technically provide access to the dependency, but it hides the Service's dependency graph.

Compare:

```ts
class UserService {
  async execute() {
    return prisma.user.findMany();
  }
}
```

with:

```ts
class UserService {
  constructor(private readonly userRepository: UserRepository) {}
}
```

The second version explicitly communicates what the Service requires.

Infrastructure modules may expose shared infrastructure where appropriate, but application components should not use global access to bypass established boundaries.

---

## Dependency Injection vs Service Locator

A Service Locator gives components access to a container from which they retrieve dependencies.

Example:

```ts
class CreateUserService {
  async execute(input: CreateUserRequest) {
    const repository = container.resolve<UserRepository>("UserRepository");

    // ...
  }
}
```

This hides dependencies.

The constructor no longer tells us what the Service requires.

Prefer:

```ts
class CreateUserService {
  constructor(private readonly userRepository: UserRepository) {}
}
```

The composition layer may use a container internally.

Application components should not normally resolve their own dependencies from it.

---

## Manual Dependency Injection

Dependency Injection does not require a framework or container.

Manual DI is often enough.

Example:

```ts
const prisma = new PrismaClient();

const userRepository = new PrismaUserRepository(prisma);

const service = new CreateUserService(userRepository);

const controller = new CreateUserController(service);
```

This is Dependency Injection.

A DI container is only an automation mechanism for constructing the same dependency graph.

Do not introduce a container merely because the architecture uses DI.

---

## DI containers

As the dependency graph grows, a project may use a DI container.

Conceptually:

```text
register:
UserRepository
→ PrismaUserRepository

PasswordHasher
→ BcryptPasswordHasher

TokenProvider
→ JwtTokenProvider
```

Then the composition layer resolves:

```text
CreateSessionController
```

and the container constructs its dependencies.

A container may reduce repetitive wiring.

It also introduces:

```text
registration configuration
lifecycle management
resolution rules
additional indirection
```

Use one when it improves the project.

Do not treat a container as a requirement for Dependency Injection.

---

## Dependency lifetimes

Some dependencies have meaningful lifetimes.

Examples:

```text
application-wide
request-scoped
operation-scoped
transient
```

A database client is commonly long-lived.

A transaction context may be scoped to one operation.

Some request-specific context may exist only during one request.

Do not create expensive infrastructure dependencies repeatedly without reason.

Do not make every dependency a singleton automatically.

Choose lifecycle according to the dependency's semantics.

---

## PrismaClient lifecycle

Avoid creating a new `PrismaClient` for every:

```text
request
Controller
Service
Repository method
```

The application should manage the Prisma client according to its runtime/deployment environment.

Conceptually:

```text
Application startup
  ↓
PrismaClient
  ↓
Prisma repositories
```

Repositories receive the appropriate Prisma client or transaction client through the project's persistence convention.

The exact lifecycle may differ across:

```text
long-running Node server
serverless runtime
tests
scripts
```

Follow the project's runtime convention.

---

## Transactions and DI

Transactions may require temporarily replacing the ordinary persistence context with a transaction-scoped one.

Conceptually:

```text
Service
  ↓
TransactionManager
  ↓
transaction context
  ↓
Repositories using same transaction
```

The important requirement is:

```text
all operations belonging to one atomic transaction
must use the same transaction context
```

Do not independently construct repositories with unrelated Prisma contexts inside a transactional use case.

The exact transaction abstraction belongs to the persistence architecture.

DI should make it possible to provide the correct transaction-scoped dependencies.

---

## External services

The same principle applies beyond persistence.

Example:

```text
SendPasswordResetService
├── UserRepository
├── TokenProvider
└── MailProvider
```

Application-facing contracts may be:

```ts
interface MailProvider {
  send(message: MailMessage): Promise<void>;
}
```

Concrete infrastructure:

```text
MailProvider
      ▲
      │
SMTPMailProvider
```

or:

```text
MailProvider
      ▲
      │
ExternalApiMailProvider
```

The Service depends on the capability.

The composition root chooses the implementation.

---

## Authentication dependencies

Authentication use cases may depend on:

```text
UserRepository
PasswordHasher
TokenProvider
SessionProvider
```

For example:

```ts
const service = new CreateSessionService(
  userRepository,
  passwordHasher,
  tokenProvider,
);
```

The Service coordinates the use case.

Concrete cryptographic and authentication libraries remain infrastructure details.

---

## Configuration

Configuration may influence dependency construction.

Example:

```text
development
→ local provider

production
→ external provider
```

or:

```text
DATABASE_URL
→ Prisma configuration
```

The composition layer may read configuration to choose or configure implementations.

Avoid scattering environment checks throughout Services.

Bad:

```ts
class SendEmailService {
  async execute() {
    if (process.env.NODE_ENV === "production") {
      // provider A
    } else {
      // provider B
    }
  }
}
```

Prefer selecting the implementation during composition.

---

## Multiple implementations

An abstraction may have multiple implementations.

Example:

```text
UserRepository
├── PrismaUserRepository
└── InMemoryUserRepository
```

Production may use:

```text
PrismaUserRepository
```

Tests may use:

```text
InMemoryUserRepository
```

The Service remains unchanged:

```ts
new CreateUserService(userRepository);
```

This is one practical benefit of depending on contracts.

---

## Testing

Dependency Injection makes isolated tests easier because dependencies can be replaced explicitly.

Example:

```ts
const userRepository = new InMemoryUserRepository();

const service = new CreateUserService(userRepository);
```

Or use a focused fake/mock when appropriate.

The test controls the dependency graph without modifying the Service implementation.

Avoid adding abstractions solely to make mocking possible.

Dependencies should represent meaningful architectural boundaries first.

Testability is a consequence of explicit boundaries.

---

## Test doubles

Depending on the test, a dependency may be replaced by:

```text
fake
stub
mock
spy
in-memory implementation
```

Use the simplest form that tests the intended behavior.

For repository-heavy application tests, an in-memory implementation may be useful.

For a single interaction:

```text
MailProvider.send()
```

a mock or spy may be enough.

DI makes either strategy possible without changing production code.

---

## Avoid unnecessary interfaces

Dependency Injection does not mean every class needs an interface.

For example:

```text
CreateUserController
→ CreateUserService
```

may directly depend on the concrete Service when there is no meaningful abstraction needed.

The important boundary is usually where application code depends on replaceable infrastructure capabilities.

Examples:

```text
UserRepository
PasswordHasher
TokenProvider
MailProvider
PaymentGateway
Clock
FileStorage
```

Do not create:

```text
ICreateUserService
CreateUserServiceImpl
```

merely to satisfy a DI pattern.

Create abstractions where they express a real architectural contract.

---

## Dependency Injection and SOLID

Dependency Injection supports dependency inversion but is not itself the entire Dependency Inversion Principle.

For example:

```text
CreateUserService
→ UserRepository contract

PrismaUserRepository
→ implements contract
```

allows the high-level use case to depend on an application-facing abstraction rather than Prisma.

But simply injecting:

```ts
constructor(
  private readonly prisma:
    PrismaClient,
) {}
```

into a Service is also technically Dependency Injection.

It does not preserve the same architectural boundary.

Therefore:

```text
Dependency Injection
≠ automatically good dependency direction
```

Both the injection mechanism and dependency direction matter.

---

## Avoid dependency explosion

A constructor with many dependencies may indicate the component has too many responsibilities.

Example:

```ts
class SomeService {
  constructor(
    repoA,
    repoB,
    repoC,
    mail,
    tokens,
    payments,
    storage,
    analytics,
    logger,
    cache,
  ) {}
}
```

Do not hide this problem by switching to a container or Service Locator.

First ask whether the use case is doing too much.

Explicit constructor injection is valuable partly because it makes excessive coupling visible.

---

## Optional dependencies

Avoid optional dependencies when they make behavior ambiguous.

For example:

```ts
constructor(
  private readonly mailProvider?:
    MailProvider,
) {}
```

may create two hidden execution modes.

Prefer explicit application behavior.

If a dependency is genuinely optional according to the use case, model that intentionally.

Do not make dependencies optional merely to simplify construction or tests.

---

## Dependency naming

Name dependencies according to the capability they provide.

Prefer:

```ts
userRepository;
passwordHasher;
tokenProvider;
mailProvider;
paymentGateway;
```

Avoid vague names:

```ts
helper;
manager;
utils;
dependency;
service2;
```

The constructor should communicate the component's collaborators clearly.

---

## Factories

Factories may centralize construction of related dependency graphs.

Example:

```ts
export function makeCreateUserController() {
  const repository = new PrismaUserRepository(prisma);

  const service = new CreateUserService(repository);

  return new CreateUserController(service);
}
```

This is useful when manual composition begins to repeat.

However, avoid recreating shared infrastructure unnecessarily.

A better composition may reuse the Repository:

```ts
const userRepository = new PrismaUserRepository(prisma);

export function makeCreateUserController() {
  const service = new CreateUserService(userRepository);

  return new CreateUserController(service);
}
```

Factories are composition tools.

They should not contain application logic.

---

## Feature composition

Large applications may compose dependencies per feature.

Example:

```text
composition/
├── users.ts
├── sessions.ts
├── orders.ts
└── invoices.ts
```

Each feature composition module may assemble its own:

```text
Repositories
Services
Controllers
Routes
```

Then application startup combines the feature routers.

Conceptually:

```text
Application Composition
│
├── Users Composition
├── Sessions Composition
├── Orders Composition
└── Invoices Composition
```

This avoids one enormous composition file while keeping construction outside application behavior.

---

## Composition and module structure

Dependency Injection and module organization should reinforce each other.

For example:

```text
modules/
└── users/
    ├── controllers/
    ├── services/
    ├── repositories/
    └── composition/
```

or:

```text
composition/
└── users.ts
```

The exact folder structure is a project convention.

The architectural requirement is:

```text
construction
≠ application behavior
```

---

## Example: User feature

Contracts:

```ts
interface UserRepository {
  findByEmail(email: string): Promise<User | null>;

  create(input: CreateUserData): Promise<User>;
}
```

Infrastructure:

```ts
class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ...
}
```

Service:

```ts
class CreateUserService {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: CreateUserRequest) {
    // application behavior
  }
}
```

Controller:

```ts
class CreateUserController {
  constructor(private readonly service: CreateUserService) {}

  handle = async (request: Request, response: Response) => {
    const user = await this.service.execute(request.validated.body);

    return response.status(201).json(user);
  };
}
```

Composition:

```ts
const prisma = new PrismaClient();

const userRepository = new PrismaUserRepository(prisma);

const createUserService = new CreateUserService(userRepository);

const createUserController = new CreateUserController(createUserService);
```

Runtime:

```text
Route
  ↓
CreateUserController
  ↓
CreateUserService
  ↓
UserRepository
  ↓
PrismaUserRepository
  ↓
Prisma
```

Construction:

```text
Prisma
  ↓
PrismaUserRepository
  ↓
CreateUserService
  ↓
CreateUserController
  ↓
Route
```

This distinction is central to the architecture.

---

## Example: CreateSession

The same pattern applies to authentication.

```text
CreateSessionService
├── UserRepository
├── PasswordHasher
└── TokenProvider
```

Composition:

```ts
const createSessionService = new CreateSessionService(
  userRepository,
  passwordHasher,
  tokenProvider,
);

const createSessionController = new CreateSessionController(
  createSessionService,
);
```

The Service knows the capabilities it requires.

It does not know:

```text
which password library is used
which JWT library is used
how Prisma was initialized
where configuration came from
```

Those are composition/infrastructure concerns.

---

## Anti-pattern: constructing downward

Avoid each layer constructing the next one.

```text
Route
  ↓ creates
Controller
  ↓ creates
Service
  ↓ creates
Repository
  ↓ creates
Prisma
```

This couples the entire dependency graph together.

Instead:

```text
Composition Root
  ├── creates Prisma
  ├── creates Repository
  ├── creates Service
  ├── creates Controller
  └── creates/registers Route
```

Then runtime execution remains:

```text
Route
→ Controller
→ Service
→ Repository
→ Prisma
```

---

## Anti-pattern: hidden imports

Avoid bypassing DI through infrastructure imports.

Example:

```ts
import { prisma } from "@/database";
import { mailer } from "@/mail";
import { tokenProvider } from "@/auth";

class Service {
  // dependencies are hidden
}
```

Not every import is a problem.

The problem is when a component's external collaborators become invisible and globally coupled.

Prefer explicit injection for meaningful dependencies.

---

## Anti-pattern: passing everything

Do not replace hidden globals with a giant dependency bag.

Avoid:

```ts
class CreateUserService {
  constructor(private readonly deps: ApplicationDependencies) {}
}
```

where:

```text
ApplicationDependencies
→ every Repository
→ every provider
→ every client
→ every utility
```

The Service should receive only what it actually requires.

Prefer:

```ts
constructor(
  private readonly userRepository:
    UserRepository,
  private readonly mailProvider:
    MailProvider,
) {}
```

Explicit dependencies communicate coupling.

---

## Overall convention

For this architecture:

```text
Runtime:

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

Dependency construction works from the bottom up:

```text
Composition Root

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

The central rule is:

```text
Components use dependencies.

Composition constructs dependencies.
```

Services depend on application-facing contracts.

Infrastructure provides concrete implementations.

Controllers receive Services.

Routes receive composed Controllers.

---

## Rules

When using Dependency Injection:

- inject required dependencies instead of constructing them inside application components;
- prefer constructor injection for required collaborators;
- make dependencies explicit;
- keep dependency construction outside Services and Controllers;
- centralize dependency assembly in a composition root or composition modules;
- let the composition layer know concrete implementations;
- make Services depend on application-facing contracts where an architectural boundary exists;
- keep Prisma behind Repository implementations;
- inject infrastructure dependencies into concrete infrastructure components;
- do not resolve dependencies from a container inside application Services;
- do not use global imports to bypass meaningful dependency boundaries;
- do not introduce a DI container unless it improves the project;
- do not create interfaces for every class automatically;
- reuse dependencies when their lifecycle permits it;
- manage expensive infrastructure lifecycles intentionally;
- ensure transactional operations share the correct transaction context;
- select environment-specific implementations during composition rather than inside use cases;
- inject only the dependencies a component actually needs;
- treat excessive constructor dependencies as a possible design warning;
- keep factories and composition modules free from business logic;
- preserve the distinction between dependency construction and runtime execution.
