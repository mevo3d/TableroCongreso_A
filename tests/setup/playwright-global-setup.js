/**
 * Playwright Global Setup
 * Starts the server and prepares test environment
 */

const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

async function globalSetup() {
  console.log('🚀 Starting Playwright global setup...');

  // Ensure test directories exist
  await fs.ensureDir(path.join(__dirname, '../auth'));
  await fs.ensureDir(path.join(__dirname, '../data'));

  // Setup test database
  const { setupTestDatabase } = require('./setupTestDatabase');
  await setupTestDatabase();
  console.log('✅ Test database setup complete');

  // Start the server
  console.log('🌐 Starting test server...');
  const serverProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '../..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '3000',
      DB_PATH: './tests/data/test_votacion.db',
      JWT_SECRET: 'test-secret-key-12345'
    },
    detached: false,
    stdio: 'pipe'
  });

  // Wait for server to start
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      reject(new Error('Server failed to start within 30 seconds'));
    }, 30000);

    serverProcess.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('✅ Base de datos inicializada') || output.includes('Server running on port')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('Server error:', data.toString());
    });

    serverProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    serverProcess.on('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Server process exited with code ${code}`));
      }
    });
  });

  console.log('✅ Test server started');

  // Create authentication states for different user types
  await createAuthStates();

  // Store server process for cleanup
  global.__SERVER_PROCESS__ = serverProcess;

  console.log('✅ Playwright global setup complete');
}

async function createAuthStates() {
  console.log('🔐 Creating authentication states...');

  const browser = await chromium.launch();
  const baseURL = 'http://localhost:3000';

  const users = [
    { 
      username: 'test.diputado1', 
      password: '123456', 
      role: 'diputado',
      authFile: 'tests/auth/diputado.json'
    },
    { 
      username: 'test.operador', 
      password: '123456', 
      role: 'operador',
      authFile: 'tests/auth/operador.json'
    },
    { 
      username: 'test.secretario', 
      password: '123456', 
      role: 'secretario',
      authFile: 'tests/auth/secretario.json'
    },
    { 
      username: 'test.superadmin', 
      password: '123456', 
      role: 'superadmin',
      authFile: 'tests/auth/superadmin.json'
    }
  ];

  for (const user of users) {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Navigate to login page
      await page.goto(baseURL);
      
      // Wait for login form
      await page.waitForSelector('#login-form', { timeout: 10000 });

      // Fill login form
      await page.fill('#username', user.username);
      await page.fill('#password', user.password);
      
      // Submit login
      await page.click('#login-button');
      
      // Wait for successful login (redirect or dashboard)
      await page.waitForURL(/\/(diputado|operador|secretario|superadmin)/, { timeout: 10000 });
      
      // Save authentication state
      await context.storageState({ path: user.authFile });
      
      console.log(`✅ Created auth state for ${user.role}`);

    } catch (error) {
      console.error(`❌ Failed to create auth state for ${user.username}:`, error.message);
    }

    await context.close();
  }

  await browser.close();
  console.log('✅ Authentication states created');
}

module.exports = globalSetup;