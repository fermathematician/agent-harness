# Controller

## Purpose

A Controller is the HTTP boundary of the application.

Its responsibility is to receive an HTTP request, extract the required input, call the appropriate Service, and translate the Service result into an HTTP response.

A Controller should remain thin.

It should understand HTTP, but not business rules or persistence details.

## Structure

Prefer explicit Controller classes with a single public entry point.

Example:

    export class CreateUserController {
      constructor(
        private readonly createUserService: CreateUserService,
      ) {}

      async handle(
        request: Request,
        response: Response,
      ): Promise<Response> {
        const { name, email } = request.body;

        const user =
          await this.createUserService.execute({
            name,
            email,
          });

        return response.status(201).json(user);
      }
    }

Use a predictable entry point such as:

    handle()

This keeps Controllers consistent across the project.

## Responsibilities

A Controller may:

- read route parameters;
- read query parameters;
- read request body data;
- read authenticated-user context;
- call a Service;
- choose the appropriate success HTTP status;
- return JSON or another HTTP representation;
- set response headers when required.

Keep these responsibilities focused on transport concerns.

## Request extraction

Extract only the fields required by the use case.

Example:

    const { name, email } = request.body;

    const user =
      await this.createUserService.execute({
        name,
        email,
      });

Avoid forwarding the entire HTTP request object.

Do not do:

    service.execute(request);

The Service should receive an application-specific input object, not Express infrastructure.

## Route parameters

Convert route parameters into the type expected by the Service when necessary.

Example:

    const userId = request.params.userId;

    const user =
      await this.getUserService.execute({
        userId,
      });

If a route parameter requires structural parsing or validation, perform that before invoking the Service according to the project's validation convention.

## Query parameters

Translate HTTP query parameters into explicit Service input.

Example:

    const page =
      Number(request.query.page ?? 1);

    const pageSize =
      Number(request.query.pageSize ?? 20);

    const result =
      await this.listUsersService.execute({
        page,
        pageSize,
      });

Do not let raw Express query objects leak into the Service.

## Request body

Do not pass arbitrary request bodies through the application unchanged.

Avoid:

    service.execute(request.body);

when the Service expects a well-defined input shape.

Prefer:

    const {
      name,
      email,
      age,
    } = request.body;

    return service.execute({
      name,
      email,
      age,
    });

This makes the boundary explicit.

## Authentication context

When authentication middleware attaches user information to the request, extract only the application-relevant values.

Example:

    const authenticatedUserId =
      request.user.id;

    await this.updateProfileService.execute({
      authenticatedUserId,
      name,
    });

Do not pass authentication middleware objects or session infrastructure directly into the Service.

## Success responses

Controllers define the HTTP representation of successful use cases.

Common conventions:

### Creation

Use:

    201 Created

Example:

    return response.status(201).json(user);

### Successful retrieval

Use:

    200 OK

Example:

    return response.status(200).json(user);

### Successful update

Use:

    200 OK

when returning the updated resource.

Example:

    return response.status(200).json(user);

Use:

    204 No Content

when the operation succeeds and intentionally returns no response body.

### Successful deletion

Prefer:

    204 No Content

when nothing needs to be returned.

Example:

    return response.status(204).send();

Choose the status code according to the HTTP semantics of the endpoint.

## Response shape

Return intentional response shapes.

Example:

    return response.status(200).json({
      user,
    });

or:

    return response.status(200).json(user);

Follow the project's API response convention consistently.

Do not expose internal implementation details unintentionally.

Never expose sensitive or unnecessary internal fields.

Do not serialize persistence objects blindly when they may contain fields that are not part of the public API.

When response transformation or sanitization is required, use the project's Response DTO / Presenter convention.

Response shaping should remain explicit at the HTTP boundary.

## Errors

Do not catch every Service error inside Controllers.

Avoid:

    try {
      const user =
        await service.execute(input);

      return response.json(user);
    } catch (error) {
      if (error instanceof AppError) {
        return response
          .status(error.statusCode)
          .json({
            error: error.message,
          });
      }

      return response
        .status(500)
        .json({
          error: "Internal server error",
        });
    }

Expected application errors should propagate to the global error middleware.

Prefer:

    const user =
      await service.execute(input);

    return response
      .status(201)
      .json(user);

