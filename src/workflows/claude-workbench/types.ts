/**
 * Claude workbench: an organization as queues.
 *
 * A role is a team, a leadership circle or a personal inbox; roles group into
 * domains; a persona is the collection of roles a holder has. Work crosses
 * roles as validated handoffs: a deliverable is produced by one role and
 * reviewed by another, a program is phases of deliverables closed by gates,
 * and an ask parks one decision in any role. Humans and AI hold roles the
 * same way. See docs/workbench/PRD.md and TDD.md.
 */

export const CLAUDE_WORKBENCH_QUEUE = 'claude-workbench';
export const ROW_TYPE = 'workbench';
export const ORG_PROGRAMS_ROLE = 'org-programs';
/** The knowledge domain the org editions live in. */
export const ORG_DOMAIN = 'org';

export interface OrgRoleSpec {
  role: string;
  domain: string;
  title: string;
  meaning: string;
}

/**
 * A person with an inbox. Identity is their sign-in email; the role and
 * persona names follow the role alphabet (`[a-z][a-z0-9_-]*`, so URL-safe),
 * and encode the whole email so holders from different domains never collide:
 * `ana.ruiz@example.com` becomes `ana-ruiz-at-example-com`. Each holder has
 * two queues, their inbox and their agent queue, and one persona that holds
 * both; an agent acting for them over MCP acts as them and sees exactly these.
 */
export interface InboxHolder {
  name: string;
  /** Set when the holder was given as an email; the seed assigns the persona to the account with this email. */
  email?: string;
  /** The decide queue: `inbox-<name>`. */
  role: string;
  /** The act queue the holder's agent works: `inbox-agent-<name>`. */
  agentRole: string;
  persona: string;
  title: string;
}

const HOLDER_NAME = /^[a-z][a-z0-9_-]{0,80}$/;
const INBOX_PREFIX = 'inbox-';
const AGENT_PREFIX = 'inbox-agent-';

export const inboxRole = (name: string) => `${INBOX_PREFIX}${name}`;
export const agentRole = (name: string) => `${AGENT_PREFIX}${name}`;
/** The agent queue that belongs to an inbox role. */
export const agentRoleFor = (inboxRoleName: string) => agentRole(inboxRoleName.slice(INBOX_PREFIX.length));

const slugify = (value: string) => value.replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z]+/, '').replace(/-+$/, '');
const title = (name: string) => name.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

/** One holder from one env entry: an email (`ana.ruiz@example.com`) or a bare name (`sam`). */
export function parseHolder(entry: string): InboxHolder | undefined {
  const raw = entry.trim().toLowerCase();
  if (!raw) return undefined;
  const at = raw.indexOf('@');
  const email = at > 0 ? raw : undefined;
  const name = email ? slugify(`${raw.slice(0, at)}-at-${raw.slice(at + 1)}`) : slugify(raw);
  if (!HOLDER_NAME.test(name)) return undefined;
  return { name, email, role: inboxRole(name), agentRole: agentRole(name), persona: name, title: title(email ? slugify(raw.slice(0, at)) : name) };
}

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** A domain entry: `example.com` or `@example.com`. Anything with a local part is an email, anything without a dot is a name. */
export function parseDomain(entry: string): string | undefined {
  const raw = entry.trim().toLowerCase().replace(/^@/, '');
  return DOMAIN.test(raw) && !entry.includes('@', 1) ? raw : undefined;
}

/**
 * The inbox entries of a deployment: named holders (bare names and exact
 * emails, whose roles exist from boot) and domain rules (every account that
 * signs in with an email in the domain is bound to its own inbox on arrival).
 */
export interface InboxEntries {
  holders: InboxHolder[];
  domains: string[];
}

export function parseInboxEntries(value: string | undefined): InboxEntries {
  const entries = (value ?? 'sam').split(',').map((entry) => entry.trim()).filter(Boolean);
  const domains = [...new Set(entries.map(parseDomain).filter((domain): domain is string => domain !== undefined))];
  const holders = entries.filter((entry) => parseDomain(entry) === undefined).map(parseHolder).filter((holder): holder is InboxHolder => holder !== undefined);
  return { domains, holders: holders.filter((holder, index) => holders.findIndex((other) => other.name === holder.name) === index) };
}

/** The named holders only; domain entries are rules, not holders. */
export function parseHolders(value: string | undefined): InboxHolder[] {
  return parseInboxEntries(value).holders;
}

/**
 * The holder an account's email is entitled to: a named holder with that
 * email, or a holder minted from the email when its domain is listed.
 * Undefined means the account gets no inbox.
 */
export function holderForEmail(email: string | null | undefined, entries: InboxEntries = INBOX_ENTRIES): InboxHolder | undefined {
  const address = email?.trim().toLowerCase();
  if (!address || !address.includes('@')) return undefined;
  const named = entries.holders.find((holder) => holder.email === address);
  if (named) return named;
  const domain = address.slice(address.indexOf('@') + 1);
  return entries.domains.includes(domain) ? parseHolder(address) : undefined;
}

