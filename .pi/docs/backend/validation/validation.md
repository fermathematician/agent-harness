# Validation

## Purpose

Validation at the HTTP boundary ensures that incoming request data has the expected structure before it reaches the application use case.

Its responsibility is to validate and parse transport input such as:

- request body;
- route parameters;
- query parameters.

Validation answers questions about the shape and primitive validity of incoming data.

Examples:

- is `email` present?
- is `email` a valid email string?
- is `age` a number?
- is `userId` a valid UUID?
- is `page` a valid positive integer?
- does the request body contain the expected fields?

Validation should not implement business rules.

## Validation boundary

The typical flow is:

    HTTP Request
        ↓
    Validation
        ↓
    Controller
        ↓
    Service
        ↓
    Repository
        ↓
    Database

Validation protects the application boundary from malformed input.

The Controller should normally receive input that has already passed structural validation.

## Structural validation vs business validation

Keep structural validation separate from business validation.

Structural validation answers:

    "Is this input structurally valid?"

Business validation answers:

    "Is this operation allowed by the application?"

Example:

    email = "gabriel@example.com"

Structural validation:

    Is it a string?
    Is it a valid email format?

Business validation:

    Is this email already registered?
    Is the user allowed to change to this email?

Persistence constraint:

    Is the email column UNIQUE?

These are different responsibilities.

Typical flow:

    Request schema
        ↓
    structural validation
        ↓
    Controller
        ↓
    Service
        ↓
    business validation
        ↓
    Repository
        ↓
    database constraints

Do not move business rules into request schemas merely because the validation library makes it possible.

## Schema validation

Prefer explicit schemas for HTTP input.

Example using Zod:

    import { z } from "zod";

    export const createUserSchema =
      z.object({
        name:
          z.string()
            .min(1),

        email:
          z.string()
            .email(),

        age:
          z.number()
            .int()
            .nonnegative(),
      });

The schema describes the structure accepted by the HTTP endpoint.

Do not use the Prisma model as the request validation schema.

The persistence model and the public HTTP input are different contracts.

## Body validation

Validate request bodies before invoking the Controller or application use case.

Example:

    const createUserBodySchema =
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        age: z.number().int().min(0),
      });

The endpoint should reject malformed bodies before the Service executes.

Avoid relying on code such as:

    const { name, email } =
      request.body;

without validating that those fields actually have the expected structure.

## Route parameter validation

Route parameters are transport input and should be validated when their format matters.

Example:

    const userParamsSchema =
      z.object({
        userId: z.string().uuid(),
      });

For:

    GET /users/:userId

the application should not receive an invalid identifier when the expected format can be checked at the HTTP boundary.

Do not query the database merely to discover that a structurally invalid identifier cannot exist.

Whether a structurally valid identifier actually exists remains an application concern.

Example:

    "abc"

may fail UUID validation.

But:

    "550e8400-e29b-41d4-a716-446655440000"

may be structurally valid and still refer to no User.

The second case is handled by the Service:

    const user =
      await userRepository.findById(userId);

    if (!user) {
      throw new AppError(
        "User not found",
        404,
      );
    }

## Query parameter validation

Query parameters should also be validated and parsed.

HTTP query parameters commonly arrive as strings.

Example request:

    GET /users?page=2&pageSize=20&active=true

The application may want:

    {
      page: 2,
      pageSize: 20,
      active: true
    }

Use the validation layer to parse and validate this transport representation according to the project's schema convention.

Example:

    const listUsersQuerySchema =
      z.object({
        page:
          z.coerce
            .number()
            .int()
            .positive()
            .default(1),

        pageSize:
          z.coerce
            .number()
            .int()
            .positive()
            .default(20),

        active:
          z.enum(["true", "false"])
            .transform(
              value => value === "true",
            )
            .optional(),
      });

This prevents every Controller from implementing its own ad-hoc query parsing.

