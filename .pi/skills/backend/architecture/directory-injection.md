# Dependency Injection

## Purpose

Use Dependency Injection to keep dependency construction separate from application behavior.

For this project:

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

Dependencies are constructed from the bottom up:

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

Components use dependencies.

Composition constructs dependencies.

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

Prefer:

```ts
class CreateUserService {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: CreateUserInput) {
    return this.userRepository.create(input);
  }
}
```

## Service dependencies

Services receive the collaborators required by the use case.

Prefer application-facing contracts at infrastructure boundaries.

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
Prisma repositories
PrismaClient
password hashers
token providers
mail providers
payment gateways
external API clients
```

Do not access Prisma directly from Services.

## Repository dependencies

Services depend on Repository contracts:

```text
CreateUserService
        ↓
UserRepository
```

not concrete persistence implementations:

```text
CreateUserService
        ↓
PrismaUserRepository
```

Concrete Repository implementations may depend on Prisma.

```ts
class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}
}
```

Preserve:

```text
Service
  ↓
Repository contract
  ↓
PrismaRepository
  ↓
Prisma
```

## Controller dependencies

Controllers receive their Services.

```ts
class CreateUserController {
  constructor(private readonly createUserService: CreateUserService) {}

  handle = async (request: Request, response: Response) => {
    const user = await this.createUserService.execute(request.validated.body);

    return response.status(201).json(user);
  };
}
```

Do not construct Services, Repositories, or infrastructure inside Controllers.

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

Do not assemble dependency graphs inside route handlers.

## Composition Root

Centralize dependency construction in composition code.

Example:

```ts
const prisma = new PrismaClient();

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

Do not place business logic in the Composition Root.

As the application grows, composition may be separated by feature:

```text
composition/
├── users.ts
├── sessions.ts
├── orders.ts
└── invoices.ts
```

Follow the existing project structure before introducing a new composition convention.

## Dependency reuse

Reuse dependencies when appropriate.

```ts
const userRepository = new PrismaUserRepository(prisma);

const createUserService = new CreateUserService(userRepository);

const getUserService = new GetUserService(userRepository);

const updateUserService = new UpdateUserService(userRepository);
```

Do not recreate infrastructure unnecessarily.

## Infrastructure contracts

Use contracts for meaningful replaceable infrastructure boundaries.

Examples:

```text
UserRepository
PasswordHasher
TokenProvider
MailProvider
PaymentGateway
FileStorage
```

Do not create interfaces mechanically for every class.

Avoid unnecessary pairs such as:

```text
ICreateUserService
CreateUserServiceImpl
```

when no architectural boundary requires them.

## Hidden dependencies

Do not bypass DI through global infrastructure imports.

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

Dependencies that represent architectural collaborators should be explicit.

## Service Locator

Do not resolve dependencies from a container inside Services or Controllers.

Avoid:

```ts
const repository = container.resolve("UserRepository");
```

A DI container, if the project uses one, belongs to composition.

Do not introduce a DI container unless required by the task or existing architecture.

Manual DI is valid and preferred when sufficient.

## Dependency scope

Inject only what the component actually needs.

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

If a Service requires many unrelated dependencies, inspect whether it has excessive responsibility before hiding the coupling behind abstractions.

## Testing

Keep dependencies replaceable through the same contracts.

Production:

```ts
new CreateUserService(new PrismaUserRepository(prisma));
```

Test:

```ts
new CreateUserService(new InMemoryUserRepository());
```

Do not modify Service implementation merely to replace infrastructure in tests.

## Rules

- Prefer constructor injection for required collaborators.
- Components use dependencies; composition constructs them.
- Services must not construct infrastructure dependencies.
- Controllers must not construct Services or Repositories.
- Routes must not construct the application dependency graph.
- Services depend on Repository contracts rather than Prisma implementations.
- Keep Prisma behind concrete Repository implementations.
- Use contracts for meaningful infrastructure boundaries, not mechanically for every class.
- Centralize concrete dependency construction in composition code.
- Keep business logic out of composition code.
- Reuse dependencies when appropriate.
- Do not hide architectural dependencies behind global imports.
- Do not use Service Locator inside application components.
- Do not introduce a DI container without a concrete need.
- Inject only the dependencies each component requires.
- Follow existing project composition conventions before creating new ones.
