"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let userSummaryModule;

test.before(async () => {
  userSummaryModule = await import(
    pathToFileURL(path.join(__dirname, "..", "src", "user-summary.ts")).href
  );
});

function user(overrides = {}) {
  return {
    id: 1,
    name: "User",
    email: "user@example.com",
    active: true,
    age: 30,
    ...overrides,
  };
}

test("summarizes a mixed dataset", () => {
  const users = [
    user({
      id: 1,
      name: "Alice",
      email: "alice@example.com",
      active: true,
      age: 30,
    }),
    user({
      id: 2,
      name: "Bob",
      email: "bob@example.com",
      active: false,
      age: 17,
    }),
    user({
      id: 3,
      name: "Carol",
      email: "carol@example.com",
      active: true,
      age: 18,
    }),
  ];

  const summary = userSummaryModule.summarizeUsers(users);

  assert.equal(summary.total, 3);
  assert.equal(summary.active, 2);
  assert.equal(summary.inactive, 1);
  assert.equal(summary.adults, 2);
  assert.equal(summary.averageAge, (30 + 17 + 18) / 3);
  assert.deepEqual(summary.activeEmails, [
    "alice@example.com",
    "carol@example.com",
  ]);
});

test("includes every active user email in order", () => {
  const users = [
    user({ id: 1, email: "one@example.com", active: true }),
    user({ id: 2, email: "two@example.com", active: true }),
    user({ id: 3, email: "three@example.com", active: true }),
  ];

  const summary = userSummaryModule.summarizeUsers(users);

  assert.equal(summary.active, 3);
  assert.equal(summary.inactive, 0);
  assert.deepEqual(summary.activeEmails, [
    "one@example.com",
    "two@example.com",
    "three@example.com",
  ]);
});

test("returns no active emails when all users are inactive", () => {
  const users = [
    user({ id: 1, email: "one@example.com", active: false }),
    user({ id: 2, email: "two@example.com", active: false }),
  ];

  const summary = userSummaryModule.summarizeUsers(users);

  assert.equal(summary.active, 0);
  assert.equal(summary.inactive, 2);
  assert.deepEqual(summary.activeEmails, []);
});

test("handles empty input", () => {
  const summary = userSummaryModule.summarizeUsers([]);

  assert.equal(summary.total, 0);
  assert.equal(summary.active, 0);
  assert.equal(summary.inactive, 0);
  assert.equal(summary.adults, 0);
  assert.equal(summary.averageAge, null);
  assert.deepEqual(summary.activeEmails, []);
});

test("counts age 18 as an adult", () => {
  const users = [
    user({ id: 1, age: 17 }),
    user({ id: 2, age: 18 }),
  ];

  const summary = userSummaryModule.summarizeUsers(users);

  assert.equal(summary.adults, 1);
});

test("does not mutate the input array or user objects", () => {
  const users = [
    Object.freeze(
      user({ id: 1, email: "alice@example.com", active: true, age: 25 }),
    ),
    Object.freeze(
      user({ id: 2, email: "bob@example.com", active: true, age: 35 }),
    ),
  ];
  Object.freeze(users);

  const before = users.map((entry) => ({ ...entry }));

  const summary = userSummaryModule.summarizeUsers(users);

  assert.deepEqual(users.map((entry) => ({ ...entry })), before);
  assert.deepEqual(summary.activeEmails, [
    "alice@example.com",
    "bob@example.com",
  ]);
  assert.notEqual(summary.activeEmails, users);
});
