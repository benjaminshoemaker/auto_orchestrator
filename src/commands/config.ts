import { logger } from '../utils/logger.js';

export interface ConfigOptions {
  dir?: string;
  set?: string;
  get?: string;
}

export async function configCommand(options: ConfigOptions): Promise<void> {
  logger.info(`Command config not implemented`);
  logger.verbose(`Options: ${JSON.stringify(options)}`);
}