/** The two seats a holder's inbox is made of. */
export function holderRoleSpecs(holder: InboxHolder): OrgRoleSpec[] {
  return [
    { role: holder.role, domain: 'people', title: `Inbox: ${holder.title}`, meaning: 'A personal inbox; the items, asks and rollup for one person.' },
    { role: holder.agentRole, domain: 'agents', title: `Agent: ${holder.title}`, meaning: `The act queue of ${holder.title}'s inbox; worked by their agent, acting as them.` },
  ];
}

/**
 * Personal inboxes, from the environment so a deployment names its own
 * people without touching the code: WORKBENCH_INBOX_HOLDERS=example.com,sam.
 * A bare name or an email is a holder whose roles exist from boot; an email is
 * also bound to the account that signs in with it. A domain (`example.com`)
 * is a rule: every account whose email is in it is bound to an inbox of its
 * own when it appears (see src/config/inbox-holders.ts). Defaults to `sam`.
 */
export const INBOX_ENTRIES: InboxEntries = parseInboxEntries(process.env.WORKBENCH_INBOX_HOLDERS);
export const HOLDERS: InboxHolder[] = INBOX_ENTRIES.holders;
export const INBOX_DOMAINS: string[] = INBOX_ENTRIES.domains;
export const INBOX_HOLDERS: string[] = HOLDERS.map((holder) => holder.name);

/** The example org's team roles. Every entry is a role with a queue; `domain` groups them. */
export const TEAM_ROLES: OrgRoleSpec[] = [
  { role: 'product', domain: 'product', title: 'Product', meaning: 'Owns what is built and why: problem briefs, PRDs, launch decisions.' },
  { role: 'design', domain: 'design', title: 'Design', meaning: 'Owns how it works for people: research, design specs.' },
  { role: 'engineering-execution', domain: 'engineering', title: 'Engineering: Execution', meaning: 'Builds and ships increments; validates processes on the floor.' },
  { role: 'engineering-lab', domain: 'engineering', title: 'Engineering: Lab', meaning: 'Prototypes and feasibility; turns requirements into working hardware.' },
  { role: 'engineering-platform', domain: 'engineering', title: 'Engineering: Platform', meaning: 'Owns the platform: TDDs, runbooks, shared infrastructure.' },
  { role: 'engineering-leadership', domain: 'engineering', title: 'Engineering: Leadership', meaning: 'Reviews PRDs for feasibility and signs design and build gates.' },
  { role: 'sre', domain: 'sre', title: 'SRE', meaning: 'Reliability: reviews TDDs, owns runbooks, signs launch readiness.' },
  { role: 'quality', domain: 'quality', title: 'Quality', meaning: 'Test plans, verification, process validation.' },
  { role: 'sales', domain: 'sales', title: 'Sales', meaning: 'Pre-sales: launch plans and what customers are promised.' },
  { role: 'support', domain: 'support', title: 'Support', meaning: 'Post-sales: support guides and what customers report.' },
];

export const HOLDER_ROLES: OrgRoleSpec[] = HOLDERS.flatMap(holderRoleSpecs);

/** Every role with a queue: the teams, and an inbox and an agent queue per holder. */
export const ORG_ROLES: OrgRoleSpec[] = [...TEAM_ROLES, ...HOLDER_ROLES];
export const SEAT_ROLES: string[] = ORG_ROLES.map((entry) => entry.role);
export const DOMAINS: string[] = [...new Set(ORG_ROLES.map((entry) => entry.domain))];

/** The part of the shared form a row opens; also the row's subtype. */
export const SECTION = { WORK: 'work', REVIEW: 'review', DECIDE: 'decide', GATE: 'gate', TRIAGE: 'triage', ACT: 'act', PREFERENCES: 'preferences' } as const;
export type Section = (typeof SECTION)[keyof typeof SECTION];
export const PROGRAM_SUBTYPE = 'program';

export const RACI = { RESPONSIBLE: 'responsible', ACCOUNTABLE: 'accountable', CONSULTED: 'consulted', INFORMED: 'informed' } as const;

export const HANDOFF_OUTCOMES = [
  { value: 'done', label: 'Done; ready for review' },
  { value: 'partly-done', label: 'Partly done; ready for review' },
  { value: 'blocked', label: 'Blocked; a decision is needed' },
] as const;
export type HandoffOutcome = (typeof HANDOFF_OUTCOMES)[number]['value'];

export const REVIEW_VERDICTS = [
  { value: 'accepted', label: 'Accepted' },
  { value: 'changes-requested', label: 'Changes requested' },
] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number]['value'];

/** The decisions a blocked deliverable offers its reviewer. */
export const BLOCKED_DECISIONS = [
  { value: 'go-ahead', label: 'Go ahead as planned' },
  { value: 'change-course', label: 'Go ahead with changes' },
  { value: 'drop', label: 'Drop it' },
] as const;

