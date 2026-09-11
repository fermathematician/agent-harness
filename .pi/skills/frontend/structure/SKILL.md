---
name: structure
description: Frontend structure conventions for pages, feature ownership, local components, hooks, state, and API access.
---

# Frontend Structure

## Purpose

Organize the frontend so the filesystem makes clear:

```text
page ownership
feature ownership
component responsibility
state location
data flow
API boundaries
```

Prefer the simplest structure that keeps these responsibilities obvious.

Avoid backend-style ceremony in the frontend.

## Default structure

Prefer pages or features as the main organizational boundary.

```text
src/
├── pages/
│   ├── users/
│   │   ├── index.tsx
│   │   ├── components/
│   │   └── hooks/
│   │
│   ├── orders/
│   │   ├── index.tsx
│   │   ├── components/
│   │   └── hooks/
│   │
│   └── dashboard/
│       ├── index.tsx
│       ├── components/
│       └── hooks/
│
├── components/
│   └── shared/
│
├── api/
└── shared/
```

This is a convention, not a mandatory filesystem.

Inspect the existing project first and preserve a coherent structure when possible.

## Page responsibility

A page is the composition boundary for a screen or route.

Example:

```text
pages/users/
├── index.tsx
├── components/
└── hooks/
```

The page may:

```text
compose local components
coordinate page-level state
invoke feature hooks
connect data to presentation
handle page-level loading/error states
```

Avoid placing all implementation details directly in `index.tsx`.

The page should primarily express how the screen is assembled.

## Local components

Keep components used by only one page or feature close to that owner.

```text
pages/users/
├── index.tsx
└── components/
    ├── UserList.tsx
    ├── UserCard.tsx
    └── UserFilters.tsx
```

Do not move a component to a global shared directory merely because it might be reused later.

Promote it only when reuse is real or the component is clearly application-wide.

## Local hooks

Feature-specific stateful behavior may live in local hooks.

```text
pages/users/
└── hooks/
    ├── useUsers.ts
    └── useUserFilters.ts
```

Hooks may coordinate:

```text
state
effects
API calls
derived values
event handlers
```

Keep hooks focused on reusable behavior rather than using them as arbitrary dumping grounds.

A hook used by only one feature should normally stay with that feature.

## State ownership

Keep state as close as practical to the components that need it.

Prefer:

```text
component-only state
→ component

shared within one page
→ page or local hook

shared across a feature
→ feature-level hook/state

truly application-wide
→ shared/global state mechanism
```

Do not place state globally simply to avoid passing props through a small number of components.

Do not introduce global state management without a concrete need.

## Data flow

Prefer explicit one-way data flow.

```text
Page
  ↓
Components
```

Data flows down through props.

Events flow upward through callbacks or actions.

Example:

```text
UsersPage
  ↓
UserList
  ↓
UserCard
```

Avoid components reaching into unrelated parts of the application to mutate state implicitly.

## Page data flow

A common feature flow is:

```text
Page
  ↓
feature hook / state
  ↓
API function
  ↓
Backend
```

Then:

```text
Backend response
  ↓
API function
  ↓
feature hook / state
  ↓
Page
  ↓
Components
```

Keep these boundaries visible.

## API access

Do not scatter raw HTTP calls throughout visual components.

Avoid:

```tsx
function UserCard() {
  async function handleDelete() {
    await fetch("/api/users/123", {
      method: "DELETE",
    });
  }

  // ...
}
```

Prefer API functions or feature hooks.

```text
Component
  ↓
callback
  ↓
Page / Hook
  ↓
API function
```

Example:

```ts
async function deleteUser(userId: string) {
  // HTTP implementation
}
```

Keep low-level HTTP details out of presentational components.

## API organization

Simple applications may use:

```text
api/
├── users.ts
├── orders.ts
└── sessions.ts
```

For larger applications, API code may stay with the owning feature.

```text
pages/
└── users/
    ├── api/
    │   └── users.ts
    ├── components/
    ├── hooks/
    └── index.tsx
```

Follow one coherent project convention.

Do not create both global and feature-local API layers without a clear ownership rule.

## API functions

Prefer functions representing backend operations.

```text
getUsers()
getUser(id)
createUser(input)
updateUser(id, input)
deleteUser(id)
```

Do not expose transport configuration throughout the component tree.

Keep concerns such as:

```text
base URL
headers
credentials
serialization
common error handling
```

inside the HTTP/API boundary where practical.

## Server state vs UI state

Keep server-derived data conceptually separate from local UI state.

Examples of server state:

```text
users
orders
invoice details
backend pagination
```

Examples of UI state:

```text
modal open
selected tab
expanded row
local filter input
```

Do not duplicate server state into unrelated local state unless transformation or editing requires it.

## Loading and errors

The layer coordinating a request should expose useful state to the page.

Conceptually:

```text
data
loading
error
```

The page decides how those states affect the screen.

Example:

