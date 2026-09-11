---
name: forms
description: Frontend form conventions for state, validation, submission, loading, errors, field ownership, and backend integration.
---

# Forms

## Purpose

Forms should make clear:

```text
field state
validation
submission
loading
errors
backend interaction
```

Keep form behavior explicit and local to the feature that owns it.

Do not mix large amounts of form state, API code, validation, and presentation into one uncontrolled component.

## Responsibility

A form should coordinate:

```text
field values
structural validation
submit behavior
submission state
user-facing errors
```

The backend remains authoritative for:

```text
business rules
authorization
resource existence
concurrency-sensitive constraints
```

Frontend validation improves UX.

It does not replace backend validation.

## Structure

A common form flow is:

```text
Form Component
  ↓
field state
  ↓
validation
  ↓
submit
  ↓
API / feature hook
  ↓
Backend
```

Then:

```text
Backend result
  ↓
success or error
  ↓
Form
  ↓
user feedback
```

## Feature ownership

Keep forms near the feature that owns them.

Example:

```text
pages/
└── users/
    ├── index.tsx
    ├── components/
    │   └── UserForm/
    │       ├── UserForm.tsx
    │       └── UserForm.module.css
    └── validation/
        └── user-form.schema.ts
```

For smaller features:

```text
users/
├── UserForm.tsx
├── UserForm.module.css
└── user-form.schema.ts
```

Follow the project structure consistently.

## Form state

Keep form state inside the form or a form-specific hook unless a parent genuinely needs to own it.

Examples:

```text
name
email
password
selected option
checkbox state
```

Avoid lifting every field into page state without a reason.

The page should normally receive the meaningful result:

```text
onSubmit(data)
```

instead of controlling every keystroke.

## Initial values

Make initial values explicit.

Create form:

```text
empty/default values
```

Edit form:

```text
existing resource values
```

Example:

```ts
interface UserFormValues {
  name: string;
  email: string;
}
```

Do not mix backend response objects directly with mutable form state when their shapes or responsibilities differ.

Map data when necessary.

## Validation

Use structural frontend validation for things such as:

```text
required fields
string format
email format
minimum/maximum length
number bounds
enum values
field relationships visible in the form
```

Examples:

```text
email must be valid
password must contain at least N characters
confirmation must match password
```

Do not use frontend validation as the only enforcement of:

```text
email uniqueness
resource ownership
authorization
database state
business workflow rules
```

Those belong to the backend.

## Validation schemas

Prefer explicit form or use-case schemas.

```text
createUserSchema
updateUserSchema
loginSchema
```

Avoid one giant entity schema reused for unrelated forms.

Create and update forms may have different requirements.

Example:

```text
CreateUser
→ password required

UpdateUser
→ password absent or optional
```

Validation should reflect the actual operation.

## Field errors

Associate validation errors with the field that caused them.

Example:

```text
email
→ Invalid email

password
→ Minimum 8 characters
```

Render field errors close to their inputs.

Do not display every validation problem only as a generic page-level error.

## Form-level errors

Use form-level errors for failures that are not naturally owned by one field.

Examples:

```text
Invalid credentials
Request failed
Unable to save changes
Operation not permitted
```

Keep field errors and form-level errors conceptually separate.

## Backend errors

Backend responses may represent:

```text
validation failure
conflict
authentication failure
authorization failure
resource not found
unexpected failure
```

Map them into meaningful UI states according to the project API convention.

Do not expose raw infrastructure details such as:

```text
Axios response objects
stack traces
database errors
internal exception messages
```

Show user-facing messages.

## Submission

Keep submission explicit.

Conceptually:

```text
validate
  ↓
set submitting
  ↓
call API
  ↓
handle success/error
  ↓
clear submitting
```

Avoid multiple submission paths for the same form.

Use the form's submit event for its primary action.

Example:

```tsx
<form onSubmit={handleSubmit}>...</form>
```

Prefer this over relying only on button click handlers.

## Prevent duplicate submission

Disable or otherwise guard submission while the request is active when duplicate requests would be harmful.

Conceptually:

```text
idle
→ submitting
→ success/error
```

Example:

```tsx
<button type="submit" disabled={isSubmitting}>
  Save
</button>
```

Do not allow accidental repeated writes merely because the UI stayed interactive.

Backend idempotency or constraints remain authoritative where required.

## Loading state

Expose submission state clearly.

Examples:

```text
Save
→ Saving...

Create account
→ Creating...

Login
→ Signing in...
```

Keep the user aware that the operation is in progress.

Avoid replacing the entire page with a loading state for a small form submission unless appropriate.

## Success

Define what happens after successful submission.

Examples:

```text
close modal
reset form
navigate
refresh data
show confirmation
update local feature state
```

Keep this behavior with the layer that owns the surrounding interaction.

The form may notify its parent:

```tsx
<UserForm onSuccess={handleUserCreated} />
```

Do not hardcode unrelated page navigation inside a reusable form without a clear reason.

## Reset behavior

Reset only when the UX requires it.

Typical create form:

```text
successful creation
→ maybe reset
```

Typical edit form:

```text
successful update
→ usually keep saved values
```

Do not automatically clear user input after failures.

Preserve entered values whenever practical.

## Create vs Edit forms

Reuse a form when create and edit genuinely share fields and behavior.

Example:

```tsx
<UserForm initialValues={user} onSubmit={handleUpdate} />
```

But do not force both operations into one highly conditional component if their behavior diverges significantly.

Avoid:

```text
isCreate
isEdit
isAdmin
isSpecialMode
showPassword
allowDelete
...
```