## Validation middleware

Prefer reusable validation middleware rather than manually calling schemas in every Controller.

Conceptually:

    validate({
      body: createUserBodySchema,
    })

or:

    validate({
      params: userParamsSchema,
      query: listUsersQuerySchema,
    })

A generic middleware may validate the relevant HTTP input before the Controller executes.

Example:

    export function validate(
      schemas: RequestSchemas,
    ) {
      return (
        request: Request,
        response: Response,
        next: NextFunction,
      ) => {
        // validate configured request sections
        // expose parsed values
        // call next()
      };
    }

The exact implementation may vary according to the framework and validation library.

Keep the middleware generic.

Do not put entity-specific business rules inside the generic validation middleware.

## Parsed values

Prefer using parsed values rather than validating input and then continuing to use the original unvalidated representation.

For example, if validation converts:

    "20"

into:

    20

the Controller should receive or access the parsed number.

Avoid:

    validate(request.query)

followed by:

    Number(request.query.page)

when the schema has already performed that parsing.

The validation result should become the trusted transport input for the remainder of the HTTP boundary.

## Where parsed data lives

Use one consistent project convention for exposing validated data.

Possible approaches include:

    request.validated

or replacing specific validated request fields when the framework and typing strategy support it safely.

Example conceptual shape:

    request.validated = {
      body,
      params,
      query,
    };

Then:

    const {
      name,
      email,
    } = request.validated.body;

The exact mechanism is less important than consistency.

Do not create several competing conventions such as:

    request.safeBody
    request.parsed
    response.locals.input
    request.validated

within the same application.

Choose one project convention.

## Validation errors

Invalid transport input should produce a client error response.

A common HTTP status is:

    400 Bad Request

Some APIs use:

    422 Unprocessable Entity

for structurally understandable requests that fail semantic input validation.

Follow the project's HTTP error convention consistently.

Do not expose raw validation-library error objects directly as the public API response unless that format is intentionally part of the API contract.

Translate validation failures into the project's error response shape.

Example conceptual response:

    {
      "error": "Invalid request",
      "issues": [
        {
          "field": "email",
          "message": "Invalid email"
        }
      ]
    }

The public error representation should remain stable even if the underlying validation library changes.

## Validation library errors

A validation library may throw its own error type.

Example with Zod:

    ZodError

Translate known validation errors at the HTTP boundary.

Do not let raw library-specific errors leak through the API accidentally.

This translation may happen in:

- the validation middleware;
- a dedicated validation error mapper;
- the global HTTP error handler.

Use one consistent project convention.

## AppError and validation

Do not use `AppError` as a replacement for request schema validation.

Avoid manually writing:

    if (!email) {
      throw new AppError(
        "Email is required",
        400,
      );
    }

inside every Service when the absence of `email` is purely a malformed HTTP request.

Prefer schema validation at the HTTP boundary.

Use `AppError` in the Service for expected application failures.

Example:

    const existingUser =
      await userRepository.findByEmail(
        email,
      );

    if (existingUser) {
      throw new AppError(
        "Email already exists",
        409,
      );
    }

The distinction is:

    malformed input
        → validation

    valid input rejected by application rules
        → Service / AppError

## Validation and Controller

When validation middleware is used, Controllers should not repeat the same structural checks.

Avoid:

    if (
      typeof email !== "string" ||
      !email.includes("@")
    ) {
      ...
    }

when the route already validates the body with a schema.

The Controller should focus on:

    validated HTTP input
        ↓
    application input
        ↓
    Service

Example:

    async handle(
      request: Request,
      response: Response,
    ) {
      const {
        name,
        email,
      } = request.validated.body;

      const user =
        await this.createUserService.execute({
          name,
          email,
        });

      return response
        .status(201)
        .json(user);
    }

## Validation and Service

The Service may assume that transport-level structural validation has already occurred when it is invoked through the HTTP adapter.

