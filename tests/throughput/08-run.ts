/**
 * 08-run — Single-command orchestrator for the ortho pipeline simulation.
 *
 * Spawns the enqueuer, then launches all 4 day resolvers sharing
 * the same RUN_ID and config. All output is prefixed with role tags.
 * Ctrl-C kills everything.
 *
 * Usage:
 *   npm run ortho:run
 *   DAILY_VOLUME=600 BASELINE_HOURS=1 COMPRESSION_HOURS=0.025 BATCHES=5 PRINTER_SETS=3 npm run ortho:run
 */

import { spawn, ChildProcess } from 'child_process';

// RESUME=<runId> skips the enqueuer and resumes day resolvers for an existing run.
const RESUME = process.env.RESUME || '';
const RUN_ID = RESUME || Math.floor(Date.now() / 1000).toString();

const env = {
  ...process.env,
  RUN_ID,
  DAILY_VOLUME:      process.env.DAILY_VOLUME || '500',
  BASELINE_HOURS:    process.env.BASELINE_HOURS || '8',
  COMPRESSION_HOURS: process.env.COMPRESSION_HOURS || '1',
  BATCHES:           process.env.BATCHES || '5',
  PRINTER_SETS:      process.env.PRINTER_SETS || '3',
  MIN_HOLD_S:        process.env.MIN_HOLD_S || '5',
};

const children: ChildProcess[] = [];

function launch(tag: string, args: string[], extraEnv: Record<string, string> = {}): ChildProcess {
  const child = spawn('npx', ['ts-node', ...args], {
    env: { ...env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const prefix = `[${tag}] `;

  child.stdout?.on('data', (data: Buffer) => {
    for (const line of data.toString().split('\n')) {
      if (line) process.stdout.write(prefix + line + '\n');
    }
  });

  child.stderr?.on('data', (data: Buffer) => {
    for (const line of data.toString().split('\n')) {
      if (line) process.stderr.write(prefix + line + '\n');
    }
  });

  children.push(child);
  return child;
}

function cleanup() {
  console.log('\n[orchestrator] Shutting down...');
  for (const child of children) {
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function main() {
  console.log(`[orchestrator] RUN_ID=${RUN_ID}${RESUME ? ' (RESUME)' : ''}`);
  console.log(`[orchestrator] Config: DAILY_VOLUME=${env.DAILY_VOLUME} BASELINE_HOURS=${env.BASELINE_HOURS} COMPRESSION_HOURS=${env.COMPRESSION_HOURS} BATCHES=${env.BATCHES} PRINTER_SETS=${env.PRINTER_SETS}`);

  if (RESUME) {
    console.log(`[orchestrator] Resume mode — skipping enqueuer, starting all day resolvers.\n`);
  } else {
    console.log(`[orchestrator] Launching enqueuer + 4 day resolvers...\n`);
    launch('enqueue', ['tests/throughput/08-enqueue.ts']);
  }

  // Launch day resolvers
  for (let day = 1; day <= 4; day++) {
    launch(`day${day}`, ['tests/throughput/08-day-resolver.ts'], { DAY: String(day) });
  }

  console.log(`[orchestrator] All 5 processes running. Ctrl-C to stop.\n`);

  // Wait for all children to exit
  const exits = children.map((child) =>
    new Promise<number>((resolve) => child.on('exit', (code) => resolve(code ?? 0))),
  );
  const codes = await Promise.all(exits);

  console.log(`\n[orchestrator] All processes finished (exit codes: ${codes.join(', ')})`);
  process.exit(codes.every((c) => c === 0) ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
