/**
 * Ortho Pipeline types.
 *
 * Defines the step config passed in the envelope and the
 * result shape each step returns when resolved.
 */

export interface PipelineStep {
  stationName: string;
  role: string;
  instructions: string;
  childWorkflow?: string;
  printerSets?: number;
  parentWorkflowId?: string;
}

export interface StepResult {
  stationName: string;
  resolution: Record<string, any>;
  completedAt: string;
}