/** The decisions a held gate offers the program owner. */
export const HOLD_DECISIONS = [
  { value: 'rework', label: 'Rework the named deliverables' },
  { value: 'skip', label: 'Skip to the next phase' },
  { value: 'stop', label: 'Stop the program' },
] as const;

export const GATE_VERDICTS = [
  { value: 'approve', label: 'Approve' },
  { value: 'hold', label: 'Hold' },
] as const;

export const PROGRAM_CLOSINGS = [
  { value: 'launched', label: 'Launched' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'stalled', label: 'Stalled' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;
export type ProgramOutcome = (typeof PROGRAM_CLOSINGS)[number]['value'];

export const AI_MODES = ['none', 'eligible', 'only'] as const;
export type AiMode = (typeof AI_MODES)[number];
/** The first-right window a work row is held for the AI before people see it. */
export const AI_WINDOW_MINUTES: Record<Exclude<AiMode, 'none'>, number> = { eligible: 240, only: 10080 };

export const PRIORITY = { DECIDE: 1, GATE: 1, WORK: 2, REVIEW: 2, BOARD: 4 } as const;
export const ROW_TIMEOUT = '7d';
export const BOARD_TIMEOUT = '365d';
export const DEFAULT_MAX_ROUNDS = 3;
export const DEFAULT_MAX_GATE_ROUNDS = 3;
export const DEFAULT_GATE_TIMEOUT_HOURS = 168;
export const DEFAULT_ASK_TIMEOUT_HOURS = 168;
export const HEADLINE_MAX_LENGTH = 60;
export const SLUG_PATTERN = '^[a-z0-9][a-z0-9-]{1,63}$';
export const NOTES_MAX_LENGTH = 4000;

/** Edition numbers a program pins when it starts. */
export interface OrgPins {
  roles: number;
  raci: number;
  channels: number;
  'deliverable-types': number;
  programs: number;
}

export interface Asset {
  label: string;
  url: string;
}

/** What a producer leaves for its reviewer, and for whoever works the next round. */
export interface Handoff {
  outcome: HandoffOutcome;
  summary: string;
  blockerQuestion?: string;
  assets?: Asset[];
  decisions?: string;
  openQuestions?: string;
  nextSuggested?: string;
}

export interface Review {
  verdict: ReviewVerdict;
  findings?: string;
}

export interface Decision {
  outcome: string;
  notes?: string;
  rework?: string[];
}

export interface GateSign {
  verdict: (typeof GATE_VERDICTS)[number]['value'];
  notes?: string;
  timedOut?: boolean;
}

export interface Closing {
  outcome: ProgramOutcome;
  summary?: string;
}

export type DeliverableVerdict = 'accepted' | 'dropped' | 'rounds-exhausted' | 'stalled' | 'cancelled';

/** What a finished deliverable adds to its program's board. */
export interface BoardItem {
  key: string;
  kind: string;
  verdict: DeliverableVerdict;
  summary: string;
  round: number;
}

export interface DeliverableType {
  value: string;
  label: string;
  meaning: string;
  producer: string;
  reviewer: string;
  ai: AiMode;
}

export interface PhaseTemplate {
  key: string;
  label: string;
  deliverables: string[];
  gate: string[];
}

export interface ProgramTemplate {
  value: string;
  label: string;
  meaning: string;
  owner: string;
  phases: PhaseTemplate[];
}

export interface DeliverableInput {
  key: string;
  kind: string;
  headline: string;
  brief: string;
  producer: string;
  reviewer: string;
  ai?: AiMode;
  maxRounds?: number;
  program?: string;
  phase?: string;
  /** The board's signal key; set when the deliverable belongs to a program. */
  programSignal?: string;
  pins?: OrgPins;
}

export interface DeliverableResult {
  key: string;
  kind: string;
  verdict: DeliverableVerdict;
  rounds: number;
  handoff?: Handoff;
}

export interface ProgramInput {
  program: string;
  headline: string;
  brief: string;
  template: string;
  gateTimeoutHours?: number;
  maxGateRounds?: number;
}

export interface PhaseResult {
  key: string;
  outcome: 'passed' | 'skipped';
  gateRounds: number;
  deliverables: DeliverableResult[];
}

/** Carried across generations; one phase per generation. */
export interface ProgramState {
  input: ProgramInput;
  pins: OrgPins;
  template: ProgramTemplate;
  types: Record<string, DeliverableType>;
  boardSignal: string;
  boardStarted: boolean;
  phaseIndex: number;
  gateRound: number;
  results: PhaseResult[];
}

export interface ProgramResult {
  program: string;
  outcome: ProgramOutcome;
  phases: PhaseResult[];
}

export interface AskInput {
  seat: string;
  headline: string;
  brief: string;
  options?: string[];
  timeoutHours?: number;
  program?: string;
}

export interface AskResult {
  outcome: 'answered' | 'expired' | 'cancelled';
  decision?: Decision;
  resolvedBy?: string;
}
