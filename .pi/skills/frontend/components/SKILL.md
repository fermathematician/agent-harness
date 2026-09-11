---
name: components
description: Frontend component conventions for responsibility, composition, props, state, events, reuse, rendering, and component boundaries.
---

# Components

## Purpose

Components should represent cohesive pieces of UI.

A component should make clear:

```text
what it renders
what data it receives
what events it emits
what state it owns
```

Prefer small, explicit components over large components containing an entire page.

## Responsibility

A component should have one clear UI responsibility.

Good:

```text
UserCard
UserList
UserFilters
OrderSummary
Pagination
DeleteUserModal
```

Avoid vague components:

```text
UserStuff
GeneralComponent
PageContent
MainSection
Component1
```

Split a component when it contains multiple independently meaningful UI responsibilities.

Do not split components mechanically just to reduce line count.

## Page vs Component

Pages compose the screen.

Components implement pieces of the screen.

```text
UsersPage
  ├── UserFilters
  ├── UserList
  │   └── UserCard
  └── Pagination
```

Prefer:

```tsx
function UsersPage() {
  return (
    <main>
      <UserFilters />
      <UserList />
      <Pagination />
    </main>
  );
}
```

over placing the implementation of every section directly in the page.

## Props

Use explicit typed props.

```tsx
interface UserCardProps {
  name: string;
  email: string;
  active: boolean;
}

function UserCard({ name, email, active }: UserCardProps) {
  // ...
}
```

Props should expose what the component needs, not arbitrary parent state.

Avoid generic dependency bags:

```tsx
<UserCard data={everything} />
```

when a small explicit contract is practical.

Do not pass objects merely to avoid defining meaningful props.

Passing a cohesive domain object is acceptable when the component genuinely consumes that object.

## Data down, events up

Prefer explicit one-way communication.

```text
Parent
  ↓
props
  ↓
Child

Child
  ↓
callback
  ↓
Parent
```

Example:

```tsx
interface UserCardProps {
  user: User;
  onEdit: (userId: string) => void;
}

function UserCard({ user, onEdit }: UserCardProps) {
  return <button onClick={() => onEdit(user.id)}>Edit</button>;
}
```

Children should communicate intent through callbacks rather than reaching into parent state.

## Event callbacks

Name event props according to intent.

Prefer:

```text
onEdit
onDelete
onSelect
onSubmit
onClose
```

For internal handlers, prefer:

```text
handleEdit
handleDelete
handleSubmit
```

Example:

```tsx
<UserCard user={user} onDelete={handleDeleteUser} />
```

Keep application behavior in the appropriate owner rather than hiding it inside deeply nested visual components.

## State ownership

Keep state as close as practical to where it is used.

Component-local UI state belongs in the component.

Examples:

```text
modal open/closed
dropdown expanded
selected tab
temporary UI toggle
```

Example:

```tsx
const [isOpen, setIsOpen] = useState(false);
```

If multiple sibling components need the same state, lift it to their nearest meaningful common owner.

Do not immediately introduce global state.

## Derived state

Prefer deriving values from existing state and props instead of storing duplicates.

Avoid:

```tsx
const [users, setUsers] = useState(...);
const [activeUsers, setActiveUsers] =
  useState(...);
```

when:

```tsx
const activeUsers = users.filter((user) => user.active);
```

is sufficient.

Do not synchronize duplicate state unnecessarily.

## Effects

Use effects for synchronization with external systems or lifecycle-dependent side effects.

Do not use `useEffect` merely to calculate values that can be derived during rendering.

Avoid:

```tsx
useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);
```

Prefer:

```tsx
const fullName = `${firstName} ${lastName}`;
```

Keep effects focused and dependencies explicit.

Do not hide unrelated operations inside one large effect.

## Hooks

Extract a custom hook when stateful behavior is cohesive and benefits from separation or reuse.

```text
useUsers
usePagination
useUserFilters
```

A hook may coordinate:

```text
state
effects
derived state
API interaction
event behavior
```

Do not extract every few lines of component logic into a hook.

Hooks should represent meaningful behavior.

Feature-specific hooks stay with their feature.

## Presentational components

Components focused on rendering should preferably receive data and callbacks through props.

```tsx
<UserList users={users} onSelect={handleSelectUser} />
```

They should not independently fetch the same feature data when the page or feature hook already owns it.

Keep low-level HTTP calls out of visual components.

## Composition

Prefer component composition over large configurable components.

Good:

```tsx
<Card>
  <UserHeader />
  <UserDetails />
  <UserActions />
</Card>
```

Be cautious with components controlled by many unrelated boolean props:

```tsx
<UserCard
  compact
  admin
  editable
  deletable
  showEmail
  showAvatar
  useAlternativeHeader
/>
```

Many unrelated modes often indicate multiple responsibilities.

Split or compose when that produces clearer contracts.

## Conditional rendering

Keep simple conditions close to the rendered UI.

```tsx
{
  user.active && <ActiveBadge />;
}
```

