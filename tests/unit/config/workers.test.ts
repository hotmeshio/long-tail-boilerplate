import { describe, it, expect } from 'vitest';

import { WORKERS, workersWithHolders } from '../../../src/config/workers';
import { STRESS_INVOCATION_ROLES, SUPERADMIN } from '../../../src/config/roles';

const invocable = WORKERS.filter((worker) => worker.config?.invocable);

describe('worker configs', () => {
  it('never opens an invocable workflow to every signed-in user', () => {
    for (const worker of invocable) {
      expect(worker.config!.invocationRoles?.length, worker.workflow.name).toBeGreaterThan(0);
    }
  });

  it('owns every invocable config from code so a stale or hand-written row is corrected at boot', () => {
    for (const worker of invocable) {
      expect(worker.config!.reset, worker.workflow.name).toBe(true);
    }
  });

  it('opens only the inbox workflows to bound holders, and leaves the list alone when there are none', () => {
    const roles = ['inbox-kim', 'inbox-agent-kim'];
    const workers = workersWithHolders(roles)!;
    const configOf = (name: string) => workers.find((worker) => worker.workflow.name === name)!.config!;
    for (const name of ['inboxSweep', 'inboxItem']) {
      expect(configOf(name).invocationRoles).toEqual(expect.arrayContaining(roles));
      expect(configOf(name).reset).toBe(true);
    }
    for (const name of ['ask', 'deliverable', 'program', 'assemblyLine']) {
      expect(configOf(name).invocationRoles).not.toEqual(expect.arrayContaining(roles));
    }
    expect(workersWithHolders([])).toBe(WORKERS);
    expect(WORKERS!.find((worker) => worker.workflow.name === 'inboxSweep')!.config!.invocationRoles).not.toContain('inbox-kim');
  });

  it('keeps the load and farm simulations to superadmin', () => {
    expect(STRESS_INVOCATION_ROLES).toEqual([SUPERADMIN]);
    for (const name of ['assemblyLine', 'stepIterator', 'reverter', 'pipeline', 'printShift', 'bambuPrinter', 'pullDemand', 'puller']) {
      const worker = WORKERS.find((entry) => entry.workflow.name === name);
      expect(worker?.config?.invocationRoles, name).toEqual([SUPERADMIN]);
    }
  });
});
