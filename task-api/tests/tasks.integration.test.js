const request = require('supertest');

const app = require('../src/app');
const taskService = require('../src/services/taskService');

describe('Task API', () => {
    beforeEach(() => {
        taskService._reset();
    });

    const createTask = async (overrides = {}) => {
        const response = await request(app)
            .post('/tasks')
            .send({
                title: 'Test task',
                ...overrides,
            });

        expect(response.status).toBe(201);
        return response.body;
    };

    describe('GET /tasks', () => {
        test('returns every task', async () => {
            await createTask({ title: 'First' });
            await createTask({ title: 'Second' });

            const response = await request(app).get('/tasks');

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(2);
            expect(response.body.map((task) => task.title)).toEqual([
                'First',
                'Second',
            ]);
        });

        test('returns an empty array when no tasks exist', async () => {
            const response = await request(app).get('/tasks');

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('filters tasks by status', async () => {
            await createTask({ title: 'Todo', status: 'todo' });
            await createTask({ title: 'Done', status: 'done' });

            const response = await request(app)
                .get('/tasks')
                .query({ status: 'done' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(1);
            expect(response.body[0]).toMatchObject({
                title: 'Done',
                status: 'done',
            });
        });

        test('returns an empty array for an unmatched status', async () => {
            await createTask({ status: 'todo' });

            const response = await request(app)
                .get('/tasks')
                .query({ status: 'blocked' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('returns the first page from the first task', async () => {
            await createTask({ title: 'First' });
            await createTask({ title: 'Second' });
            await createTask({ title: 'Third' });

            const response = await request(app)
                .get('/tasks')
                .query({ page: 1, limit: 2 });

            expect(response.status).toBe(200);
            expect(response.body.map((task) => task.title)).toEqual([
                'First',
                'Second',
            ]);
        });

        test('returns a later page using the correct offset', async () => {
            await createTask({ title: 'First' });
            await createTask({ title: 'Second' });
            await createTask({ title: 'Third' });

            const response = await request(app)
                .get('/tasks')
                .query({ page: 2, limit: 2 });

            expect(response.status).toBe(200);
            expect(response.body.map((task) => task.title)).toEqual([
                'Third',
            ]);
        });
    });

    describe('GET /tasks/stats', () => {
        test('returns status and overdue counts', async () => {
            await createTask({
                title: 'Overdue',
                status: 'todo',
                dueDate: '2000-01-01T00:00:00.000Z',
            });

            await createTask({
                title: 'Active',
                status: 'in_progress',
                dueDate: '2999-01-01T00:00:00.000Z',
            });

            await createTask({
                title: 'Completed',
                status: 'done',
                dueDate: '2000-01-01T00:00:00.000Z',
            });

            const response = await request(app).get('/tasks/stats');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                todo: 1,
                in_progress: 1,
                done: 1,
                overdue: 1,
            });
        });

        test('returns zeroes when no tasks exist', async () => {
            const response = await request(app).get('/tasks/stats');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                todo: 0,
                in_progress: 0,
                done: 0,
                overdue: 0,
            });
        });

        test('does not count a completed overdue task as overdue', async () => {
            await createTask({
                title: 'Old but done',
                status: 'done',
                dueDate: '2000-01-01T00:00:00.000Z',
            });

            const response = await request(app).get('/tasks/stats');

            expect(response.status).toBe(200);
            expect(response.body.overdue).toBe(0);
            expect(response.body.done).toBe(1);
        });
    });

    describe('POST /tasks', () => {
        test('creates a task', async () => {
            const response = await request(app)
                .post('/tasks')
                .send({
                    title: 'Create integration tests',
                    description: 'Use Supertest',
                    priority: 'high',
                });

            expect(response.status).toBe(201);
            expect(response.body).toMatchObject({
                id: expect.any(String),
                title: 'Create integration tests',
                description: 'Use Supertest',
                status: 'todo',
                priority: 'high',
                dueDate: null,
                assignee: null,
                completedAt: null,
                createdAt: expect.any(String),
            });
        });

        test('rejects a missing title', async () => {
            const response = await request(app)
                .post('/tasks')
                .send({ priority: 'high' });

            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                error: 'title is required and must be a non-empty string',
            });
        });

        test('rejects a whitespace-only title', async () => {
            const response = await request(app)
                .post('/tasks')
                .send({ title: '   ' });

            expect(response.status).toBe(400);
        });

        test('rejects an invalid status', async () => {
            const response = await request(app)
                .post('/tasks')
                .send({
                    title: 'Invalid task',
                    status: 'blocked',
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toContain(
                'status must be one of'
            );
        });

        test('rejects an invalid priority', async () => {
            const response = await request(app)
                .post('/tasks')
                .send({
                    title: 'Invalid task',
                    priority: 'urgent',
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toContain(
                'priority must be one of'
            );
        });

        test('rejects an invalid due date', async () => {
            const response = await request(app)
                .post('/tasks')
                .send({
                    title: 'Invalid date',
                    dueDate: 'not-a-date',
                });

            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                error: 'dueDate must be a valid ISO date string',
            });
        });
    });

    describe('PUT /tasks/:id', () => {
        test('updates an existing task', async () => {
            const task = await createTask({
                title: 'Old title',
                priority: 'low',
            });

            const response = await request(app)
                .put(`/tasks/${task.id}`)
                .send({
                    title: 'New title',
                    priority: 'high',
                    status: 'in_progress',
                });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                id: task.id,
                title: 'New title',
                priority: 'high',
                status: 'in_progress',
            });
        });

        test('returns 404 for an unknown task', async () => {
            const response = await request(app)
                .put('/tasks/missing')
                .send({ title: 'New title' });

            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                error: 'Task not found',
            });
        });

        test('rejects an empty title', async () => {
            const task = await createTask();

            const response = await request(app)
                .put(`/tasks/${task.id}`)
                .send({ title: '' });

            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                error: 'title must be a non-empty string',
            });
        });

        test('rejects an invalid priority', async () => {
            const task = await createTask();

            const response = await request(app)
                .put(`/tasks/${task.id}`)
                .send({ priority: 'critical' });

            expect(response.status).toBe(400);
        });
    });

    describe('DELETE /tasks/:id', () => {
        test('deletes an existing task', async () => {
            const task = await createTask();

            const response = await request(app).delete(
                `/tasks/${task.id}`
            );

            expect(response.status).toBe(204);
            expect(response.body).toEqual({});
            expect(taskService.findById(task.id)).toBeUndefined();
        });

        test('returns 404 for an unknown task', async () => {
            const response = await request(app).delete(
                '/tasks/missing'
            );

            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                error: 'Task not found',
            });
        });

        test('returns 404 when deleting the same task twice', async () => {
            const task = await createTask();

            await request(app).delete(`/tasks/${task.id}`);

            const response = await request(app).delete(
                `/tasks/${task.id}`
            );

            expect(response.status).toBe(404);
        });
    });

    describe('PATCH /tasks/:id/complete', () => {
        test('marks an existing task complete', async () => {
            const task = await createTask({
                status: 'in_progress',
            });

            const response = await request(app).patch(
                `/tasks/${task.id}/complete`
            );

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                id: task.id,
                status: 'done',
                completedAt: expect.any(String),
            });
        });

        test('returns 404 for an unknown task', async () => {
            const response = await request(app).patch(
                '/tasks/missing/complete'
            );

            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                error: 'Task not found',
            });
        });

        test('keeps an already completed task completed', async () => {
            const task = await createTask({ status: 'done' });

            const response = await request(app).patch(
                `/tasks/${task.id}/complete`
            );

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('done');
            expect(response.body.completedAt).toEqual(
                expect.any(String)
            );
        });
    });

    describe('PATCH /tasks/:id/assign', () => {
        test('assigns an existing task', async () => {
            const task = await createTask();

            const response = await request(app)
                .patch(`/tasks/${task.id}/assign`)
                .send({ assignee: 'Alice Smith' });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                id: task.id,
                assignee: 'Alice Smith',
            });
        });

        test('trims the assignee name', async () => {
            const task = await createTask();

            const response = await request(app)
                .patch(`/tasks/${task.id}/assign`)
                .send({ assignee: '  Alice Smith  ' });

            expect(response.status).toBe(200);
            expect(response.body.assignee).toBe('Alice Smith');
        });

        test('returns 404 if the task does not exist', async () => {
            const response = await request(app)
                .patch('/tasks/missing/assign')
                .send({ assignee: 'Alice' });

            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                error: 'Task not found',
            });
        });

        test.each([
            {},
            { assignee: '' },
            { assignee: '   ' },
            { assignee: 123 },
            { assignee: null },
        ])('rejects invalid assignment body %#', async (body) => {
            const task = await createTask();

            const response = await request(app)
                .patch(`/tasks/${task.id}/assign`)
                .send(body);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                error:
                    'assignee is required and must be a non-empty string',
            });
        });

        test('replaces the existing assignee', async () => {
            const task = await createTask();

            await request(app)
                .patch(`/tasks/${task.id}/assign`)
                .send({ assignee: 'Alice' })
                .expect(200);

            const response = await request(app)
                .patch(`/tasks/${task.id}/assign`)
                .send({ assignee: 'Bob' });

            expect(response.status).toBe(200);
            expect(response.body.assignee).toBe('Bob');
        });
    });
});
