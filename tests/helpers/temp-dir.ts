import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TEST_TMP_DIR = path.join(PROJECT_ROOT, '.test-tmp');

export async function createTestTempDir(prefix: string): Promise<string> {
  await fs.mkdir(TEST_TMP_DIR, { recursive: true });
  return fs.mkdtemp(path.join(TEST_TMP_DIR, prefix));
}
