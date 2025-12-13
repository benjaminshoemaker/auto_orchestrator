import { logger } from '../utils/logger.js';

export interface InitOptions {
  dir?: string;
  name?: string;
}

export async function initCommand(idea: string, options: InitOptions): Promise<void> {
  logger.info(`Command init not implemented`);
  logger.verbose(`Idea: ${idea}`);
  logger.verbose(`Options: ${JSON.stringify(options)}`);
}
