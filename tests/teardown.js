/**
 * Jest Global Teardown
 * Runs once after all tests
 * Cleans up the test database
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

export default async function globalTeardown() {
  const testDbPath = path.join(projectRoot, 'prisma', 'test.db');
  const testDbJournalPath = path.join(projectRoot, 'prisma', 'test.db-journal');

  console.log('\n Cleaning up test database...');

  // Remove test database files
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  if (fs.existsSync(testDbJournalPath)) {
    fs.unlinkSync(testDbJournalPath);
  }

  console.log('Test database removed\n');
}
