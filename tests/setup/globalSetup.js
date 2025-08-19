/**
 * Jest Global Setup
 * Runs once before all tests
 */

const fs = require('fs-extra');
const path = require('path');
const { setupTestDatabase } = require('./setupTestDatabase');

module.exports = async () => {
  console.log('🚀 Starting global test setup...');
  
  // Ensure test directories exist
  const testDirs = [
    'tests/data',
    'tests/logs',
    'tests/uploads',
    'tests/auth',
    'coverage'
  ];
  
  for (const dir of testDirs) {
    await fs.ensureDir(path.join(process.cwd(), dir));
  }
  
  // Setup test database
  try {
    await setupTestDatabase();
    console.log('✅ Test database setup complete');
  } catch (error) {
    console.error('❌ Failed to setup test database:', error);
    throw error;
  }
  
  // Set global test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key-12345';
  process.env.DB_PATH = './tests/data/test_votacion.db';
  process.env.PORT = '3001'; // Different port for tests
  
  console.log('✅ Global test setup complete');
};