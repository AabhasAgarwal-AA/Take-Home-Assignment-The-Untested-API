
const taskService = require('../src/services/taskService');

describe('taskService', () => {
    beforeEach(() => {
        taskService._reset();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('create', () => {
        test('creates a task with default values', () => {
            const task = taskService.create({ title: 'Write tests' });

            expect(task).toEqual({
                id: expect.any(String),
                title: 'Write tests',
                description: '',
                status: 'todo',
                priority: 'medium',
                dueDate: null,
                assignee: null,
                completedAt: null,
                createdAt: expect.any(String),
            });

            expect(taskService.getAll()).toHaveLength(1);
        });

        test('creates a task with supplied optional values', () => {
            const task = taskService.create({
                title: 'Release API',
                description: 'Deploy to production',
                status: 'in_progress',
                priority: 'high',
                dueDate: '2030-01-01T00:00:00.000Z',
            });

            expect(task).toMatchObject({
                title: 'Release API',
                description: 'Deploy to production',
                status: 'in_progress',
                priority: 'high',
                dueDate: '2030-01-01T00:00:00.000Z',
                assignee: null,
            });
        });
    });

    describe('getAll', () => {
        test('returns all tasks', () => {
            taskService.create({ title: 'First' });
            taskService.create({ title: 'Second' });

            expect(taskService.getAll().map((task) => task.title)).toEqual([
                'First',
                'Second',
            ]);
        });

        test('returns a new array instead of the internal array', () => {
            taskService.create({ title: 'Task' });

            const result = taskService.getAll();
            result.push({ title: 'External task' });

            expect(taskService.getAll()).toHaveLength(1);
        });
    });

    describe('findById', () => {
        test('finds an existing task', () => {
            const created = taskService.create({ title: 'Find me' });

            expect(taskService.findById(created.id)).toEqual(created);
        });

        test('returns undefined for an unknown ID', () => {
            expect(taskService.findById('missing')).toBeUndefined();
        });
    });

    describe('getByStatus', () => {
        test('returns matching tasks', () => {
            taskService.create({ title: 'Todo', status: 'todo' });
            taskService.create({
                title: 'In progress',
                status: 'in_progress',
            });
            taskService.create({ title: 'Done', status: 'done' });

            const result = taskService.getByStatus('todo');

            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('Todo');
        });

        test('returns an empty array when nothing matches', () => {
            taskService.create({ title: 'Todo', status: 'todo' });

            expect(taskService.getByStatus('done')).toEqual([]);
        });
    });

    describe('getPaginated', () => {
        beforeEach(() => {
            for (let index = 1; index <= 5; index += 1) {
                taskService.create({ title: `Task ${index}` });
            }
        });

        test('returns the first page starting with the first task', () => {
            const result = taskService.getPaginated(1, 2);

            expect(result.map((task) => task.title)).toEqual([
                'Task 1',
                'Task 2',
            ]);
        });

        test('returns the correct subsequent page', () => {
            const result = taskService.getPaginated(2, 2);

            expect(result.map((task) => task.title)).toEqual([
                'Task 3',
                'Task 4',
            ]);
        });

        test('returns an empty array when the page is past the end', () => {
            expect(taskService.getPaginated(10, 2)).toEqual([]);
        });
    });

    describe('getStats', () => {
        test('returns zero counts when there are no tasks', () => {
            expect(taskService.getStats()).toEqual({
                todo: 0,
                in_progress: 0,
                done: 0,
                overdue: 0,
            });
        });

        test('counts statuses and overdue incomplete tasks', () => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-01-15T00:00:00.000Z'));

            taskService.create({
                title: 'Overdue todo',
                status: 'todo',
                dueDate: '2026-01-01T00:00:00.000Z',
            });

            taskService.create({
                title: 'Future task',
                status: 'in_progress',
                dueDate: '2026-02-01T00:00:00.000Z',
            });

            taskService.create({
                title: 'Completed old task',
                status: 'done',
                dueDate: '2026-01-01T00:00:00.000Z',
            });

            expect(taskService.getStats()).toEqual({
                todo: 1,
                in_progress: 1,
                done: 1,
                overdue: 1,
            });
        });
    });

    describe('update', () => {
        test('updates an existing task', () => {
            const created = taskService.create({
                title: 'Old title',
                priority: 'low',
            });

            const updated = taskService.update(created.id, {
                title: 'New title',
                priority: 'high',
            });

            expect(updated).toMatchObject({
                id: created.id,
                title: 'New title',
                priority: 'high',
            });

            expect(taskService.findById(created.id)).toEqual(updated);
        });

        test('returns null for an unknown task', () => {
            expect(
                taskService.update('missing', { title: 'New title' })
            ).toBeNull();
        });
    });

    describe('remove', () => {
        test('removes an existing task', () => {
            const task = taskService.create({ title: 'Delete me' });

            expect(taskService.remove(task.id)).toBe(true);
            expect(taskService.findById(task.id)).toBeUndefined();
        });

        test('returns false for an unknown task', () => {
            expect(taskService.remove('missing')).toBe(false);
        });
    });

    describe('completeTask', () => {
        test('marks an existing task as complete', () => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));

            const task = taskService.create({
                title: 'Complete me',
                status: 'in_progress',
            });

            const completed = taskService.completeTask(task.id);

            expect(completed).toMatchObject({
                id: task.id,
                status: 'done',
                completedAt: '2026-01-15T12:00:00.000Z',
            });

            expect(taskService.findById(task.id)).toEqual(completed);
        });

        test('returns null for an unknown task', () => {
            expect(taskService.completeTask('missing')).toBeNull();
        });
    });

    describe('assignTask', () => {
        test('assigns a task and trims the assignee name', () => {
            const task = taskService.create({ title: 'Assign me' });

            const assigned = taskService.assignTask(
                task.id,
                '  Alice Smith  '
            );

            expect(assigned).toMatchObject({
                id: task.id,
                assignee: 'Alice Smith',
            });

            expect(taskService.findById(task.id).assignee).toBe(
                'Alice Smith'
            );
        });

        test('allows an existing assignment to be replaced', () => {
            const task = taskService.create({ title: 'Assign me' });

            taskService.assignTask(task.id, 'Alice');
            const reassigned = taskService.assignTask(task.id, 'Bob');

            expect(reassigned.assignee).toBe('Bob');
        });

        test('returns null for an unknown task', () => {
            expect(
                taskService.assignTask('missing', 'Alice')
            ).toBeNull();
        });
    });

    describe('_reset', () => {
        test('removes all tasks', () => {
            taskService.create({ title: 'Task' });

            taskService._reset();

            expect(taskService.getAll()).toEqual([]);
        });
    });
});
