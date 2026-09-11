# Routes

## Purpose

Routes define the HTTP entry points of the application.

They compose:

```text
HTTP method + path
  ↓
middleware
  ↓
Controller
```

Routes should make visible:

```text
endpoint
authentication
broad authorization
validation
Controller
```

Routes compose behavior.

They do not implement business logic.

## Do not put business logic in Routes

Avoid Routes that:

```text
query Prisma
load resources
decide ownership
apply business rules
build application behavior
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
  ↓
Prisma
```

Never access Prisma directly from Routes.

Do not query the database in a Route to decide resource existence or application state.

## Route and Controller

The Route chooses the Controller.

The Controller translates HTTP into a use case.

```text
Route
→ Which Controller handles this endpoint?

Controller
→ How does this HTTP request invoke the use case?
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

The Route does not need to know how `CreateUserService` works.

## One endpoint, one application action

Prefer explicit mappings:

```text
POST /users
→ CreateUser

GET /users/:userId
→ GetUser

GET /users
→ ListUsers

PATCH /users/:userId
→ UpdateUser

DELETE /users/:userId
→ DeleteUser
```

Domain actions should also be explicit:

```text
POST /orders/:orderId/cancel
→ CancelOrder

POST /invoices/:invoiceId/approve
→ ApproveInvoice
```

Do not force meaningful domain operations into generic CRUD semantics.

## HTTP methods

Use methods according to endpoint semantics.

```text
GET
→ retrieve

POST
→ create or trigger action

PUT
→ replace

PATCH
→ partially modify

DELETE
→ remove
```

Choose the method that communicates the operation.

## Paths

Prefer resource-oriented paths:

```text
/users
/orders
/invoices
```

Use explicit identifiers:

```text
/users/:userId
/orders/:orderId
```

For non-CRUD actions:

```text
/orders/:orderId/cancel
/invoices/:invoiceId/approve
/users/:userId/deactivate
```

Avoid vague paths:

```text
/doUpdate
/processUser
/executeAction
```

## Route parameters

Path parameters identify target resources.

Example:

```text
GET /users/:userId
```

Responsibilities:

```text
Route
→ declares userId

Validation
→ is userId structurally valid?

Service
→ does User exist?
```

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

Do not query the database in the Route to validate resource existence.

## Authentication

Protected routes should make Authentication explicit.

```ts
router.get("/users/me", ensureAuthenticated, getCurrentUserController.handle);
```

Public routes omit it intentionally:

```ts
router.post(
  "/sessions",
  validate({
    body: createSessionBodySchema,
  }),
  createSessionController.handle,
);
```

It should be easy to tell whether an endpoint is public or protected.

Do not hide authentication checks inside Controllers.

## Authorization

Use Route middleware for broad authorization available before the use case.

Examples:

```text
authenticated?
ADMIN?
has reports:read?
```

Example:

```ts
router.get(
  "/admin/users",
  ensureAuthenticated,
  ensureRole("ADMIN"),
  listUsersController.handle,
);
```

Resource-specific authorization belongs in the Service.

Example:

```text
May this actor update User 123?
```

If the decision depends on:

```text
ownership
tenant
resource state
resource loading
```

keep it in the Service.

Do not reproduce application authorization in generic Route middleware.

## Validation

Make structural validation explicit in Route composition.

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

Possible inputs:

```text
params
query
body
headers
```

Prefer schemas matching the endpoint/use case:

```text
CreateUser
→ createUserBodySchema

UpdateUser
→ updateUserBodySchema

ListUsers
→ listUsersQuerySchema
```

Do not reuse one giant entity schema for every endpoint.

## Router grouping

Group cohesive endpoint families.

```text
routes/
├── users.routes.ts
├── sessions.routes.ts
├── orders.routes.ts
└── invoices.routes.ts
```

Do not place the entire API in one giant route file.

Routes may instead live with feature modules:

```text
modules/
└── users/
    ├── controllers/
    ├── services/
    ├── repositories/
    ├── validation/
    └── routes/
```

Follow the project convention.

## Route registration

Register routers consistently.

Example:

```ts
app.use("/users", usersRouter);
```

Then:

```ts
router.get("/:userId", getUserController.handle);
```

produces:

```text
GET /users/:userId
```

Choose one convention for path composition.

Do not mix full and relative route paths without a clear rule.

## Controller method binding

Be careful when passing class methods directly to Express.

```ts
router.post("/users", createUserController.handle);
```

This is safe only if `handle` preserves `this`.

One convention:

```ts
class CreateUserController {
  handle = async (request: Request, response: Response) => {
    // this is preserved
  };
}
```

Another:

```ts
router.post("/users", createUserController.handle.bind(createUserController));
```

Follow one convention consistently.

## Naming

Prefer specific route files:

```text
users.routes.ts
orders.routes.ts
sessions.routes.ts
```

Avoid vague names:

```text
general.routes.ts
misc.routes.ts
handlers.ts
```

Prefer specific parameter names:

```text
/users/:userId
/orders/:orderId
/companies/:companyId
```

This matters especially in nested paths:

```text
/companies/:companyId/users/:userId
```

## Nested routes

Use nesting when the parent resource is meaningful.

Example:

```text
GET /companies/:companyId/users
```

Avoid unnecessarily deep nesting.

Keep endpoint contracts easy to understand.

## Current actor routes

Use `/me` when the operation specifically targets the authenticated actor.

```text
GET /users/me
PATCH /users/me
```

Authentication provides:

```text
request.auth.userId
```

The client does not need to submit its own identifier.

Use `/me` or explicit IDs according to which contract better represents the use case.

## AppError

Routes normally do not translate `AppError`.

Use centralized error handling.

```text
Service
→ throws AppError

Controller
→ propagates

global error handler
→ HTTP response
```

Do not wrap every Route in local `try/catch` for application errors.

## Example

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

Visible:

```text
method
path
authentication
broad authorization
validation
Controller
```

Absent intentionally:

```text
Prisma
database queries
ownership checks
business rules
Service implementation
error translation
```

## Rules

- Routes are HTTP composition boundaries.
- Keep business logic and Prisma out of Routes.
- Route requests through Controllers.
- Map endpoints to explicit application actions.
- Use HTTP methods according to semantics.
- Use clear resource-oriented paths.
- Use explicit action paths for non-CRUD operations.
- Make public and protected routes explicit.
- Use Route middleware for broad authorization.
- Keep resource-specific authorization in Services.
- Attach structural Validation at the Route boundary.
- Keep resource existence checks in Services.
- Group cohesive endpoints into routers.
- Follow one path registration convention.
- Use consistent route and parameter naming.
- Follow one Controller binding convention.
- Keep AppError translation centralized.