The global error handler is responsible for translating `AppError` into an HTTP error response.

A Controller should catch an error only when it has a concrete transport-specific reason to do so.

## Business rules

Do not implement business decisions in Controllers.

Avoid:

    const existingUser =
      await userRepository.findByEmail(email);

    if (existingUser) {
      throw new AppError(
        "Email already exists",
        409,
      );
    }

This is application behavior, not HTTP behavior.

The Controller should only provide the Service with the required input.

## Persistence

Controllers should not perform persistence operations.

Do not call Prisma or database APIs from a Controller.

Avoid:

    await prisma.user.create(...);

The Controller should communicate through the use case exposed by the Service.

## Structural validation

Controllers may participate in transport-level validation according to the project's validation strategy.

Examples:

- parsing route parameters;
- validating request shape;
- validating primitive types;
- applying request schemas.

Prefer dedicated schema validation middleware or schema parsers when available.

Example:

    const data =
      createUserSchema.parse(
        request.body,
      );

    const user =
      await this.createUserService.execute(
        data,
      );

Do not duplicate business validation that already belongs to the Service.

Structural validation should answer questions such as:

- is the required field present?
- is the value the expected primitive type?
- does the request match the expected shape?
- can the route or query parameter be parsed correctly?

It should not answer business questions such as:

- is this email already registered?
- is this user allowed to perform the operation?
- can this order be cancelled?
- does this account have enough balance?

Those decisions belong to the application use case.

## Headers

Set HTTP headers when the endpoint semantics require them.

Example:

    response.setHeader(
      "Location",
      `/users/${user.id}`,
    );

    return response
      .status(201)
      .json(user);

Do not place infrastructure-independent business behavior in header-handling logic.

## Redirects

When the API or application legitimately uses redirects, Controllers may return the appropriate HTTP redirect response.

Example:

    return response.redirect(
      302,
      destination,
    );

Redirect behavior is a transport concern.

## File and stream responses

When a use case returns data intended for a file or stream response, the Controller translates it into HTTP semantics.

Example concerns include:

- `Content-Type`;
- `Content-Disposition`;
- stream piping;
- download filename.

The underlying business decision should remain outside the Controller.

For example, the Service may determine which report the user is allowed to export, while the Controller determines how that report is represented as an HTTP download.

## Keep Controllers thin

A Controller should usually be easy to read from top to bottom.

Typical flow:

    extract input
        ↓
    call Service
        ↓
    return HTTP response

Example:

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

If a Controller contains substantial conditional logic, persistence operations, or application decisions, reconsider whether that logic belongs elsewhere.

Thin does not mean that a Controller must contain the minimum possible number of lines.

It means that its logic should remain focused on the HTTP boundary.

Input extraction, parsing, response status selection, headers, and serialization are legitimate Controller responsibilities.

Business decisions are not.

## Naming conventions

Name Controllers after the use case or endpoint action they expose.

Prefer:

- `CreateUserController`
- `GetUserController`
- `ListUsersController`
- `UpdateUserController`
- `DeleteUserController`
- `DeactivateUserController`

Avoid large generic Controllers such as:

    UserController {
      create()
      update()
      delete()
      deactivate()
      ...
    }

when the project architecture uses one use case per class.

Use:

    handle()

as the standard public Controller entry point.

This creates symmetry with the Service convention:

    Controller.handle()
        ↓
    Service.execute()

Do not vary equivalent entry-point names arbitrarily.

Avoid mixing:

    handle()
    run()
    execute()
    process()
    create()

for Controllers that perform the same architectural role.

Standardize Controller entry points on:

    handle()

## Dependency injection

Receive the required Service through the Controller constructor.

Example:

    export class CreateUserController {
      constructor(
        private readonly createUserService: CreateUserService,
      ) {}

      async handle(
        request: Request,
        response: Response,
      ): Promise<Response> {
        ...
      }
    }

Do not instantiate the Service inside `handle()`.

Avoid:

    async handle(request, response) {
      const service =
        new CreateUserService(...);

      ...
    }

The Controller should receive its dependencies already constructed.

This keeps dependency construction separate from request handling and makes the Controller easier to test.

## Controller dependencies

A Controller should normally depend on the Service required by its HTTP action.

Keep dependencies explicit.