For larger branches, extract meaningful components or calculate the branch before the main return.

Avoid deeply nested JSX conditionals that obscure the component structure.

## Lists

Use stable identifiers as keys.

Prefer:

```tsx
users.map((user) => <UserCard key={user.id} user={user} />);
```

Avoid array indexes when items have stable identity and may be reordered, inserted, or removed.

## Reuse

Keep a component local while it belongs to one feature.

```text
pages/
└── users/
    └── components/
        └── UserCard.tsx
```

Promote it to shared only when it becomes genuinely feature-independent and reusable.

```text
components/
└── shared/
    ├── Button.tsx
    ├── Modal.tsx
    └── Spinner.tsx
```

Do not create abstractions for hypothetical future reuse.

Prefer a little duplication over a premature abstraction with an unclear contract.

## Shared components

Shared components should normally represent generic UI primitives or broadly reusable presentation.

Examples:

```text
Button
Modal
Spinner
EmptyState
Pagination
```

They should not know unnecessary domain details.

Avoid:

```text
SharedUserOrderInvoiceActionButton
```

A component containing feature-specific rules probably belongs to that feature.

## Business rules

Frontend components may control presentation behavior.

They must not become the authoritative implementation of backend business rules.

Example:

```text
disable Approve button when status is not pending
→ useful UI behavior
```

But the backend must still enforce:

```text
only pending invoices may be approved
```

Never treat hidden or disabled frontend controls as authorization.

## Loading states

Represent asynchronous states explicitly.

A component or page may render:

```text
loading
error
empty
success
```

Example:

```tsx
if (loading) {
  return <Spinner />;
}

if (error) {
  return <ErrorState />;
}

if (users.length === 0) {
  return <EmptyState />;
}

return <UserList users={users} />;
```

Keep ownership of request state coherent.

Do not duplicate the same loading/error logic throughout unrelated descendants.

## Error presentation

Components may display user-facing errors supplied by the page, form, hook, or API boundary.

Keep infrastructure error details out of the UI.

Prefer meaningful application messages over raw:

```text
stack traces
HTTP client objects
database errors
internal server details
```

## Accessibility

Use semantic HTML before recreating native behavior manually.

Prefer:

```text
button
input
label
form
nav
main
section
```

according to their semantics.

Use a real `<button>` for actions instead of a clickable `<div>`.

Associate form controls with labels.

Interactive components must remain keyboard-usable where applicable.

Add ARIA attributes when native semantics are insufficient, not as a substitute for semantic HTML.

## Styling

Component presentation belongs in its colocated CSS Module.

```text
UserCard.tsx
UserCard.module.css
```

Import styles explicitly:

```tsx
import styles from "./UserCard.module.css";
```

Then:

```tsx
<div className={styles.card}>...</div>
```

Keep normal presentation out of `.tsx`.

Avoid:

```tsx
<div
  style={{
    display: "flex",
    gap: "12px",
    padding: "16px",
  }}
>
```

Do not move component-specific CSS into global styles.

A component without custom styling does not need an empty CSS file.

## Component files

Prefer one primary component per file.

```text
UserCard.tsx
UserList.tsx
UserFilters.tsx
```

Small tightly coupled helpers may remain in the same file when extracting them would reduce clarity.

Do not create a new file for every trivial JSX fragment.

When a component becomes independently meaningful, give it its own file.

## Component boundaries

Before creating or splitting a component, ask:

```text
Does it have a clear UI responsibility?

Does it have a meaningful name?

Does it own cohesive state or behavior?

Is it independently reusable or understandable?

Does extraction make the parent easier to understand?
```

If not, keep the implementation together.

## Existing project first

Before changing component organization, inspect:

```text
page structure
component conventions
state patterns
hook conventions
CSS strategy
shared components
naming
routing
```

Preserve coherent existing conventions when compatible with these rules.

Do not reorganize unrelated frontend code merely to impose this structure.

## Rules

- Give each component a clear UI responsibility.
- Prefer explicit component names.
- Keep pages focused on screen composition.
- Keep props explicit and typed.
- Pass data down and events up.
- Keep state near the components that need it.
- Lift state only when multiple components genuinely share it.
- Prefer derived values over duplicated state.
- Use effects for synchronization and side effects, not ordinary derivation.
- Extract hooks for cohesive stateful behavior, not mechanically.
- Keep raw HTTP calls out of visual components.
- Prefer composition over components with many unrelated modes.
- Use stable identifiers as list keys.
- Keep feature components local until reuse is real.
- Keep shared components feature-independent where practical.
- Do not enforce security or authoritative business rules only in the frontend.
- Represent loading, error, empty, and success states intentionally.
- Prefer semantic HTML and accessible native elements.
- Keep component styles in colocated CSS Modules.
- Keep normal presentation CSS out of `.tsx`.
- Prefer one primary component per file.
- Split components when doing so creates a meaningful boundary, not merely fewer lines.
- Inspect and preserve coherent existing project conventions.
