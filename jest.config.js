/** @type {import('jest').Config} */
module.exports = {
  // Environment
  testEnvironment: 'node',
  
  // Test patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
    '**/__tests__/**/*.js'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup/setupTests.js'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
  
  // Coverage configuration
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!node_modules/**',
    '!tests/**',
    '!coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    },
    // Critical files need higher coverage
    './src/services/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './src/repositories/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Module paths
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // Test timeout for async operations
  testTimeout: 30000,
  
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Verbose output
  verbose: true,
  
  // Reporter configuration
  reporters: [
    'default',
    ['jest-html-reporter', {
      pageTitle: 'Sistema Votación - Test Report',
      outputPath: './coverage/test-report.html',
      includeFailureMsg: true,
      includeSuiteFailure: true
    }]
  ],
  
  // Transform configuration
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Test environment options
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  }
};