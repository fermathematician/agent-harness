# Routes

## Purpose

Routes define how HTTP requests enter the application.

A Route connects:

```text
HTTP method + path
  ↓
middleware
  ↓
Controller
```

For example:

```text
PATCH /users/:userId
  ↓
Authentication
  ↓
Validation
  ↓
UpdateUserController
```

The Route is responsible for composition.

It should make visible:

```text
which endpoint exists
which HTTP method it uses
which middleware applies
which Controller handles it
whether authentication is required
whether broad authorization is required
which validation schema applies
```

Routes should not implement application behavior.

The Route says:

```text
"Requests matching this HTTP endpoint go through these boundaries
and then execute this Controller."
```

It should not answer:

```text
How is the User updated?
May this actor update this specific User?
Does this email already exist?
How is the database queried?
```

Those decisions belong to other layers.

---

## Position in the architecture

A typical HTTP flow is:

```text
HTTP Request
  ↓
Route
  ↓
Middleware
  ↓
Controller
  ↓
Service
  ↓
Repository
  ↓
Database
```

For example:

```text
PATCH /users/:userId
  ↓
ensureAuthenticated
  ↓
validate(updateUserSchema)
  ↓
UpdateUserController
  ↓
UpdateUserService
  ↓
UserRepository
```

The Route is the HTTP composition boundary.

It connects transport concerns to the application without implementing the use case itself.

---

## Route responsibilities

A Route may define:

```text
HTTP method
URL path
route parameters
middleware composition
authentication requirement
broad authorization requirement
validation middleware
Controller
```

Example:

```ts
router.patch(
  "/users/:userId",
  ensureAuthenticated,
  validate({
    params: updateUserParamsSchema,
    body: updateUserBodySchema,
  }),
  updateUserController.handle,
);
```

This Route expresses:

```text
PATCH
/users/:userId

requires authentication

validates:
  params
  body

handled by:
  UpdateUserController
```

That is enough.

---

## What Routes should not do

Do not implement business logic in Routes.

Avoid:

```ts
router.patch("/users/:userId", async (request, response) => {
  const user = await prisma.user.findUnique({
    where: {
      id: request.params.userId,
    },
  });

  if (!user) {
    return response.status(404).json({
      message: "User not found",
    });
  }

  if (user.id !== request.auth.userId) {
    return response.status(403).json({
      message: "Forbidden",
    });
  }

  const updatedUser = await prisma.user.update({
    where: {
      id: user.id,
    },
    data: request.body,
  });

  return response.json(updatedUser);
});
```

This Route is doing:

```text
HTTP routing
authentication consumption
resource loading
authorization
business decisions
persistence
response construction
```

These responsibilities should be separated.

Prefer:

```ts
router.patch(
  "/users/:userId",
  ensureAuthenticated,
  validate({
    params: updateUserParamsSchema,
    body: updateUserBodySchema,
  }),
  updateUserController.handle,
);
```

The Route composes the request pipeline.

The Controller and Service implement the use case.

---

## Route and Controller

The Route chooses the Controller.

The Controller handles the HTTP operation.

Conceptually:

```text
Route
→ Which Controller handles this endpoint?

Controller
→ How is this HTTP request translated into a use case?
```

Example:

```ts
router.post(
  "/users",
  validate({
    body: createUserBodySchema,
  }),
  createUserController.handle,
);
```

Then:

```ts
class CreateUserController {
  async handle(request: Request, response: Response) {
    const user = await this.createUserService.execute({
      name: request.validated.body.name,
      email: request.validated.body.email,
    });

    return response.status(201).json(user);
  }
}
```

The Route does not need to know how `CreateUserService` works.

It only knows which Controller handles the request.

---

## One endpoint, one application action

Prefer routes that map clearly to explicit application operations.

For example:

```text
POST   /users
→ CreateUser

GET    /users/:userId
→ GetUser

GET    /users
→ ListUsers

PATCH  /users/:userId
→ UpdateUser

DELETE /users/:userId
→ DeleteUser
```