However, the Service must still enforce application invariants.

Example:

The schema may guarantee:

    email is a valid email string

The Service guarantees:

    email is not already registered

Do not rely on the HTTP schema for application rules that must remain correct when the Service is called from another adapter.

A Service may eventually be invoked from:

    HTTP
    CLI
    background job
    message consumer
    tests

Business invariants must therefore remain inside the application layer.

## Validation and Repository

Repositories should not perform HTTP request validation.

Avoid:

    UserRepository.create({
      email: unknownHttpValue,
    })

with the expectation that Prisma or the database will serve as the request validator.

By the time data reaches the Repository, its application-level type should already be known.

Persistence constraints remain the final integrity boundary for database invariants.

## Validation and database constraints

Request validation does not replace database constraints.

Example:

The schema validates:

    email is correctly formatted

The Service checks:

    email is not currently registered

The database enforces:

    UNIQUE(email)

All three may exist simultaneously because they protect different boundaries.

The database constraint remains necessary for invariants that must survive concurrent requests.

## Unknown fields

Choose an explicit project convention for unexpected request fields.

For example, a request may contain:

    {
      "name": "Gabriel",
      "email": "gabriel@example.com",
      "isAdmin": true
    }

when `isAdmin` is not part of the Create User API.

The validation strategy should define whether unknown fields are:

    rejected

or:

    stripped

Do not allow arbitrary request properties to flow into persistence.

Never rely on:

    prisma.user.create({
      data: request.body,
    });

Explicit request schemas protect against accidentally exposing persistence fields through the HTTP API.

## Optional and nullable fields

Distinguish intentionally between:

    required
    optional
    nullable

These meanings are not interchangeable.

Example:

    name: z.string()

means the value is required.

    name: z.string().optional()

allows the field to be absent.

    name: z.string().nullable()

allows:

    null

Use the semantics required by the endpoint.

This distinction is particularly important for update operations.

## Create validation

Create schemas normally describe the fields accepted when creating an entity.

Example:

    const createUserBodySchema =
      z.object({
        name:
          z.string()
            .min(1),

        email:
          z.string()
            .email(),

        age:
          z.number()
            .int()
            .nonnegative(),
      });

Do not automatically expose every database field.

Fields such as:

    id
    createdAt
    updatedAt
    passwordHash
    internalStatus

should not become writable merely because they exist in the persistence model.

## Update validation

Update schemas should describe only the fields that the endpoint intentionally allows to change.

Example:

    const updateUserBodySchema =
      z.object({
        name:
          z.string()
            .min(1)
            .optional(),

        email:
          z.string()
            .email()
            .optional(),
      });

Do not derive a public update endpoint automatically from the complete persistence model.

A generic update schema must not accidentally allow modification of protected fields.

For domain-specific operations, prefer dedicated schemas.

Example:

    changeUserPasswordSchema

rather than expanding a generic `updateUserSchema` indefinitely.

## Schema reuse

Reuse schemas when they represent the same transport contract.

Do not force reuse merely because two fields happen to share the same primitive type.

Reusable primitives may be useful.

Example:

    const emailSchema =
      z.string().email();

Then:

    const createUserBodySchema =
      z.object({
        name: z.string().min(1),
        email: emailSchema,
      });

Keep reuse intentional and readable.

Avoid building a deeply abstract schema system that makes endpoint contracts difficult to understand.

## Schema location

Keep request schemas close to the HTTP feature or use case they validate.

For example:

    users/
    ├── create-user/
    │   ├── create-user-controller.ts
    │   ├── create-user-service.ts
    │   └── create-user-schema.ts
    │
    └── update-user/
        ├── update-user-controller.ts
        ├── update-user-service.ts
        └── update-user-schema.ts

or according to the project's established feature structure.

Shared schema primitives may live in a shared validation location.

Example:

    shared/
    └── validation/
        ├── email-schema.ts
        └── pagination-schema.ts

