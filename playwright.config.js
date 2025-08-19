// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './tests/e2e',
  
  /* Run tests in files in parallel */
  fullyParallel: false, // Disable for legislative system to avoid conflicts
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  
  /* Workers for parallel execution */
  workers: process.env.CI ? 1 : 2,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['line']
  ],
  
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',
    
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* Timeout for each action */
    actionTimeout: 10000,
    
    /* Timeout for navigation */
    navigationTimeout: 30000
  },

  /* Global setup to start server */
  globalSetup: require.resolve('./tests/setup/playwright-global-setup.js'),
  globalTeardown: require.resolve('./tests/setup/playwright-global-teardown.js'),

  /* Configure projects for major browsers */
  projects: [
    // Setup project
    {
      name: 'setup',
      testMatch: /.*\.setup\.js/,
      teardown: 'cleanup'
    },
    
    // Cleanup project
    {
      name: 'cleanup',
      testMatch: /.*\.teardown\.js/
    },

    // Chrome/Chromium tests
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Use auth state for logged in tests
        storageState: 'tests/auth/diputado.json'
      },
      dependencies: ['setup']
    },

    // Firefox tests
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        storageState: 'tests/auth/operador.json'
      },
      dependencies: ['setup']
    },

    // WebKit/Safari tests
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        storageState: 'tests/auth/secretario.json'
      },
      dependencies: ['setup']
    },

    // Mobile Chrome
    {
      name: 'Mobile Chrome',
      use: { 
        ...devices['Pixel 5'],
        storageState: 'tests/auth/diputado.json'
      },
      dependencies: ['setup']
    },

    // Tablet tests
    {
      name: 'iPad',
      use: { 
        ...devices['iPad Pro'],
        storageState: 'tests/auth/diputado.json'
      },
      dependencies: ['setup']
    },

    // Anonymous tests (no auth)
    {
      name: 'anonymous',
      use: { 
        ...devices['Desktop Chrome']
        // No storageState for anonymous tests
      },
      testMatch: /.*\.anonymous\.spec\.js/
    }
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 minutes
    env: {
      NODE_ENV: 'test'
    }
  },

  /* Output directories */
  outputDir: 'test-results',
  
  /* Test timeout */
  timeout: 60 * 1000, // 1 minute per test
  
  /* Expect timeout */
  expect: {
    timeout: 10 * 1000 // 10 seconds
  }
});