Domain actions should also map explicitly.

Example:

```text
POST /invoices/:invoiceId/approve
→ ApproveInvoice

POST /orders/:orderId/cancel
→ CancelOrder

POST /users/:userId/deactivate
→ DeactivateUser
```

Do not force every application action into generic CRUD semantics.

If the operation has meaningful application behavior, expose that action clearly.

---

## HTTP method semantics

Use HTTP methods according to endpoint semantics.

Typical conventions:

```text
GET
→ retrieve data

POST
→ create resource or trigger explicit action

PUT
→ replace a resource representation

PATCH
→ partially modify a resource

DELETE
→ delete/remove according to endpoint semantics
```

Examples:

```text
POST /users
GET /users/:userId
PATCH /users/:userId
DELETE /users/:userId
```

For explicit domain actions:

```text
POST /orders/:orderId/cancel
POST /invoices/:invoiceId/approve
```

Avoid choosing methods solely based on which one is easiest to implement.

The method should communicate the operation represented by the endpoint.

---

## Route paths

Paths should describe resources and application actions clearly.

Prefer nouns for resources:

```text
/users
/orders
/invoices
/companies
```

Prefer resource identifiers in path parameters:

```text
/users/:userId
/orders/:orderId
/invoices/:invoiceId
```

Prefer explicit action segments when representing non-CRUD operations:

```text
/orders/:orderId/cancel
/invoices/:invoiceId/approve
/users/:userId/deactivate
```

Avoid unclear paths such as:

```text
/doUpdate
/processUser
/executeOrderAction
```

The path should make the HTTP contract understandable without exposing internal implementation details.

---

## Route parameters

Use path parameters to identify resources addressed by the endpoint.

Example:

```text
GET /users/:userId
```

The Route declares the parameter.

Validation verifies its structure.

The Controller consumes the validated parameter.

Example:

```ts
router.get(
  "/users/:userId",
  validate({
    params: userIdParamsSchema,
  }),
  getUserController.handle,
);
```

The validation layer may determine:

```text
Is userId a valid UUID?
```

The Service determines:

```text
Does this User exist?
```

Do not query the database in the Route merely to validate resource existence.

---

## Query parameters

Query parameters commonly represent:

```text
filters
pagination
sorting
search terms
optional view controls
```

Example:

```text
GET /users?page=2&active=true
```

Validate and normalize query values before the Controller/use case consumes them.

Example:

```ts
router.get(
  "/users",
  validate({
    query: listUsersQuerySchema,
  }),
  listUsersController.handle,
);
```

The Route should not manually parse application-specific query semantics.

Avoid:

```ts
router.get("/users", (request, response) => {
  const page = Number(request.query.page) || 1;

  const active = request.query.active === "true";

  // ...
});
```

Prefer reusable Validation to establish trusted structured input.

---

## Request body

Routes may associate body schemas with endpoints.

Example:

```ts
router.post(
  "/users",
  validate({
    body: createUserBodySchema,
  }),
  createUserController.handle,
);
```

The body schema defines accepted request structure.

The Route should not manually destructure and validate every field.

Avoid:

```ts
router.post("/users", (request, response) => {
  if (!request.body.email) {
    // ...
  }

  if (!request.body.name) {
    // ...
  }
});
```

Structural validation belongs to Validation.

Business validation belongs to the Service.

---

## Middleware composition

Routes compose middleware around the endpoint.

Conceptually:

```text
Route
  ↓
Middleware A
  ↓
Middleware B
  ↓
Middleware C
  ↓
Controller
```

Examples of middleware concerns:

```text
authentication
broad authorization
validation
rate limiting
request tracing
upload parsing
```

The Route decides which middleware participates in a particular endpoint.

Middleware itself owns its specific concern.

---

## Middleware order

Middleware order is behavior.

For example:

```ts
router.patch(
  "/users/:userId",
  ensureAuthenticated,
  validate({
    params: userParamsSchema,
    body: updateUserBodySchema,
  }),
  updateUserController.handle,
);
```

means:

```text
authenticate
  ↓
validate
  ↓
Controller
```

Changing the order may change externally observable behavior.

For example:

```text
Invalid body + invalid token
```

may produce different errors depending on whether Authentication or Validation executes first.

There is no universal middleware order for every application.

Use the project's route convention consistently.

The architectural distinction matters more than pretending one order is always correct.

---

## Authentication at Routes

Protected routes should make authentication explicit.

Example:

```ts
router.get("/users/me", ensureAuthenticated, getCurrentUserController.handle);
```

Public routes omit authentication intentionally.

Example:

```ts
router.post(
  "/sessions",
  validate({
    body: createSessionBodySchema,
  }),
  createSessionController.handle,
);
```

The Route should make it easy to answer:

```text
Is this endpoint public or protected?
```

Do not hide authentication requirements deep inside Controllers.

Avoid relying on Controllers to remember:

```ts
if (!request.auth) {
  // ...
}
```

Route composition should establish the protected boundary first.

---

## Authorization at Routes

Broad authorization may also be composed at the Route boundary.

Example:

```ts
router.get(
  "/admin/users",
  ensureAuthenticated,
  ensureRole("ADMIN"),
  listUsersController.handle,
);
```

This works well when the decision depends only on context already available before the use case.

Examples:

```text
must be authenticated
must have ADMIN role
must have reports:read permission
```

Resource-specific authorization generally belongs in the Service.

Example:

```text
May this actor update User 123?
```

may require:

```text
load User 123
inspect ownership
inspect tenant
inspect state
```

Do not make generic Route middleware reproduce application/resource authorization.

---

## Validation at Routes

Routes should make request validation explicit.

Example:

```ts
router.patch(
  "/users/:userId",
  ensureAuthenticated,
  validate({
    params: updateUserParamsSchema,
    body: updateUserBodySchema,
  }),
  updateUserController.handle,
);
```

This exposes the HTTP contract directly in route composition.

Possible validation inputs:

```text
params
query
body
headers
```

Only validate what the endpoint actually accepts.

Do not reuse one giant schema merely because endpoints operate on the same entity.

Example:

```text
CreateUser
→ createUserBodySchema

UpdateUser
→ updateUserBodySchema

ListUsers
→ listUsersQuerySchema
```

Schemas should follow endpoint/use-case input semantics.

---

## Public vs protected routes

Public/protected status should be intentional.

Example:

```ts
router.post(
  "/sessions",
  validate({
    body: createSessionBodySchema,
  }),
  createSessionController.handle,
);
```

is visibly public.

Whereas:

```ts
router.get("/users/me", ensureAuthenticated, getCurrentUserController.handle);
```

is visibly protected.

Avoid route systems where authentication is difficult to infer because some hidden mechanism conditionally protects unrelated endpoints.

Global authentication middleware may still be appropriate when the entire application area is protected.

The important rule is that protection must be intentional and understandable.

---

## Router grouping

Use routers to group cohesive endpoint families.

Example:

```text
routes/
├── users.routes.ts
├── sessions.routes.ts
├── orders.routes.ts
└── invoices.routes.ts
```

A `users.routes.ts` file may contain:

```text
POST   /users
GET    /users
GET    /users/:userId
PATCH  /users/:userId
DELETE /users/:userId
```

Do not create one giant route file for the entire application.

Avoid:

```text
routes.ts
→ users
→ orders
→ invoices
→ sessions
→ reports
→ admin
→ everything else
```

Grouping should make endpoint discovery easy.

---

## Feature-oriented routing

If the project uses feature modules, Routes may live with their feature.

Example:

```text
modules/
└── users/
    ├── controllers/
    ├── services/
    ├── repositories/
    ├── validation/
    └── routes/
```

Or:

```text
routes/
├── users.routes.ts
├── orders.routes.ts
└── sessions.routes.ts
```

Either organization may work.

Follow the project's module convention.

The important point is that Routes remain composition code rather than application logic.

---

## Route registration

Feature routers eventually need to be registered in the HTTP application.

Example:

```ts
const app = express();

app.use("/users", usersRouter);
app.use("/sessions", sessionsRouter);
app.use("/orders", ordersRouter);
```

Then `usersRouter` may define:

```ts
router.get("/:userId", getUserController.handle);
```

producing:

```text
GET /users/:userId
```

Alternatively, routes may define complete paths themselves.

Choose one convention and use it consistently.

Avoid mixing:

```text
/users/:userId
```

sometimes at application registration and sometimes entirely inside child routers without a clear convention.

---

## Route factories and dependencies

Routes may receive already-constructed Controllers.

Example:

```ts
export function createUserRoutes({
  createUserController,
  updateUserController,
}: UserRouteDependencies) {
  const router = Router();

  router.post("/", createUserController.handle);

  router.patch("/:userId", updateUserController.handle);

  return router;
}
```

Or the project may import Controllers from a composition module.

The exact dependency injection strategy belongs to the project's architecture.

The key rule is:

```text
Routes compose dependencies.

Routes do not implement them.
```

Do not instantiate repositories or Prisma clients inside individual route handlers.

Avoid:

```ts
router.post("/users", async (...) => {
  const repository =
    new PrismaUserRepository(prisma);

  const service =
    new CreateUserService(repository);

  // ...
});
```

Composition should be centralized and intentional.

---

## Controller method binding

Be careful when passing class methods directly to Express.

Example:

```ts
router.post("/users", createUserController.handle);
```

This works safely if `handle` does not depend on an unbound `this`, or if the project's Controller convention handles binding.

For example:

```ts
class CreateUserController {
  constructor(private readonly service: CreateUserService) {}

  handle = async (request: Request, response: Response) => {
    // this.service is preserved
  };
}
```

Another option is explicit binding:

```ts
router.post("/users", createUserController.handle.bind(createUserController));
```

Follow one project convention.

Do not allow route composition to accidentally break Controller context.

---

## Route naming

Name route files and routers according to the resource or feature they expose.

Prefer:

```text
users.routes.ts
orders.routes.ts
sessions.routes.ts
```

Avoid vague names:

```text
api.routes.ts
general.routes.ts
misc.routes.ts
handlers.ts
```

unless they represent a genuinely cohesive application boundary.

Route names should improve navigation.

---

## Path naming consistency

Choose consistent naming for identifiers.

Prefer:

```text
/users/:userId
/orders/:orderId
/companies/:companyId
```

over mixing:

```text
/users/:id
/orders/:orderId
/companies/:company
```

Specific parameter names are useful when multiple resources appear in the same path.

Example:

```text
/companies/:companyId/users/:userId
```

Now the Controller can distinguish both values explicitly.

---

## Nested routes

Nested resources may communicate relationships.

Example:

```text
GET /companies/:companyId/users
```

This may mean:

```text
list Users belonging to Company
```

Nested paths are useful when the parent is meaningful to the operation.

Avoid arbitrarily deep nesting such as:

```text
/companies/:companyId/
departments/:departmentId/
teams/:teamId/
users/:userId/
orders/:orderId
```

Deep paths often indicate the endpoint contract has become harder to understand than necessary.

Use nesting when it communicates application/resource context clearly.

---

## Current actor routes

For operations targeting the authenticated actor, explicit `/me` routes may be useful.

Example:

```text
GET /users/me
PATCH /users/me
```

Authentication establishes:

```text
request.auth.userId
```

The client does not need to send its own user ID.

This avoids contracts such as:

```text
PATCH /users/:userId
```

when the operation is specifically:

```text
update my own profile
```

Whether `/me` or explicit resource IDs are preferable depends on the application's API design.

