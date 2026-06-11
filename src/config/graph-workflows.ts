import type { LTStartConfig } from '@hotmeshio/long-tail';

type LTGraphWorkflowConfig = NonNullable<LTStartConfig['graphWorkflows']>[number];

/**
 * Hello World graph flow — the graph-form peer of the helloWorkflow durable workflow.
 *
 * Three-step DAG:
 *   1. trigger  — assembles the greeting, maps name / sleepSeconds / _scope into job data
 *   2. sleeper  — durable timer: blocks for sleepSeconds (mirrors Durable.workflow.sleep)
 *   3. echo     — surfaces the IAM identity context (_scope) in the output
 *
 * No MCP tools, no LLM — pure HotMesh YAML. Register via the `graphWorkflows` key in
 * the `start()` config. Long Tail creates, deploys, and activates the flow at startup;
 * subsequent boots detect YAML version changes and redeploy automatically.
 */
const HELLO_WORLD_YAML = `
app:
  id: graph
  version: '1'
  graphs:
    - subscribes: hello_world
      publishes: hello_world.done
      expire: 120
      input:
        schema:
          type: object
          properties:
            name:
              type: string
              description: Who to greet
              default: world
            sleepSeconds:
              type: number
              description: Pause duration before the echo step
              default: 1
      output:
        schema:
          type: object
          properties:
            greeting:
              type: string
              description: The assembled greeting
            identity:
              type: object
              description: IAM identity context carried through _scope
      activities:
        trigger:
          title: Greet
          type: trigger
          job:
            maps:
              name: '{$self.input.data.name}'
              sleepSeconds:
                '@pipe':
                  - ['{$self.input.data.sleepSeconds}', 1]
                  - ['{@conditional.nullish}']
              _scope: '{$self.input.data._scope}'
              greeting:
                '@pipe':
                  - ['Hello, ', '{$self.input.data.name}', '!']
                  - ['{@string.concat}']
        sleeper:
          title: Pause
          type: hook
          sleep: '{$job.data.sleepSeconds}'
        echo:
          title: Echo
          type: hook
          job:
            maps:
              identity: '{$job.data._scope}'
      transitions:
        trigger:
          - to: sleeper
        sleeper:
          - to: echo
`;

export const GRAPH_WORKFLOWS: LTGraphWorkflowConfig[] = [
  {
    name: 'hello_world',
    description: 'Greets a name with a message the graph assembles as it runs.',
    namespace: 'graph',
    yaml: HELLO_WORLD_YAML,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Who to greet', default: 'world' },
        sleepSeconds: { type: 'number', description: 'Pause duration before the echo step', default: 1 },
      },
      required: ['name'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        greeting: { type: 'string', description: 'The assembled greeting' },
        identity: { type: 'object', description: 'IAM identity context carried through _scope' },
      },
    },
    tags: ['example', 'hello-world'],
  },
];
