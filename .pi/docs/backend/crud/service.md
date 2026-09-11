# Service

## Purpose

A Service implements an application use case.

Its responsibility is to coordinate the business rules required to complete an operation.

A Service should express what the application is trying to do, not how HTTP works and not how persistence is implemented.

Examples:

- create a user;
- update a user's email;
- cancel an order;
- approve an invoice;
- transfer ownership;
- deactivate an account.

Prefer one Service per use case rather than large generic service classes with many unrelated methods.

## Structure

Prefer explicit use-case classes.

Example:

    export interface CreateUserRequest {
      name: string;
      email: string;
    }

    export class CreateUserService {
      constructor(
        private readonly userRepository: UserRepository,
      ) {}

      async execute({
        name,
        email,
      }: CreateUserRequest): Promise<User> {
        // business rules

        return this.userRepository.create({
          name,
          email,
        });
      }
    }

Use a predictable entry point such as:

    execute()

This makes services consistent across the project.

## Dependencies

Services should depend on abstractions required by the use case.

Example:

    constructor(
      private readonly userRepository: UserRepository,
    ) {}

When a use case needs multiple dependencies, inject them explicitly.

Example:

    constructor(
      private readonly userRepository: UserRepository,
      private readonly emailGateway: EmailGateway,
      private readonly clock: Clock,
    ) {}

Do not instantiate infrastructure dependencies directly inside the Service.

Avoid:

    const repository = new PrismaUserRepository(...)

inside the Service.

Dependencies should be supplied from outside.

## Business rules

Business rules belong in the Service.

Example:

    const existingUser =
      await this.userRepository.findByEmail(email);

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

The Service decides what conditions are valid for the use case.

Examples of business decisions:

- whether an email may be reused;
- whether a user may be deactivated;
- whether an order may be cancelled;
- whether stock is sufficient;
- whether the current state permits a transition;
- whether a user has permission to perform an operation.

## Expected failures

Use `AppError` for expected application failures.

Example:

    if (!user) {
      throw new AppError(
        "User not found",
        404,
      );
    }

    if (!user.active) {
      throw new AppError(
        "User is inactive",
        422,
      );
    }

Do not return error objects such as:

    return {
      error: "User not found",
    };

Expected failures should interrupt the use case through the established application error mechanism.

## Input

Define explicit input types for the use case.

Example:

    export interface UpdateUserEmailRequest {
      userId: string;
      email: string;
    }

Avoid accepting broad or infrastructure-specific objects.

Do not pass HTTP request objects into Services.

Prefer:

    service.execute({
      userId,
      email,
    });

instead of:

    service.execute(request);

The Service input should describe the data required by the use case.

## Output

Return the result of the use case.

The output should be intentional and should not expose unnecessary internal data.

Example:

    export interface CreateUserResult {
      id: string;
      name: string;
      email: string;
    }

    async execute(
      input: CreateUserRequest,
    ): Promise<CreateUserResult> {
      ...
    }

Do not return transport-specific response objects.

Avoid:

    {
      statusCode: 201,
      body: user,
    }

HTTP representation belongs outside the Service.

## Orchestration

A Service may coordinate several operations required by one use case.

Example:

    const user =
      await this.userRepository.findById(userId);

    if (!user) {
      throw new AppError(
        "User not found",
        404,
      );
    }

    const existingUser =
      await this.userRepository.findByEmail(email);

    if (
      existingUser &&
      existingUser.id !== user.id
    ) {
      throw new AppError(
        "Email already exists",
        409,
      );
    }

    return this.userRepository.update(
      userId,
      { email },
    );

The Service owns the sequence because the sequence represents application behavior.

## Keep the use case cohesive

A Service should represent one clear operation.

Prefer:

- `CreateUserService`
- `UpdateUserEmailService`
- `DeactivateUserService`
- `GetUserProfileService`

over:

    UserService {
      create()
      update()
      delete()
      activate()
      deactivate()
      changePassword()
      resetPassword()
      sendEmail()
      ...
    }

Large generic Service classes tend to accumulate unrelated responsibilities.

Prefer small use-case-oriented Services.

## Validation

Distinguish structural validation from business validation.

Structural validation includes things such as:

- required field missing;
- malformed email;
- invalid primitive type;
- invalid request shape.

Business validation includes things such as:

- email already in use;
- order cannot be cancelled in current state;
- insufficient balance;
- user is not allowed to perform the operation.

Business validation belongs in the Service.

When the project uses request schema validation, structural validation may happen before the Service.

Do not duplicate the same validation in multiple layers without a reason.

## State transitions

Treat important state changes explicitly.

Example:

    if (order.status !== "pending") {
      throw new AppError(
        "Only pending orders can be cancelled",
        422,
      );
    }

    return this.orderRepository.updateStatus(
      order.id,
      "cancelled",
    );

Do not perform state transitions without checking whether the transition is valid.

## Side effects

A Service may coordinate side effects required by the use case.

Example:

    const user =
      await this.userRepository.create(data);

    await this.emailGateway.sendWelcomeEmail(
      user.email,
    );

    return user;

When consistency between multiple operations matters, define explicitly whether they require:

- a database transaction;
- retry behavior;
- an outbox/event pattern;
- compensating action.

Do not assume several independent side effects are automatically atomic.

## Error handling

Do not catch errors unless the Service has a concrete reason to recover, translate, retry, or add meaningful application context.

Avoid:

    try {
      return await this.userRepository.create(data);
    } catch {
      throw new AppError(
        "Could not create user",
        500,
      );
    }

This converts an unexpected infrastructure error into an expected application error and hides useful information.

Let unexpected errors propagate unless the use case has explicit recovery semantics.

## Avoid unnecessary abstraction inside the Service

Do not split simple business rules into many tiny helper classes without a concrete need.

A Service should remain readable as the description of the use case.

Prefer:

    async execute(input) {
      const user =
        await this.userRepository.findById(
          input.userId,
        );

      if (!user) {
        throw new AppError(
          "User not found",
          404,
        );
      }

      ...

      return result;
    }

The main execution path should be easy to follow.

Extract helpers when they represent reusable logic or make the use case materially clearer.

## Rules

When implementing a Service:

- represent one clear application use case;
- prefer one Service class per use case;
- use a consistent `execute()` entry point;
- define explicit input and output types;
- inject dependencies through the constructor;
- depend on repository and gateway contracts;
- keep business rules in the Service;
- use `AppError` for expected application failures;
- keep the main use-case flow easy to read;
- coordinate required operations explicitly;
- validate important state transitions;
- distinguish business validation from structural request validation;
- do not instantiate infrastructure dependencies inside the Service;
- do not return HTTP-specific responses;
- do not catch unexpected errors without a concrete reason;
- avoid large generic `UserService`, `OrderService`, or similar god classes.
