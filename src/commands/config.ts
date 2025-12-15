import { findProjectRoot } from '../utils/project.js';
import { DocumentManager } from '../lib/documents.js';
import { StateManager } from '../lib/state/state-manager.js';
import * as terminal from '../lib/ui/terminal.js';
import { DEFAULT_CONFIG } from '../types/index.js';

export interface ConfigOptions {
  dir?: string;
  set?: string;
  get?: string;
}

// Configurable keys and their types
const CONFIG_KEYS: Record<string, { type: 'number' | 'boolean' | 'string'; path: string[] }> = {
  'agent.timeout_minutes': { type: 'number', path: ['agent', 'timeout_minutes'] },
};

export async function configCommand(options: ConfigOptions): Promise<void> {
  const projectDir = findProjectRoot(options.dir);
  if (!projectDir) {
    terminal.printError('Not in an orchestrator project.');
    process.exit(1);
  }

  const documentManager = new DocumentManager(projectDir);
  const stateManager = new StateManager(documentManager, projectDir);
  await stateManager.load();

  const project = stateManager.getProject();

  // Handle set option: "key=value"
  if (options.set) {
    const [key, ...valueParts] = options.set.split('=');
    const value = valueParts.join('=');

    if (!key || value === undefined) {
      terminal.printError('Invalid format. Use: --set key=value');
      process.exit(1);
    }

    const configDef = CONFIG_KEYS[key];
    if (!configDef) {
      terminal.printError(`Unknown config key: ${key}`);
      terminal.printInfo(`Available keys: ${Object.keys(CONFIG_KEYS).join(', ')}`);
      process.exit(1);
    }

    // Parse and validate value
    let parsedValue: number | boolean | string;
    switch (configDef.type) {
      case 'number':
        parsedValue = Number(value);
        if (isNaN(parsedValue)) {
          terminal.printError(`Invalid number: ${value}`);
          process.exit(1);
        }
        break;
      case 'boolean':
        parsedValue = value.toLowerCase() === 'true';
        break;
      default:
        parsedValue = value;
    }

    // Update meta (only agent config for now)
    if (key === 'agent.timeout_minutes') {
      await documentManager.updateProjectMeta({
        agent: {
          ...project.meta.agent,
          timeout_minutes: parsedValue as number,
        },
      });
    }

    terminal.printSuccess(`Set ${key} = ${parsedValue}`);
    return;
  }

  // Handle get option
  if (options.get) {
    const key = options.get;
    const configDef = CONFIG_KEYS[key];
    if (!configDef) {
      terminal.printError(`Unknown config key: ${key}`);
      terminal.printInfo(`Available keys: ${Object.keys(CONFIG_KEYS).join(', ')}`);
      process.exit(1);
    }

    // Get nested value
    let value: unknown = project.meta;
    for (const pathPart of configDef.path) {
      value = (value as Record<string, unknown>)?.[pathPart];
    }

    console.log(value);
    return;
  }

  // Default: show all config
  terminal.printHeader('Project Configuration');

  terminal.printSection('Project', [
    `Name: ${project.meta.project_name}`,
    `ID: ${project.meta.project_id}`,
    `Phase: ${project.meta.current_phase_name}`,
    `Status: ${project.meta.phase_status}`,
  ].join('\n'));

  terminal.printSection('Agent', [
    `Primary: ${project.meta.agent.primary}`,
    `Timeout: ${project.meta.agent.timeout_minutes} minutes`,
  ].join('\n'));

  terminal.printSection('Cost', [
    `Total tokens: ${project.meta.cost.total_tokens.toLocaleString()}`,
    `Total cost: $${project.meta.cost.total_cost_usd.toFixed(4)}`,
  ].join('\n'));

  terminal.printSection('Defaults (not persisted)', [
    `Git enabled: ${DEFAULT_CONFIG.git.enabled}`,
    `Git auto-commit: ${DEFAULT_CONFIG.git.auto_commit}`,
    `Git branch prefix: ${DEFAULT_CONFIG.git.branch_prefix}`,
    `LLM provider: ${DEFAULT_CONFIG.llm.provider}`,
    `LLM model: ${DEFAULT_CONFIG.llm.model}`,
    `LLM max tokens: ${DEFAULT_CONFIG.llm.max_tokens}`,
  ].join('\n'));

  terminal.printInfo('\nUse --set key=value to update config.');
  terminal.printInfo(`Available keys: ${Object.keys(CONFIG_KEYS).join(', ')}`);
}
