# Service

## Purpose

A Service implements one application use case.

Prefer one Service per use case:

```text
CreateUserService
UpdateUserEmailService
DeactivateUserService
CancelOrderService
```

Avoid generic god services such as `UserService` containing many unrelated operations.

## Structure

Use `execute()` as the standard entry point.

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
  private readonly userRepository: UserRepository,
  private readonly emailGateway: EmailGateway,
) {}
```

Never instantiate Prisma repositories, gateways, or other infrastructure inside the Service.

Never access Prisma directly from a Service.

## Input and output

Service input must describe only the data required by the use case.

Prefer:

```ts
service.execute({ userId, email });
```

Never pass Express `Request`, `Response`, or other transport objects.

Return an intentional application result.

Never return HTTP-specific structures such as status codes, headers, or response bodies.

## Business rules

Business rules belong in the Service.

This includes:

- uniqueness and conflict rules;
- resource-level permissions;
- valid state transitions;
- balance, stock, and eligibility rules;
- whether an operation is allowed.

Use `AppError` for expected application failures.

```ts
const user = await this.userRepository.findById(userId);

if (!user) {
  throw new AppError("User not found", 404);
}
```

Interpret Repository `null` results according to the current use case.

Do not return error objects.

## Validation

Structural request validation belongs to the HTTP validation boundary.

Business validation belongs to the Service.

Do not duplicate structural validation already guaranteed by the boundary unless an independent application invariant requires it.

## Orchestration

A Service owns the sequence of operations required by its use case.

It may coordinate multiple Repository or Gateway contracts when necessary.

Validate important state transitions before persisting them.

When several operations must behave atomically, follow the project's transaction strategy.

For external side effects, follow the project's established retry, outbox, event, or compensation strategy when applicable.

## Error handling

Do not catch errors unless there is a concrete reason to recover, retry, translate a known error, or add meaningful application context.

Do not convert unexpected infrastructure failures into `AppError`.

Unexpected errors should normally propagate to the global error handling boundary.

## Boundaries

```text
Controller
    ↓
Service
    ↓
Repository / Gateway contracts
```

Service may:

```text
→ enforce business rules
→ coordinate application operations
→ interpret Repository results
→ throw expected AppErrors
```

Service must not:

```text
→ handle HTTP
→ access Express Request/Response
→ access Prisma directly
→ instantiate infrastructure
→ parse structural HTTP input
→ return HTTP responses
```

## Rules

- One Service represents one clear use case.
- Use `execute()` consistently.
- Use explicit application inputs and intentional outputs.
- Inject dependencies through the constructor.
- Depend on contracts, not concrete infrastructure.
- Keep business rules in the Service.
- Use `AppError` only for expected application failures.
- Validate meaningful state transitions.
- Keep structural HTTP validation outside the Service.
- Keep HTTP representation outside the Service.
- Let unexpected errors propagate unless deliberate handling is required.
- Keep the main `execute()` flow readable.
- Avoid generic god Service classes.
