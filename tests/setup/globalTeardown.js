/**
 * Jest Global Teardown
 * Runs once after all tests
 */

const fs = require('fs-extra');
const path = require('path');

module.exports = async () => {
  console.log('🧹 Starting global test cleanup...');
  
  try {
    // Clean up test database
    const testDbPath = path.join(process.cwd(), 'tests/data/test_votacion.db');
    if (await fs.pathExists(testDbPath)) {
      await fs.remove(testDbPath);
      console.log('✅ Test database cleaned up');
    }
    
    // Clean up test uploads
    const testUploadsPath = path.join(process.cwd(), 'tests/uploads');
    if (await fs.pathExists(testUploadsPath)) {
      await fs.emptyDir(testUploadsPath);
      console.log('✅ Test uploads cleaned up');
    }
    
    // Clean up test logs
    const testLogsPath = path.join(process.cwd(), 'tests/logs');
    if (await fs.pathExists(testLogsPath)) {
      await fs.emptyDir(testLogsPath);
      console.log('✅ Test logs cleaned up');
    }
    
    console.log('✅ Global test cleanup complete');
    
  } catch (error) {
    console.error('❌ Error during global teardown:', error);
    // Don't throw - we want tests to complete even if cleanup fails
  }
};