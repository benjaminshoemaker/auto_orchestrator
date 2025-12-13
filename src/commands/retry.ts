import { logger } from '../utils/logger.js';

export interface RetryOptions {
  dir?: string;
}

export async function retryCommand(taskId: string, options: RetryOptions): Promise<void> {
  logger.info(`Command retry not implemented`);
  logger.verbose(`Task ID: ${taskId}`);
  logger.verbose(`Options: ${JSON.stringify(options)}`);
}
