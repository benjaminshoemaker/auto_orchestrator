import { logger } from '../utils/logger.js';

export interface StatusOptions {
  dir?: string;
  json?: boolean;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  logger.info(`Command status not implemented`);
  logger.verbose(`Options: ${JSON.stringify(options)}`);
}