Example:

    constructor(
      private readonly updateUserService: UpdateUserService,
    ) {}

If a Controller starts requiring many unrelated application dependencies, reconsider whether the HTTP action is coordinating responsibilities that should be represented by a single use case.

Do not use the Controller as an orchestration layer for several independent Services merely because it has access to the HTTP request.

The application use case should provide the cohesive operation required by the endpoint.

## Return type

When using Express, prefer an explicit return type consistent with the project's TypeScript configuration.

Example:

    async handle(
      request: Request,
      response: Response,
    ): Promise<Response> {
      ...
    }

If the Controller intentionally finishes the response without returning a body, adapt the type consistently rather than mixing conventions arbitrarily.

Do not vary Controller return conventions without a concrete reason.

## HTTP status ownership

The Controller owns the successful HTTP representation of the use case.

The Service should not return HTTP status codes.

Avoid Service results such as:

    return {
      statusCode: 201,
      user,
    };

Prefer:

    const user =
      await service.execute(input);

and let the Controller decide:

    return response
      .status(201)
      .json(user);

Application failures represented by `AppError` are translated into HTTP errors by the global error middleware according to the project's error convention.

This keeps successful HTTP representation in the Controller while centralizing error translation.

## Transport-specific transformations

The Controller may perform transformations that exist specifically because of HTTP.

Examples:

    const page =
      Number(request.query.page);

    const active =
      request.query.active === "true";

    const userId =
      request.params.userId;

These transformations convert transport representation into application input.

Avoid transformations that encode business meaning.

For example, this belongs outside the Controller:

    const discount =
      user.vip
        ? total * 0.2
        : 0;

The distinction is:

    HTTP representation
        → Controller transformation
        → application input

not:

    business state
        → Controller decision
        → business result

## Avoid leaking Express

Treat Express as an adapter at the HTTP boundary.

Types such as:

- `Request`;
- `Response`;
- `NextFunction`;

should remain within HTTP infrastructure.

Do not make Services depend on Express types.

Avoid:

    execute(request: Request)

Prefer:

    execute(input: CreateUserRequest)

This allows the application use case to remain independent from the HTTP framework.

## Testing considerations

Controllers should be testable primarily as HTTP-boundary adapters.

Useful Controller tests may verify:

- correct extraction of request data;
- correct Service input;
- correct success status code;
- correct response body;
- correct headers when applicable;
- correct parsing of route and query parameters.

Do not duplicate Service business-rule tests at the Controller level.

For example, the Service test should verify that duplicate emails are rejected.

The Controller test only needs to verify that it passes the correct email to the Service and returns the successful HTTP representation when the Service succeeds.

Error middleware behavior should be tested according to the global error-handling convention rather than reproduced independently in every Controller test.

## Example

A complete Controller should remain conceptually simple.

    export class CreateUserController {
      constructor(
        private readonly createUserService: CreateUserService,
      ) {}

      async handle(
        request: Request,
        response: Response,
      ): Promise<Response> {
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
      }
    }

The important properties are not the number of lines.

The important properties are:

- HTTP input is handled here;
- application input is explicit;
- the Service represents the use case;
- successful HTTP representation is handled here;
- business logic is absent;
- persistence logic is absent;
- infrastructure details do not leak into the Service.

## Rules

When implementing a Controller:

- represent one HTTP-facing action;
- keep the Controller focused on the HTTP boundary;
- use a consistent `handle()` entry point;
- receive required Services through constructor injection;
- extract only the data required by the Service;
- convert HTTP-specific input into application-specific input;
- do not pass Express `Request` objects into Services;
- call the appropriate Service;
- choose the correct success HTTP status;
- return an intentional response shape;
- use the project's Response DTO / Presenter convention when response transformation is required;
- keep HTTP semantics inside the Controller;
- let expected `AppError` failures propagate to the global error middleware;
- avoid broad `try/catch` blocks around every Service call;
- do not implement business rules;
- do not perform persistence operations;
- do not call Prisma;
- do not use the Controller to coordinate unrelated application operations;
- do not expose sensitive or unnecessary internal data;
- keep Express-specific types at the HTTP boundary;
- test Controller transport behavior without duplicating Service business-rule tests;
- prefer one Controller per use case when using the project's use-case-oriented architecture.