```tsx
if (loading) {
  return <LoadingState />;
}

if (error) {
  return <ErrorState />;
}

return <UserList users={users} />;
```

Do not make unrelated child components independently reproduce the same request state.

## Feature ownership

Place behavior according to the feature that owns it.

Example:

```text
orders/
├── index.tsx
├── components/
│   ├── OrderList.tsx
│   └── CancelOrderButton.tsx
└── hooks/
    └── useOrders.ts
```

A `CancelOrderButton` belongs to `orders` unless it has a genuine cross-feature purpose.

Avoid vague global directories such as:

```text
misc/
helpers/
stuff/
common/
```

when ownership can be explicit.

## Shared components

Application-wide reusable visual components may live under:

```text
components/
└── shared/
    ├── Button.tsx
    ├── Modal.tsx
    ├── Spinner.tsx
    └── EmptyState.tsx
```

Shared components should generally be:

```text
generic
reusable
feature-independent
```

Feature-specific components stay with their feature.

Avoid putting domain-specific behavior into generic shared components.

## Shared utilities

Cross-cutting technical helpers may live in a shared area when they genuinely have no feature owner.

Possible examples:

```text
date formatting
generic parsing
configuration
generic types
```

Do not move code to `shared` merely because two files currently use it.

Prefer clear ownership over premature reuse.

## Cross-feature boundaries

Do not casually import internal components or hooks from another feature.

Avoid:

```text
orders/
  ↓
users/components/UserInternalEditor.tsx
```

If functionality is genuinely shared:

```text
extract a clear shared component
```

or expose an intentional feature boundary.

Do not couple features through each other's internal implementation details.

## Route and page naming

Prefer names reflecting the visible feature or screen.

```text
users/
orders/
dashboard/
settings/
```

Inside each page, use explicit component names.

```text
UserList
UserCard
UserFilters
```

Avoid vague names:

```text
MainComponent
PageContent
Component1
GeneralView
```

when a specific name exists.

## Growing a feature

Start simple.

```text
users/
├── index.tsx
└── components/
```

Add directories only when needed.

```text
users/
├── index.tsx
├── components/
├── hooks/
└── api/
```

Do not create empty architectural folders in anticipation of future complexity.

If a page becomes too large, extract cohesive UI or behavior rather than immediately introducing a new architectural layer.

## Keep frontend architecture light

Do not mechanically reproduce backend layers such as:

```text
Controller
Service
Repository
```

inside the frontend.

Frontend organization should optimize for:

```text
screen composition
feature ownership
state clarity
component reuse
data flow
```

not architectural symmetry with the backend.

## Styling

Keep component styling outside `.tsx` files.

Prefer CSS Modules colocated with the component.

```text
UserCard.tsx
UserCard.module.css
```

A styled component should normally own its styles.

Example:

```text
pages/
└── users/
    ├── index.tsx
    ├── index.module.css
    └── components/
        ├── UserList.tsx
        ├── UserList.module.css
        ├── UserCard.tsx
        └── UserCard.module.css
```

Use page CSS for page-level composition:

```text
layout
grid
page spacing
major sections
```

Use component CSS for:

```text
component appearance
internal layout
states
responsive behavior owned by that component
```

Keep application-wide CSS limited to genuinely global concerns.

```text
styles/
└── global.css
```

Global CSS may contain:

```text
reset
base typography
CSS variables
design tokens
body/root defaults
```

Do not place page-specific or component-specific styles in global CSS.

Avoid inline styling for normal presentation:

```tsx
<div
  style={{
    display: "flex",
    padding: "16px",
  }}
/>
```

Prefer:

```tsx
<div className={styles.container} />
```

with:

```text
Component.module.css
```

Do not create empty CSS files for components that require no custom styling.

Keep styles close to the component that owns them.

## Rules

- Prefer page/feature-oriented organization.
- Keep page entry files focused on screen composition.
- Keep feature-specific components near their owning page or feature.
- Keep local hooks near the feature that owns them.
- Keep state as local as practical.
- Introduce global state only for genuinely cross-application needs.
- Keep data flow explicit and primarily one-way.
- Keep raw HTTP calls out of visual components.
- Use API functions or hooks as the backend access boundary.
- Keep transport details out of the component tree.
- Separate server-derived state conceptually from UI state.
- Let the request-owning layer expose loading and error state.
- Promote components to shared only when reuse is real.
- Keep feature internals private to that feature where practical.
- Avoid vague dumping-ground directories.
- Avoid unnecessary nesting and empty architectural folders.
- Do not reproduce backend layers mechanically in the frontend.
- Keep normal presentation CSS out of `.tsx` files.
- Prefer colocated CSS Modules for component styles.
- Use page CSS only for page-level layout and composition.
- Keep global CSS limited to application-wide styles and tokens.
- Do not create empty CSS files when a component has no custom styles.
- Inspect and preserve coherent existing project conventions.
- Prefer the simplest structure that keeps ownership and data flow obvious.
