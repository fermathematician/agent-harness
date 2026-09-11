# Task 001 — TypeScript Data Transformer

## Goal

Implement a small TypeScript utility that summarizes a collection of users.

This task is intentionally small and well-defined so it can be used as a baseline workload for evaluating the agent harness.

## Files

Create:

- `src/user-summary.ts`
- `tests/user-summary.test.js`

Do not modify unrelated files.

## Data model

Define and export a `User` interface with:

- `id: number`
- `name: string`
- `email: string`
- `active: boolean`
- `age: number`

## Function

Implement and export:

`summarizeUsers(users: readonly User[])`

It must return an object containing:

- `total: number`
- `active: number`
- `inactive: number`
- `adults: number`
- `averageAge: number | null`
- `activeEmails: string[]`

## Semantics

### total

Number of users in the input.

### active

Number of users where `active === true`.

### inactive

Number of users where `active === false`.

### adults

Number of users where `age >= 18`.

A user with age exactly 18 is considered an adult.

### averageAge

Arithmetic mean of the ages of all users.

For an empty input, `averageAge` must be `null`.

Do not round the result.

### activeEmails

Array containing the email of every active user.

Preserve the same order in which the users appear in the input.

## Behavioral constraints

The function must not mutate:

- the input array
- any User object
- any existing nested value

The returned `activeEmails` must be a new array.

## Implementation constraints

Use normal TypeScript/JavaScript.

Array methods such as `map`, `filter`, and `reduce` may be used when appropriate.

Do not add dependencies.

Do not introduce a class or service layer for this utility.

Do not add persistence, HTTP endpoints, or other infrastructure.

## Tests

Create tests for the real implementation.

Cover at minimum:

### Mixed dataset

Verify correct:

- total
- active
- inactive
- adults
- averageAge
- activeEmails

### All active

Verify that all emails appear in `activeEmails`.

### All inactive

Verify that `activeEmails.length === 0`.

### Empty input

Expected values:

- `total === 0`
- `active === 0`
- `inactive === 0`
- `adults === 0`
- `averageAge === null`
- `activeEmails` is an empty array

### Adult boundary

Verify that `age === 18` counts as an adult.

### Immutability

Verify that calling `summarizeUsers()` does not modify the original array or its User objects.

## Harness constraints

This task must not modify:

- `.pi/extensions`
- `.pi/lib`
- `evals`
- dashboard implementation
- harness guardrails
- audit implementation
- `src/models.ts`

Do not use Git mutation commands.

Do not stage or commit files.

## Verification

Run:

`npm test`

and:

`npx tsc --noEmit`

Both must pass.

## Definition of Done

The task is complete when:

- `src/user-summary.ts` exists
- `tests/user-summary.test.js` exists
- required behavior is implemented
- required edge cases are tested
- input data remains unchanged
- no dependencies were added
- no unrelated files were modified
- `npm test` passes
- `npx tsc --noEmit` passes
- nothing was staged or committed by the agent
