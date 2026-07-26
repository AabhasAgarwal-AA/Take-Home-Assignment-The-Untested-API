# Bug Report

## Overview

I added unit tests for the task service and integration tests for the Express
routes. During testing and code review, I found several behavioral and API
consistency issues.

The pagination issue was selected as the required bug fix. The remaining
issues are documented with suggested fixes.

---

## Bug 1: Pagination skips the first set of tasks

**Status:** Fixed  
**Severity:** High  
**Location:** `src/services/taskService.js`, `getPaginated`

### Expected behavior

The API uses one-based page numbers. Given five tasks and a page limit of two:

- Page 1 should return tasks 1 and 2
- Page 2 should return tasks 3 and 4
- Page 3 should return task 5

For example:

```http
GET /tasks?page=1&limit=2
```

should return the first two tasks.

### Actual behavior before the fix

The original implementation calculated the offset using:

```js
const offset = page * limit;
```

With `page=1` and `limit=2`, this produced an offset of `2`. Because arrays are
zero-based, the response started with the third task and skipped the first two
tasks.

### Why it happened

The API treats page numbers as one-based, while JavaScript array indexes are
zero-based. The page number therefore needs to be reduced by one before it is
converted into an array offset.

### How it was discovered

I added service and integration tests verifying that:

- Page 1 starts with the first task
- Page 2 starts after all tasks returned by page 1
- A page beyond the available data returns an empty array

The page 1 test exposed the incorrect offset calculation in the original
implementation.

### Fix

The offset calculation was changed to:

```js
const offset = (page - 1) * limit;
```

### Regression tests

Regression coverage was added in:

- `tests/taskService.test.js`
  - `returns the first page starting with the first task`
  - `returns the correct subsequent page`
  - `returns an empty array when the page is past the end`

- `tests/tasks.integration.test.js`
  - `returns the first page from the first task`
  - `returns a later page using the correct offset`

---

## Bug 2: Status filtering uses substring matching

**Status:** Not fixed  
**Severity:** Medium  
**Location:** `src/services/taskService.js`, `getByStatus`

### Expected behavior

Filtering should return tasks whose status exactly equals the requested status.

For example:

```http
GET /tasks?status=done
```

should return only tasks where:

```json
{
  "status": "done"
}
```

### Actual behavior

The current implementation uses:

```js
const getByStatus = (status) =>
  tasks.filter((task) => task.status.includes(status));
```

`String.prototype.includes` performs substring matching. This means an invalid
partial value such as `do` can match both `todo` and `done`, even though `do`
is not a valid task status.

### Why it happens

The service uses substring matching instead of exact equality.

### How it was discovered

This issue was found while reviewing the status-filtering implementation. It
can be reproduced with:

```js
taskService.create({ title: 'Todo task', status: 'todo' });
taskService.create({ title: 'Done task', status: 'done' });

taskService.getByStatus('do');
```

The result can contain tasks even though `do` is not a supported status.

### Suggested fix

Use exact equality:

```js
const getByStatus = (status) =>
  tasks.filter((task) => task.status === status);
```

The route could also validate the query parameter:

```js
const VALID_STATUSES = ['todo', 'in_progress', 'done'];
```

Before implementing route-level validation, I would confirm whether an invalid
status filter should:

- Return `400 Bad Request`, or
- Return `200 OK` with an empty array

### Suggested regression test

```js
test('does not match partial status values', () => {
  taskService.create({ title: 'Todo', status: 'todo' });
  taskService.create({ title: 'Done', status: 'done' });

  expect(taskService.getByStatus('do')).toEqual([]);
});
```

---

## Bug 3: Completing a task resets its priority

**Status:** Not fixed  
**Severity:** Medium  
**Location:** `src/services/taskService.js`, `completeTask`

### Expected behavior

Completing a task should update only completion-related properties:

- Set `status` to `done`
- Set `completedAt` to the current time

Unrelated properties, such as `priority`, should remain unchanged.

### Actual behavior

The current implementation contains:

```js
const updated = {
  ...task,
  priority: 'medium',
  status: 'done',
  completedAt: new Date().toISOString(),
};
```

Completing a task with `priority: "high"` or `priority: "low"` therefore
changes its priority to `medium`.

### Why it happens

The service explicitly overwrites the existing priority while constructing the
completed task.

### How it was discovered

This was found while reviewing the completion service. It can be reproduced by
creating a high-priority task and then completing it:

```js
const task = taskService.create({
  title: 'Important task',
  priority: 'high',
});

const completed = taskService.completeTask(task.id);
```

`completed.priority` is `medium`, even though priority is not related to task
completion.

### Suggested fix

Remove the priority assignment:

```js
const updated = {
  ...task,
  status: 'done',
  completedAt: new Date().toISOString(),
};
```

### Suggested regression test

```js
test('preserves priority when completing a task', () => {
  const task = taskService.create({
    title: 'Important task',
    priority: 'high',
  });

  const completed = taskService.completeTask(task.id);

  expect(completed.priority).toBe('high');
});
```

---

## Bug 4: Create and update validators assume the request body exists

**Status:** Not fixed  
**Severity:** Medium  
**Location:** `src/utils/validators.js`

Affected functions:

- `validateCreateTask`
- `validateUpdateTask`

### Expected behavior

A request without a JSON body should result in a client validation response,
normally `400 Bad Request`.

For example:

```http
POST /tasks
```

without a request body should not cause an internal server error.

### Actual behavior

The validators immediately access properties on `body`:

```js
if (!body.title || ...)
```

and:

```js
if (body.title !== undefined && ...)
```

If `body` is `undefined`, accessing `body.title` throws a `TypeError`. The
global Express error handler can then return:

```json
{
  "error": "Internal server error"
}
```

with status `500`.

### Why it happens

The validators assume that the body is always a valid object before reading
its properties.

The assignment validator already handles a missing body more defensively:

```js
if (!body || typeof body.assignee !== 'string' || ...)
```

### Suggested fix

Validate the body before accessing any fields:

```js
const isObjectBody = (body) =>
  body &&
  typeof body === 'object' &&
  !Array.isArray(body);
```

For example:

```js
const validateCreateTask = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'request body must be a JSON object';
  }

  // Existing field validation...
};
```

Apply the same defensive check to `validateUpdateTask` and
`validateAssignTask`.

### Suggested regression tests

```js
test('rejects a create request with no body', async () => {
  const response = await request(app).post('/tasks');

  expect(response.status).toBe(400);
});
```

```js
test('rejects an update request with no body', async () => {
  const task = await createTask();

  const response = await request(app).put(`/tasks/${task.id}`);

  expect(response.status).toBe(400);
});
```

---

## Bug 5: Update accepts arbitrary and immutable fields

**Status:** Not fixed  
**Severity:** High for a production API  
**Location:** `src/services/taskService.js`, `update`

### Expected behavior

Clients should only be able to update documented mutable task fields, such as:

- `title`
- `description`
- `status`
- `priority`
- `dueDate`

System-managed properties should not be directly editable, including:

- `id`
- `createdAt`
- `completedAt`

Assignment should preferably be managed through the dedicated assignment
endpoint.

### Actual behavior

The current update service merges every property supplied by the client:

```js
const updated = { ...tasks[index], ...fields };
```

A client can therefore attempt to overwrite the task ID or creation time:

```json
{
  "id": "different-id",
  "createdAt": "invalid-value",
  "unexpectedField": true
}
```

### Why it happens

The update service does not allowlist mutable fields. It spreads the entire
request body onto the stored object.

### Suggested fix

Build the update from explicitly supported fields or use a helper that picks
only allowed fields:

```js
const update = (id, fields) => {
  const index = tasks.findIndex((task) => task.id === id);
  if (index === -1) return null;

  const allowedFields = [
    'title',
    'description',
    'status',
    'priority',
    'dueDate',
  ];

  const changes = {};

  allowedFields.forEach((field) => {
    if (fields[field] !== undefined) {
      changes[field] = fields[field];
    }
  });

  const updated = {
    ...tasks[index],
    ...changes,
  };

  tasks[index] = updated;
  return updated;
};
```

The exact mutable field list should be confirmed before shipping.

---

## Bug 6: Pagination parameters are not strictly validated

**Status:** Not fixed  
**Severity:** Medium  
**Location:** `src/routes/tasks.js`, `GET /tasks`

### Expected behavior

`page` and `limit` should be validated as positive integers. The API should
handle invalid values consistently.

Examples of invalid values include:

```text
?page=0
?page=-1
?page=abc
?page=2abc
?limit=0
?limit=-10
?limit=abc
```

### Actual behavior

The route currently uses:

```js
const pageNum = parseInt(page, 10) || 1;
const limitNum = parseInt(limit, 10) || 10;
```

This can silently convert or default invalid values:

- `page=abc` becomes the default page `1`
- `page=0` becomes the default page `1`
- `page=2abc` becomes page `2`
- Negative values remain negative
- Negative values can produce unexpected behavior with `Array.prototype.slice`

### Why it happens

`parseInt` accepts strings with numeric prefixes and does not enforce positive
integer constraints.

### Suggested fix

Validate query values explicitly:

```js
const parsePositiveInteger = (value, defaultValue) => {
  if (value === undefined) return defaultValue;

  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
};
```

If either parameter is invalid, the route could return:

```json
{
  "error": "page and limit must be positive integers"
}
```

with status `400`.

A maximum `limit` should also be considered to prevent excessively large
responses.

---

## Documentation inconsistency: Task status values

**Status:** Requires clarification  
**Location:** `README.md` and `ASSIGNMENT.md`

### Observation

The root README describes statuses as:

- `pending`
- `in-progress`
- `completed`

The assignment brief and implementation use:

- `todo`
- `in_progress`
- `done`

### Current decision

I followed `ASSIGNMENT.md` and the existing source implementation:

```js
const VALID_STATUSES = ['todo', 'in_progress', 'done'];
```

### Recommendation

Choose one status vocabulary and update all documentation, validation,
examples, tests, and consumers to use it consistently.

---

## API design ambiguity: PUT behaves like PATCH

**Status:** Requires clarification  
**Location:** `src/routes/tasks.js`, `PUT /tasks/:id`

### Observation

The endpoint is described as a full update, but the implementation performs a
partial merge. Requests can update only one property, and an empty object is
also accepted.

This behavior is closer to `PATCH` than the usual full-replacement semantics
of `PUT`.

### Recommendation

Before production, clarify whether:

1. `PUT /tasks/:id` must require the complete mutable task representation, or
2. The existing partial-update behavior is intended and should be documented,
   or
3. The route should be changed to `PATCH /tasks/:id`

---

## Summary

The required bug fix addressed the pagination offset:

```js
const offset = (page - 1) * limit;
```

The test suite now includes regression coverage for first-page and later-page
pagination behavior.

Other issues were documented rather than changed to avoid expanding the scope
without clarified API requirements. The most important remaining issues before
production are:

1. Completing a task unexpectedly changes its priority
2. Update requests can overwrite system-managed fields
3. Pagination query parameters are not strictly validated
4. Status filtering uses partial matching
5. Create and update validators are not defensive about missing bodies
6. The documentation uses inconsistent status values