when separate forms would be clearer.

## Controlled inputs

Use a consistent project strategy for input state.

For simple forms, controlled inputs are fine:

```tsx
<input value={name} onChange={(event) => setName(event.target.value)} />
```

If the project uses a form library, follow its established conventions.

Do not mix several form-state strategies within the same feature without a reason.

## Form libraries

Do not introduce a form library automatically.

Use the project's existing choice.

A library may be useful when forms have:

```text
many fields
nested fields
complex validation
dynamic arrays
significant error handling
```

For small forms, simple React state may be sufficient.

Choose complexity according to the problem.

## Input components

Generic inputs may be shared when their behavior is genuinely reusable.

Examples:

```text
TextInput
Select
Checkbox
Textarea
```

A shared input may own:

```text
label rendering
error rendering
accessibility attributes
basic visual structure
```

It should not know feature-specific business rules.

Example:

```tsx
<TextInput
  label="Email"
  value={email}
  error={errors.email}
  onChange={handleEmailChange}
/>
```

## Labels

Every user-editable field should have a clear accessible label.

Prefer:

```tsx
<label htmlFor="email">
  Email
</label>

<input
  id="email"
  name="email"
/>
```

Placeholder text is not a substitute for a label.

## Field names

Use explicit stable field names.

Prefer:

```text
email
password
firstName
companyId
```

Avoid meaningless names:

```text
field1
valueA
inputData
```

Keep names aligned with the form contract when practical.

## Native semantics

Use native HTML form behavior where possible.

Prefer:

```text
form
label
input
select
textarea
button type="submit"
```

Use correct input types:

```text
email
password
number
date
```

Native semantics improve accessibility and browser behavior.

Do not recreate basic form controls with generic elements without need.

## Accessibility

Associate errors with fields when practical.

Use appropriate attributes such as:

```text
aria-invalid
aria-describedby
```

when needed.

Do not rely only on color to indicate validation failure.

Ensure keyboard interaction remains intact.

## Styling

Keep form styling in colocated CSS Modules.

```text
UserForm.tsx
UserForm.module.css
```

Use component CSS for:

```text
field spacing
labels
inputs
error messages
buttons
form layout
responsive behavior
```

Keep normal presentation out of `.tsx`.

Avoid large inline style objects.

Do not place feature-specific form styling in global CSS.

## Password fields

Never log or expose password values.

Use appropriate password inputs.

```tsx
<input type="password" />
```

Do not preserve plaintext credentials in unrelated application state.

Do not store passwords in browser persistence unless explicitly required by a secure established design.

## Sensitive values

Treat fields containing secrets or sensitive tokens carefully.

Do not:

```text
log them
render them unnecessarily
place them in URLs
persist them casually
```

Follow the project's authentication and security conventions.

## API boundary

Forms should not contain low-level transport configuration.

Avoid embedding:

```text
base URLs
authorization headers
serialization rules
HTTP client configuration
```

inside field components.

Prefer:

```text
Form
  ↓
submit callback / feature hook
  ↓
API function
```

Keep transport concerns at the API boundary defined by the frontend structure.

## Error lifecycle

Clear or update errors deliberately.

Examples:

```text
new submit
→ clear stale form-level error

field corrected
→ optionally clear that field's validation error

backend failure
→ preserve entered values
```

Do not leave obsolete errors visible after the relevant state has changed.

## Dirty state

Track whether a form changed only when the UX needs it.

Useful cases:

```text
disable Save until changed
warn before leaving
enable Reset
```

Do not add dirty-state machinery to every form automatically.

## Confirmation

Require confirmation for destructive or high-impact form actions when appropriate.

Examples:

```text
delete account
cancel order
remove payment method
```

Do not add confirmation dialogs to ordinary safe submissions without reason.

## Avoid oversized forms

If a form becomes very large, split it into meaningful sections.

Example:

```text
UserForm
  ├── PersonalInformationFields
  ├── AddressFields
  └── PreferencesFields
```

The parent form should still own submission unless sections represent truly independent forms.

Do not create nested `<form>` elements for visual grouping.

## Existing project first

Before implementing a form, inspect:

```text
form library
validation library
schema conventions
input components
API error shape
loading conventions
CSS strategy
accessibility conventions
```

Preserve coherent existing patterns when compatible with these rules.

Do not introduce new form infrastructure merely because another approach is familiar.

## Rules

- Keep form responsibility explicit.
- Keep form state near the form that owns it.
- Use structural frontend validation for UX.
- Keep backend validation authoritative.
- Keep authorization and business rules authoritative on the backend.
- Prefer operation-specific validation schemas.
- Keep field errors close to their fields.
- Use form-level errors for non-field failures.
- Map backend failures to user-facing messages.
- Do not expose raw infrastructure errors.
- Use the native form submit flow for the primary action.
- Guard against harmful duplicate submissions.
- Expose submission state clearly.
- Preserve user input after failed submissions.
- Define successful submission behavior explicitly.
- Reuse create/edit forms only when their responsibilities remain coherent.
- Use one consistent form-state strategy per feature.
- Do not introduce form libraries without a concrete need.
- Keep shared input components generic.
- Use labels and semantic HTML controls.
- Keep normal form styling in colocated CSS Modules.
- Keep low-level HTTP configuration out of forms.
- Never log or unnecessarily persist passwords, tokens, or secrets.
- Add dirty-state and confirmation behavior only when the UX requires it.
- Split oversized forms by meaningful UI sections.
- Inspect and preserve coherent existing project conventions.
