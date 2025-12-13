import { logger } from '../utils/logger.js';

export interface SkipOptions {
  dir?: string;
  reason: string;
}

export async function skipCommand(taskId: string, options: SkipOptions): Promise<void> {
  logger.info(`Command skip not implemented`);
  logger.verbose(`Task ID: ${taskId}`);
  logger.verbose(`Options: ${JSON.stringify(options)}`);
}
