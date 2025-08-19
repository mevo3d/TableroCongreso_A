/**
 * Playwright Global Teardown
 * Cleans up after all tests
 */

const fs = require('fs-extra');
const path = require('path');

async function globalTeardown() {
  console.log('🧹 Starting Playwright global teardown...');

  try {
    // Stop the server process
    if (global.__SERVER_PROCESS__) {
      console.log('🛑 Stopping test server...');
      global.__SERVER_PROCESS__.kill('SIGTERM');
      
      // Give it time to shut down gracefully
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Force kill if still running
      try {
        global.__SERVER_PROCESS__.kill('SIGKILL');
      } catch (e) {
        // Process already dead
      }
      
      console.log('✅ Test server stopped');
    }

    // Clean up auth states
    const authDir = path.join(__dirname, '../auth');
    if (await fs.pathExists(authDir)) {
      await fs.emptyDir(authDir);
      console.log('✅ Authentication states cleaned up');
    }

    // Clean up test database
    const testDbPath = path.join(__dirname, '../data/test_votacion.db');
    if (await fs.pathExists(testDbPath)) {
      await fs.remove(testDbPath);
      console.log('✅ Test database cleaned up');
    }

    console.log('✅ Playwright global teardown complete');

  } catch (error) {
    console.error('❌ Error during Playwright teardown:', error.message);
  }
}

module.exports = globalTeardown;