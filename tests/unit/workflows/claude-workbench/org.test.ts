import { describe, it, expect } from 'vitest';

import {
  CHANNEL_ITEMS,
  DELIVERABLE_TYPES,
  PROGRAM_TEMPLATES,
  RACI_ITEMS,
  ROLE_ITEMS,
  STARTER_ENTRIES,
  WORKBENCH_INPUT_LOOKUPS,
  orgLookups,
  seatLookups,
} from '../../../../src/workflows/claude-workbench/org';
import { SEAT_ROLES } from '../../../../src/workflows/claude-workbench/types';

const kinds = new Set(DELIVERABLE_TYPES.map((type) => type.value));

describe('org editions', () => {
  it('every option list item has a value and a label', () => {
    for (const items of [ROLE_ITEMS, RACI_ITEMS, CHANNEL_ITEMS, DELIVERABLE_TYPES, PROGRAM_TEMPLATES]) {
      for (const item of items) {
        expect(typeof item.value).toBe('string');
        expect(typeof item.label).toBe('string');
      }
    }
  });

  it('every deliverable type names two different real roles', () => {
    for (const type of DELIVERABLE_TYPES) {
      expect(SEAT_ROLES).toContain(type.producer);
      expect(SEAT_ROLES).toContain(type.reviewer);
      expect(type.producer).not.toBe(type.reviewer);
      expect(['none', 'eligible', 'only']).toContain(type.ai);
    }
  });

  it('every template names real kinds, real signers and a real owner', () => {
    for (const template of PROGRAM_TEMPLATES) {
      expect(SEAT_ROLES).toContain(template.owner);
      expect(template.phases.length).toBeGreaterThan(0);
      for (const phase of template.phases) {
        expect(phase.deliverables.length).toBeGreaterThan(0);
        expect(phase.gate.length).toBeGreaterThan(0);
        for (const kind of phase.deliverables) expect(kinds.has(kind)).toBe(true);
        for (const role of phase.gate) expect(SEAT_ROLES).toContain(role);
      }
    }
  });

  it('ships the demo template the integration test drives', () => {
    const demo = PROGRAM_TEMPLATES.find((template) => template.value === 'demo');
    expect(demo?.phases).toEqual([{ key: 'build', label: 'Build', deliverables: ['demo-note'], gate: ['product'] }]);
  });

  it('pins every program row to the editions it started under', () => {
    const refs = orgLookups({ roles: 3, raci: 1, channels: 1, 'deliverable-types': 7, programs: 2 });
    expect(refs).toEqual([
      { domain: 'org', key: 'roles', version: 3, as: 'roles' },
      { domain: 'org', key: 'raci', version: 1, as: 'raci' },
      { domain: 'org', key: 'deliverable-types', version: 7, as: 'types' },
    ]);
    expect(WORKBENCH_INPUT_LOOKUPS.every((ref) => ref.version === undefined)).toBe(true);
    expect(seatLookups({ roles: 3, raci: 1, channels: 1, 'deliverable-types': 7, programs: 2 })).toEqual([...refs, { domain: 'org', key: 'handoff-guide', as: 'guide' }]);
    expect(seatLookups()).toEqual([{ domain: 'org', key: 'handoff-guide', as: 'guide' }]);
    expect(STARTER_ENTRIES.map((entry) => entry.key).slice(0, 4)).toEqual(['raci', 'channels', 'deliverable-types', 'programs']);
    expect(STARTER_ENTRIES.map((entry) => entry.key)).not.toContain('roles');
    expect(STARTER_ENTRIES.map((entry) => entry.key)).toContain('inbox-rules');
  });
});
