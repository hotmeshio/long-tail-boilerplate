/**
 * Print-farm operator identities — the boilerplate's glue between the ported
 * example and a real seeded database.
 *
 * Every print-routing robot resolves escalations through the role-gated public API
 * as an operator principal. The escalation write path stores the operator as a
 * UUID (created_by), so operators must be referenced by a real user id — not an
 * external_id. To keep those ids STABLE and referenceable from static places (the
 * printShift dashboard envelope, the orchestrator, the seed), each operator gets a
 * deterministic UUID here. `scripts/print-seed.ts` inserts users with these exact
 * ids; the shift config and the 10-* scripts read them back.
 */

import { fleetKind, ORDER_POND, PRINTER_POND, FARMER_POND, type FleetKind } from './types';

/** Operator role within a fleet. */
export type OperatorRole = 'broker' | 'technician' | 'inspector' | 'orderer' | 'printer';

/** Deterministic UUIDs — `0a..` namespace, last octet encodes fleet+role (standard 01–05, diabetic 06–0a). */
const UUIDS: Record<FleetKind, Record<OperatorRole, string>> = {
  standard: {
    broker:     '0a000000-0000-4000-8000-000000000001',
    technician: '0a000000-0000-4000-8000-000000000002',
    inspector:  '0a000000-0000-4000-8000-000000000003',
    orderer:    '0a000000-0000-4000-8000-000000000004',
    printer:    '0a000000-0000-4000-8000-000000000005',
  },
  diabetic: {
    broker:     '0a000000-0000-4000-8000-000000000006',
    technician: '0a000000-0000-4000-8000-000000000007',
    inspector:  '0a000000-0000-4000-8000-000000000008',
    orderer:    '0a000000-0000-4000-8000-000000000009',
    printer:    '0a000000-0000-4000-8000-00000000000a',
  },
};

/** The resolved operator ids a fleet's robots run as (what gets threaded into start data). */
export interface PrintOperators {
  brokerId: string;
  technicianId: string;
  inspectorId: string;
  ordererId: string;
  printerOperatorId: string;
}

export function operatorIds(diabetic = false): PrintOperators {
  const u = UUIDS[fleetKind(diabetic)];
  return {
    brokerId: u.broker,
    technicianId: u.technician,
    inspectorId: u.inspector,
    ordererId: u.orderer,
    printerOperatorId: u.printer,
  };
}

/** One operator's full identity for seeding: stable uuid, human external_id, and pond roles. */
export interface OperatorSeed {
  id: string;
  externalId: string;
  display: string;
  roles: string[];
}

/** Every operator across both fleets — the seed's source of truth. */
export function allOperatorSeeds(): OperatorSeed[] {
  const seeds: OperatorSeed[] = [];
  for (const diabetic of [false, true]) {
    const k = fleetKind(diabetic);
    const u = UUIDS[k];
    const rolesByOp: Record<OperatorRole, string[]> = {
      // Singleton broker serves both ponds — standard operator gets all four
      // pond roles so it can scan and claim in both standard and diabetic queues.
      broker: k === 'standard'
        ? [PRINTER_POND.standard, ORDER_POND.standard, PRINTER_POND.diabetic, ORDER_POND.diabetic]
        : [PRINTER_POND[k], ORDER_POND[k]],
      technician: [PRINTER_POND[k]],
      inspector: [FARMER_POND[k]],
      orderer: [ORDER_POND[k]],
      printer: [PRINTER_POND[k]],
    };
    const display: Record<OperatorRole, string> = {
      broker: 'Print Broker',
      technician: 'Print Technician',
      inspector: 'Print Inspector',
      orderer: 'Print Orderer',
      printer: 'Print Printer Operator',
    };
    (Object.keys(u) as OperatorRole[]).forEach((role) => {
      seeds.push({
        id: u[role],
        externalId: `print-${role === 'printer' ? 'printer' : role}-${k}`,
        display: `${display[role]} (${k})`,
        roles: rolesByOp[role],
      });
    });
  }
  return seeds;
}