Do not place every schema in one global file as the application grows.

## Authentication is not validation

Do not use the validation layer to establish user identity.

This:

    ensureAuthenticated

belongs to authentication, not request validation.

Validation answers:

    "Is the request input structurally valid?"

Authentication answers:

    "Who is making this request?"

Authorization answers:

    "May this identity perform this operation?"

These concerns may all appear in the same route but remain separate responsibilities.

Example:

    router.patch(
      "/users/:userId",
      ensureAuthenticated,
      validate({
        params: userParamsSchema,
        body: updateUserBodySchema,
      }),
      updateUserController.handle,
    );

Conceptually:

    Request
      ↓
    Authentication
      ↓
    Validation
      ↓
    Controller
      ↓
    Service
      ↓
    Repository

The exact middleware ordering may vary when a route has specific requirements.

Do not merge authentication and validation into one generic middleware.

## Validation should be deterministic

Request validation should depend primarily on the request representation itself.

Avoid database access from schema validation.

For example, do not implement:

    emailSchema.refine(
      async email =>
        !(await prisma.user.findUnique(...))
    );

when checking email uniqueness is an application rule.

Prefer:

    Schema
      → email format

    Service
      → email uniqueness

    Database
      → unique constraint

This keeps validation deterministic and prevents persistence concerns from leaking into the HTTP validation layer.

## Testing

Validation tests should focus on transport input contracts.

Useful tests include:

- valid body accepted;
- required field missing;
- invalid primitive type rejected;
- invalid format rejected;
- route parameter rejected when malformed;
- query parameter parsed correctly;
- default query values applied;
- optional fields handled correctly;
- unknown fields handled according to project convention.

Do not duplicate Service business-rule tests inside validation tests.

Example:

Validation test:

    invalid email format
        → rejected

Service test:

    valid email already registered
        → AppError 409

Database/integration test:

    duplicate email constraint
        → enforced

Each test protects a different boundary.

## Example flow

Request:

    POST /users

Body:

    {
      "name": "Gabriel",
      "email": "gabriel@example.com",
      "age": 25
    }

Flow:

    HTTP Request
        ↓
    createUserBodySchema
        ↓
    validate()
        ↓
    validated body
        ↓
    CreateUserController.handle()
        ↓
    CreateUserService.execute()
        ↓
    business rules
        ↓
    UserRepository.create()
        ↓
    Prisma
        ↓
    Database

Malformed request:

    {
      "name": "Gabriel",
      "email": "not-an-email"
    }

stops at:

    Validation
        ↓
    HTTP client error

Valid request with duplicate email reaches:

    CreateUserService
        ↓
    AppError("Email already exists", 409)

These failures belong to different layers.

## Rules

When implementing validation:

- validate HTTP input before it reaches the application use case;
- use explicit schemas for request bodies, route parameters, and query parameters;
- keep structural validation separate from business validation;
- prefer reusable validation middleware over repeated manual checks in Controllers;
- use parsed values after successful validation;
- establish one consistent convention for exposing validated request data;
- translate validation-library failures into the project's HTTP error format;
- do not expose raw validation-library errors unintentionally;
- do not use `AppError` as a substitute for structural request validation;
- keep business invariants inside Services;
- keep persistence constraints inside the database;
- do not access Prisma or Repositories from request schemas;
- do not pass arbitrary request bodies directly into persistence;
- explicitly decide how unknown fields are handled;
- distinguish required, optional, and nullable fields;
- expose only intentionally writable fields in create and update schemas;
- use dedicated schemas for domain-specific operations when appropriate;
- keep schemas close to the feature or use case they validate;
- reuse schema primitives when reuse improves clarity;
- do not confuse validation with authentication or authorization;
- do not implement `ensureAuthenticated` as validation;
- keep request validation deterministic when possible;
- test transport contracts without duplicating Service business-rule tests.
