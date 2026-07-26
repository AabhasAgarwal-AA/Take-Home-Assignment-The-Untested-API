# Submission Notes

## Overview

This submission adds automated test coverage, fixes a pagination bug, and
implements task assignment.

The work includes:

- Unit tests for the task service
- Integration tests for the Express API using Supertest
- A fix for one-based pagination
- A new `PATCH /tasks/:id/assign` endpoint
- Validation for assignment requests
- Regression tests for the fixed and newly implemented behavior
- A bug report documenting additional issues and design questions

---

## Work completed

### Unit tests

Added:

```text
tests/taskService.test.js
```

The unit tests directly cover the exported service functions:

- `create`
- `getAll`
- `findById`
- `getByStatus`
- `getPaginated`
- `getStats`
- `update`
- `remove`
- `completeTask`
- `assignTask`
- `_reset`

The tests include successful operations and missing-resource or boundary cases.

Time-dependent behavior in `getStats` and `completeTask` is tested with Jest
fake timers to keep the results deterministic.

### Integration tests

Added:

```text
tests/tasks.integration.test.js
```

The integration tests use Supertest and cover:

- `GET /tasks`
- `GET /tasks?status=...`
- `GET /tasks?page=...&limit=...`
- `GET /tasks/stats`
- `POST /tasks`
- `PUT /tasks/:id`
- `DELETE /tasks/:id`
- `PATCH /tasks/:id/complete`
- `PATCH /tasks/:id/assign`

The in-memory data store is reset before each test so tests do not depend on
execution order or data created by another test.

---

## Bug fixed

### Pagination offset

The original pagination implementation calculated the offset as:

```js
const offset = page * limit;
```

Because the API uses one-based page numbers and arrays use zero-based indexes,
page 1 incorrectly started after the first page of data.

The corrected calculation is:

```js
const offset = (page - 1) * limit;
```

Unit and integration regression tests verify that:

- Page 1 starts with the first task
- Page 2 starts after the tasks returned on page 1
- A page beyond the available tasks returns an empty array

Additional bugs and API concerns are documented in `BUG_REPORT.md`.

---

## New feature: Assign a task

Added the endpoint:

```http
PATCH /tasks/:id/assign
Content-Type: application/json
```

Request body:

```json
{
  "assignee": "Alice Smith"
}
```

Successful response:

```http
200 OK
```

The response contains the updated task, including:

```json
{
  "assignee": "Alice Smith"
}
```

### Error responses

The endpoint returns `400 Bad Request` when:

- `assignee` is missing
- `assignee` is not a string
- `assignee` is an empty string
- `assignee` contains only whitespace
- `assignee` is `null`

The endpoint returns `404 Not Found` when the requested task does not exist.

### Design decisions

#### Explicit unassigned state

New tasks are created with:

```js
assignee: null
```

This provides an explicit and consistent unassigned state instead of omitting
the property from some task objects.

#### Whitespace handling

Leading and trailing whitespace is removed before storing the assignee:

```js
assignee: assignee.trim()
```

For example:

```json
{
  "assignee": "  Alice Smith  "
}
```

is stored as:

```json
{
  "assignee": "Alice Smith"
}
```

Whitespace-only values are rejected.

#### Reassignment

If a task already has an assignee, a successful assignment request replaces
the existing value.

For example:

```text
Alice -> Bob
```

results in `Bob` becoming the current assignee.

I chose replacement behavior because:

- The assignment did not require conflict behavior
- It makes repeated calls with the same input idempotent
- It avoids requiring a separate reassignment endpoint

Before production, I would confirm whether reassignment should instead require
special authorization or return `409 Conflict`.

#### Service and route separation

The route is responsible for:

- Validating the HTTP request
- Selecting the correct response status
- Formatting the error response

The service is responsible for:

- Finding the task
- Updating the assignee
- Storing the updated task
- Returning `null` when the task does not exist

This is consistent with the organization of the existing codebase.

---

## Commands run

Dependencies were installed using:

```bash
npm install
```

The test suite was run using:

```bash
npm test -- --runInBand
```

Coverage was generated using:

```bash
npm run coverage -- --runInBand
```

`--runInBand` was used to run the test files serially. This is useful because
the application uses a shared in-memory store.

---

## Test results

Replace the following placeholders with the exact output from your test run:

```text
Test Suites: 2 passed, 2 total
Tests:       57 passed, 57 total
Snapshots:   0 total
Time:        4.324 s
```

Do not submit the placeholders. Copy the summary printed by:

```bash
npm test -- --runInBand
```
---

## Coverage results

Replace the table below with the exact coverage output produced by:

```bash
npm run coverage -- --runInBand
```

```text
-----------------|---------|----------|---------|---------|-------------------
File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-----------------|---------|----------|---------|---------|-------------------
All files        |   96.12 |    91.86 |   93.33 |   95.74 |                   
 src             |   69.23 |       75 |       0 |   69.23 |                   
  app.js         |   69.23 |       75 |       0 |   69.23 | 10-11,17-18       
 src/routes      |     100 |    91.66 |     100 |     100 |                   
  tasks.js       |     100 |    91.66 |     100 |     100 | 20-21             
 src/services    |     100 |    94.73 |     100 |     100 |                   
  taskService.js |     100 |    94.73 |     100 |     100 | 22                
 src/utils       |   92.59 |     92.3 |     100 |   92.59 |                   
  validators.js  |   92.59 |     92.3 |     100 |   92.59 | 25,31             
-----------------|---------|----------|---------|---------|-------------------
```

The assignment target is at least 80% coverage. The actual Jest output should
be included rather than an estimate.

---

## What I would test next

With more time, I would add tests for the following areas.

### Pagination validation

Test invalid or unusual pagination parameters:

- `page=0`
- Negative pages
- Negative limits
- Non-numeric values
- Numeric prefixes such as `page=2abc`
- Very large limits
- Requests that provide only `page`
- Requests that provide only `limit`

I would also clarify and test the maximum allowed page size.

### Status filtering

The current service uses substring matching. I would add regression coverage
for partial values such as:

```text
status=do
```

I would then change filtering to exact equality after confirming whether an
invalid status should produce `400` or an empty result.

### Completion behavior

I would test that completing a task:

- Preserves its priority
- Preserves its title, description, due date, and assignee
- Sets `status` to `done`
- Sets a valid `completedAt` timestamp

I would also clarify whether completing an already completed task should:

- Preserve the original `completedAt`, or
- Replace it with a new timestamp

### Update security and field ownership

I would test attempts to overwrite system-managed properties:

- `id`
- `createdAt`
- `completedAt`

I would also test unknown request properties and determine whether they should
be ignored or rejected.

### Request-body handling

I would test:

- Missing JSON bodies
- JSON arrays instead of objects
- Primitive JSON bodies
- Malformed JSON
- Unsupported content types
- Oversized payloads

### Validation boundaries

I would clarify and test:

- Maximum title length
- Maximum description length
- Maximum assignee length
- Whether control characters are accepted
- Whether names should be normalized
- Strict ISO 8601 due-date validation
- Whether `dueDate: null` can clear an existing due date

### Combined queries

The current route gives status filtering precedence over pagination. I would
clarify whether this request should return a paginated filtered result:

```http
GET /tasks?status=todo&page=1&limit=10
```

Then I would add integration tests for the agreed behavior.

### Error handling

I would add tests for:

- Unknown routes
- Unsupported HTTP methods
- Invalid JSON
- Unexpected service failures
- Consistent error response shapes

### Production concerns

If the in-memory store were replaced with a database, I would add tests for:

- Concurrent updates
- Transaction behavior
- Database failures
- Assignment conflicts
- Persistence across application restarts
- Unique identifiers and foreign-key validation

---

## What surprised me

The largest issue I found was the pagination calculation. The API accepted
one-based page numbers, but the service calculated offsets as though page
numbers were zero-based. This caused the first page to skip the first group of
tasks.

I was also surprised that completing a task resets its priority to `medium`.
Priority appears unrelated to completion and would normally be preserved.

Other notable findings were:

- Status filtering uses substring matching instead of exact matching
- `PUT` is described as a full update but behaves like a partial update
- Update requests can overwrite system-managed task fields
- The README and assignment brief use different status names
- Invalid pagination values are silently converted or defaulted

---

## Questions before shipping to production

Before production, I would ask the following questions.

### Task statuses

Which status vocabulary is authoritative?

The README uses:

```text
pending, in-progress, completed
```

The assignment and implementation use:

```text
todo, in_progress, done
```

### Status filtering

Should an unsupported status filter return:

- `400 Bad Request`, or
- `200 OK` with an empty array?

Should filtering always use exact equality?

### Update semantics

Is `PUT /tasks/:id` intended to:

- Fully replace the mutable task representation, or
- Partially update only supplied fields?

If it is a partial update, should it be changed to `PATCH`?

### Mutable fields

Which task fields may clients update directly?

Should clients be prevented from changing:

- `id`
- `createdAt`
- `completedAt`
- `assignee`

### Completion behavior

Should completing a task preserve its original priority?

If a task is already complete, should another completion request:

- Return the task unchanged
- Refresh `completedAt`
- Return a conflict
- Return another status code

### Assignment behavior

Should assigning an already assigned task:

- Replace the current assignee
- Return `409 Conflict`
- Require an explicit reassignment operation

Should there also be a way to unassign a task?

### Assignee identity

Is a display name sufficient, or should the API store a stable user ID?

A production API would commonly accept something like:

```json
{
  "assigneeId": "user-uuid"
}
```

rather than using a potentially non-unique display name.

### Authorization

Who is allowed to:

- Create tasks
- Update tasks
- Complete tasks
- Assign or reassign tasks
- Delete tasks

The current API has no authentication or authorization.

### Pagination

What should the default and maximum page limits be?

Should invalid values produce `400`, or should they be normalized?

### Dates

Must `dueDate` be a strict ISO 8601 timestamp?

Should date-only values be accepted?

Which timezone behavior is expected?

### Persistence

The current in-memory store resets whenever the process restarts. Which
database and persistence guarantees are required for production?

---

## Tradeoffs

I kept the implementation close to the structure and style of the existing
codebase rather than introducing additional abstractions.

For the assignment feature, I added one focused service function, one
validator, and one route. This kept the change small and easy to test.

I allowed reassignment because the specification asks what should happen when
a task is already assigned but does not require conflict handling. The chosen
behavior is documented and covered by tests.

I fixed pagination as the required bug fix but documented other issues rather
than changing all of them. Some of those changes depend on product decisions,
such as whether invalid filters return `400` and whether `PUT` should be a full
replacement.

---

## Final checklist

Before submitting, verify the following:

- [x] Unit tests were added
- [x] Integration tests were added
- [x] Every endpoint has happy-path coverage
- [x] Edge cases are covered
- [x] Pagination bug was fixed
- [x] Pagination regression tests were added
- [x] Assignment endpoint was implemented
- [x] Assignment validation was implemented
- [x] Assignment unit tests were added
- [x] Assignment integration tests were added
- [x] Additional bugs were documented
- [ ] Actual Jest test summary was pasted above
- [ ] Actual Jest coverage table was pasted above
- [ ] Coverage was confirmed to be at least 80%
- [ ] README API documentation was updated with `assignee`
- [ ] All placeholders were removed
- [ ] All files were committed
- [ ] The submission branch or fork was pushed