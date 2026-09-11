# Backend Architecture

## Purpose

Use this file only as the architecture map.

Detailed rules live in:

```text
routes.md
dependency-injection.md
module-structure.md
crud/
validation/
auth/
```

## Request flow

```text
Client
  ↓
Route
  ↓
Authentication
  ↓
Broad Authorization
  ↓
Validation
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

Not every endpoint requires every step.

## Responsibility map

```text
Route
→ HTTP method, path, middleware, Controller selection

Authentication
→ establish trusted actor identity

Authorization middleware
→ broad/static access rules

Validation
→ structural correctness of params/body/query

Controller
→ translate HTTP request into Service input
→ translate Service output into HTTP response

Service
→ business rules
→ application orchestration
→ resource-specific authorization
→ expected application failures

Repository
→ persistence contract used by Services

Repository implementation
→ Prisma-specific persistence

Composition
→ construct concrete dependencies
```

## Dependency direction

Runtime:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository
  ↓
Infrastructure
```

Construction:

```text
Infrastructure
  ↓
Repository implementation
  ↓
Service
  ↓
Controller
  ↓
Route
```

Do not reverse these boundaries.

## Actor vs target

For protected resource operations, distinguish:

```text
actor
→ authenticated user

target
→ resource or user being affected
```

Example:

```text
request.auth.userId
→ actorId

request.params.userId
→ targetId
```

Resource-specific authorization belongs in the Service.

## Where does this code belong?

```text
HTTP endpoint composition?
→ Route

Who is calling?
→ Authentication

Broad access restriction?
→ Authorization middleware

Input shape/format?
→ Validation

HTTP ↔ application translation?
→ Controller

Business rule?
→ Service

Resource ownership/tenant/state permission?
→ Service

Persistence operation?
→ Repository

Prisma-specific code?
→ Repository implementation

Concrete dependency construction?
→ Composition

Shared technical capability?
→ Infrastructure/shared boundary
```

## Forbidden shortcuts

Avoid:

```text
Route → Prisma
Controller → Prisma
Service → PrismaClient
Repository → Express Request
Service → Express Response
Validation → database query
Controller → resource-specific authorization
Composition → business logic
```

## Rules

- Keep responsibilities in their owning layer.
- Keep Services independent from HTTP and Prisma.
- Keep Prisma behind Repository implementations.
- Keep resource-specific authorization in Services.
- Keep structural validation before the Controller.
- Keep dependency construction in composition code.
- Preserve explicit dependency direction.
- Follow existing project conventions when compatible.
