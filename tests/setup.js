/**
 * Jest Global Setup
 * Runs once before all tests
 * Sets up a separate test database
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

export default async function globalSetup() {
  // Use a separate test database
  const testDbPath = path.join(projectRoot, 'prisma', 'test.db');

  // Remove old test database if it exists
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  // Set the test database URL
  process.env.DATABASE_URL = `file:${testDbPath}`;

  // Store it for other processes
  process.env.TEST_DATABASE_URL = process.env.DATABASE_URL;

  console.log('\n Setting up test database...');

  // Run prisma db push to create the test database schema
  try {
    execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
      },
      stdio: 'pipe',
    });
    console.log('Test database created\n');
  } catch (error) {
    console.error('Failed to create test database:', error.message);
    throw error;
  }
}
