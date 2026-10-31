/**
 * Pure builders for what a workbench row carries: its metadata facets and its
 * form envelope. Absent optional facts are left off, so `metadata @>` queries
 * never match a null.
 */

import type { WorkbenchFacets } from './types';

interface FacetSource {
  project: string;
  pr?: number;
  sessionId?: string;
}

export function workbenchFacets(source: FacetSource, kind: string): WorkbenchFacets {
  return {
    project: source.project,
    kind,
    ...(source.pr ? { pr: source.pr } : {}),
    ...(source.sessionId ? { sessionId: source.sessionId } : {}),
  };
}

/** The envelope that fills the form's markdown brief. */
export function briefEnvelope(brief: string) {
  return { formDefaults: { brief } };
}

export function hoursTimeout(hours?: number) {
  return hours ? { timeout: `${hours}h` } : {};
}

/** The project row's home signal: one per slug, so sessions join it by signal key. */
export function projectSignalId(project: string) {
  return `claude-project-${project}`;
}