Use the contract that represents the use case most clearly.

---

## Route-level business logic

Do not use Route composition to encode application rules.

Avoid:

```ts
if (process.env.ENABLE_APPROVALS) {
  router.post("/invoices/:id/approve", approveInvoiceController.handle);
}
```

unless endpoint availability itself is intentionally an infrastructure/configuration concern.

Likewise avoid Route logic such as:

```text
if user belongs to Company X
register endpoint

if Order status is pending
execute this Controller

if balance is sufficient
continue request
```

These are application decisions.

Routes compose the request pipeline.

Services decide application behavior.

---

## Route and Repository

Routes should never access repositories directly.

Avoid:

```text
Route
  ↓
Repository
```

Prefer:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository
```

The Route should not know:

```text
Prisma
database queries
transaction details
persistence models
```

Persistence remains behind the application boundary.

---

## Route and Prisma

Do not access Prisma directly from Routes.

Avoid:

```ts
router.get("/users/:userId", async (request, response) => {
  const user = await prisma.user.findUnique({
    where: {
      id: request.params.userId,
    },
  });

  return response.json(user);
});
```

Even if the endpoint appears simple, this bypasses the established architecture.

Prefer consistent boundaries:

```text
Route
→ Controller
→ Service
→ Repository
→ Prisma
```

---

## Route and AppError

Routes normally do not translate `AppError`.

Expected application errors propagate through:

```text
Controller
  ↓
global error handler
```

For example:

```text
Service
→ throw AppError("User not found", 404)

Controller
→ propagate

global error handler
→ HTTP 404
```

Do not wrap every Route in:

```ts
try {
  // ...
} catch (error) {
  // translate error
}
```

Use the application's centralized error handling convention.

---

## Route responses

Routes do not own successful response representation.

The Controller decides:

```text
status code
body
headers
cookies
redirects
file/stream response
```

Example:

```text
Route
→ POST /users

Controller
→ 201 + created User
```

Avoid response logic in Route composition.

---

## API versioning

If the application uses HTTP API versions, Routes are a natural place to expose them.

Example:

```text
/api/v1/users
/api/v1/orders
```

Possible registration:

```ts
app.use("/api/v1/users", usersRouter);
```

Do not introduce versioning automatically.

Use it when the project/API lifecycle requires it.

Keep versioning strategy consistent across the public API.

---

## Global middleware vs route middleware

Some middleware applies to the whole HTTP application.

Examples may include:

```text
JSON parsing
request IDs
logging
CORS
global rate limits
error handling
```

Other middleware is endpoint-specific:

```text
Authentication
Authorization
Validation
uploads
endpoint-specific rate limits
```

Conceptually:

```text
Application middleware
  ↓
Router
  ↓
Route middleware
  ↓
Controller
```

Do not duplicate global middleware on every Route.

Do not make endpoint-specific requirements invisible by placing everything globally.

---

## Error middleware placement

Global error handling executes after endpoint processing.

Conceptually:

```text
Request
  ↓
Routes
  ↓
Controller
  ↓
Service
  ↓
error
  ↓
global error handler
```

The application composition may resemble:

```ts
app.use(routes);

app.use(errorHandler);
```

The Route does not need its own error translation logic when the project uses centralized handling.

---

## Route discovery

A developer should be able to inspect the route layer and quickly understand the HTTP surface.

For example:

```text
users.routes.ts

POST   /
GET    /
GET    /:userId
PATCH  /:userId
DELETE /:userId
```

The file should not require reading business logic to understand what endpoints exist.

Good route composition acts almost like an executable API map.

---

## Readability

Prefer vertical composition when an endpoint has multiple middleware.

Example:

```ts
router.patch(
  "/:userId",
  ensureAuthenticated,
  ensurePermission("users:update"),
  validate({
    params: updateUserParamsSchema,
    body: updateUserBodySchema,
  }),
  updateUserController.handle,
);
```

This exposes the request pipeline clearly.

Avoid hiding important middleware behind difficult-to-understand nested wrappers unless the abstraction provides real value.

The endpoint should remain easy to audit.

---

## Shared middleware

Reusable middleware should express one cohesive concern.

Examples:

```text
ensureAuthenticated

