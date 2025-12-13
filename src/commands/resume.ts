import { logger } from '../utils/logger.js';

export interface ResumeOptions {
  dir?: string;
}

export async function resumeCommand(options: ResumeOptions): Promise<void> {
  logger.info(`Command resume not implemented`);
  logger.verbose(`Options: ${JSON.stringify(options)}`);
}
