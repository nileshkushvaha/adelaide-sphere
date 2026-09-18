import type { DatabaseClient } from '@adelaide-sphere/database';
import { runAiOperation } from './operations.js';
import { SCHEDULED_TASKS, scheduledTask } from '@adelaide-sphere/domain';
import { TASK_IMPLEMENTATIONS } from '../scheduled-tasks.js';

describe('ai.operation job handler', () => {
  it('ignores a delivery without a well-formed operation id, touching nothing', async () => {
    const db = { $executeRaw: vi.fn() } as unknown as DatabaseClient;
    expect(await runAiOperation(db, {}, 'runner')).toBe('ignored: no operation id');
    expect(await runAiOperation(db, { operationId: 'x; DROP TABLE' }, 'runner')).toBe('ignored: no operation id');
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it('does nothing when the database says the operation is not claimable (duplicate or late delivery)', async () => {
    const db = { $executeRaw: vi.fn(async () => 0), aIOperation: { findUnique: vi.fn() } } as unknown as DatabaseClient;
    expect(await runAiOperation(db, { operationId: 'cmoperation0000000000000' }, 'runner')).toBe('not claimable');
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe('AI recovery task registration', () => {
  it('is a code-registered task with an implementation, safe to overlap and required for correctness', () => {
    const task = scheduledTask('ai-content.recover-operations');
    expect(task).toMatchObject({ cron: '*/5 * * * *', timezone: 'Australia/Adelaide', highImpact: false, safeToOverlap: true, requiredForCorrectness: true });
    for (const registered of SCHEDULED_TASKS) expect(TASK_IMPLEMENTATIONS[registered.code], registered.code).toBeTypeOf('function');
  });
});