ensureRole("ADMIN")

ensurePermission("users:read")

validate(schema)
```

Avoid giant middleware such as:

```text
prepareUserRequest
```

that secretly performs:

```text
authentication
validation
resource loading
authorization
business rules
```

Composition is easier to reason about when responsibilities remain explicit.

---

## Route abstractions

Do not abstract Routes merely to remove repetition.

Avoid prematurely creating generic systems such as:

```ts
createCrudRoutes({
  entity: "user",
  repository: userRepository,
  permissions: ...
});
```

if they hide meaningful differences between use cases.

CRUD endpoints may differ in:

```text
authentication
authorization
validation
response semantics
business behavior
domain actions
```

Explicit Route composition is often easier to understand and audit.

Extract abstractions only when they preserve semantic clarity.

---

## Route example

A cohesive User router may look conceptually like:

```ts
const router = Router();

router.post(
  "/",
  validate({
    body: createUserBodySchema,
  }),
  createUserController.handle,
);

router.get("/me", ensureAuthenticated, getCurrentUserController.handle);

router.get(
  "/:userId",
  ensureAuthenticated,
  validate({
    params: userIdParamsSchema,
  }),
  getUserController.handle,
);

router.patch(
  "/:userId",
  ensureAuthenticated,
  validate({
    params: userIdParamsSchema,
    body: updateUserBodySchema,
  }),
  updateUserController.handle,
);

router.post(
  "/:userId/deactivate",
  ensureAuthenticated,
  ensureRole("ADMIN"),
  validate({
    params: userIdParamsSchema,
  }),
  deactivateUserController.handle,
);
```

Notice what is visible:

```text
endpoint
method
authentication
broad authorization
validation
Controller
```

Notice what is absent:

```text
Prisma
database queries
ownership checks
business rules
HTTP error translation
Service implementation
```

That separation is intentional.

---

## Overall convention

The route layer should make the HTTP application surface explicit.

```text
Route
│
├── HTTP method + path
│
├── Authentication
│
├── broad Authorization
│
├── Validation
│
└── Controller
      ↓
    Service
      ↓
    Repository
```

When resource-specific authorization is required:

```text
Route
  ↓
Authentication
  ↓
Validation
  ↓
Controller
  ↓
Service
  ↓
load resource
  ↓
resource-specific Authorization
  ↓
business behavior
  ↓
Repository
```

The Route composes boundaries.

It does not absorb them.

---

## Rules

When implementing Routes:

- use Routes as the HTTP composition boundary;
- map HTTP methods and paths to explicit application operations;
- keep business logic out of Routes;
- keep persistence and Prisma out of Routes;
- route requests through Controllers rather than directly into Services or Repositories;
- make public and protected endpoints intentional;
- compose Authentication explicitly for protected routes;
- use Route middleware for broad Authorization;
- leave resource-specific Authorization to Services or policies;
- attach structural Validation at the HTTP boundary;
- validate params, query, and body according to endpoint needs;
- do not query the database merely to validate route input;
- keep middleware responsibilities cohesive;
- treat middleware order as meaningful behavior;
- follow one project convention for middleware ordering;
- use clear resource-oriented paths;
- use explicit domain-action paths when the operation is not ordinary CRUD;
- use consistent path parameter names;
- group related endpoints into cohesive routers;
- keep route files easy to inspect as an API map;
- keep Controller construction and dependency composition intentional;
- do not instantiate Prisma repositories or Services inside handlers;
- follow the project convention for Controller method binding;
- let Controllers own successful HTTP responses;
- let the global error handler translate application errors;
- avoid generic Route abstractions that hide meaningful use-case differences;
- prefer explicit composition when it improves readability and auditability.
