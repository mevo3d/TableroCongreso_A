#!/usr/bin/env node

/**
 * Comprehensive Test Runner
 * Executes all test suites with proper reporting
 */

const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

class TestRunner {
  constructor() {
    this.results = {
      unit: null,
      integration: null,
      e2e: null,
      performance: null,
      security: null,
      startTime: Date.now(),
      endTime: null
    };
    
    this.config = {
      generateReports: process.argv.includes('--reports'),
      verbose: process.argv.includes('--verbose'),
      skipE2E: process.argv.includes('--skip-e2e'),
      skipPerformance: process.argv.includes('--skip-performance'),
      parallel: !process.argv.includes('--sequential')
    };
  }

  async run() {
    console.log('🚀 Starting comprehensive test execution...\n');
    
    try {
      // Setup test environment
      await this.setupEnvironment();
      
      // Run test suites
      await this.runUnitTests();
      await this.runIntegrationTests();
      
      if (!this.config.skipE2E) {
        await this.runE2ETests();
      }
      
      if (!this.config.skipPerformance) {
        await this.runPerformanceTests();
      }
      
      await this.runSecurityTests();
      
      // Generate final report
      await this.generateFinalReport();
      
    } catch (error) {
      console.error('❌ Test execution failed:', error.message);
      process.exit(1);
    }
  }

  async setupEnvironment() {
    console.log('🔧 Setting up test environment...');
    
    // Ensure test directories exist
    await fs.ensureDir('tests/data');
    await fs.ensureDir('coverage');
    await fs.ensureDir('test-results');
    
    // Set environment variables
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-key-12345';
    process.env.DB_PATH = './tests/data/test_votacion.db';
    
    console.log('✅ Test environment ready\n');
  }

  async runUnitTests() {
    console.log('🧪 Running Unit Tests...');
    
    const result = await this.executeCommand('npm', ['run', 'test:unit']);
    this.results.unit = result;
    
    this.logTestResult('Unit Tests', result);
  }

  async runIntegrationTests() {
    console.log('🔗 Running Integration Tests...');
    
    const result = await this.executeCommand('npm', ['run', 'test:integration']);
    this.results.integration = result;
    
    this.logTestResult('Integration Tests', result);
  }

  async runE2ETests() {
    console.log('🎭 Running E2E Tests...');
    
    try {
      // Install Playwright browsers if needed
      await this.executeCommand('npx', ['playwright', 'install', '--with-deps']);
      
      const result = await this.executeCommand('npm', ['run', 'test:e2e']);
      this.results.e2e = result;
      
      this.logTestResult('E2E Tests', result);
      
    } catch (error) {
      console.warn('⚠️ E2E Tests failed, but continuing with other tests');
      this.results.e2e = { success: false, error: error.message };
    }
  }

  async runPerformanceTests() {
    console.log('⚡ Running Performance Tests...');
    
    const result = await this.executeCommand('npm', ['run', 'test:performance']);
    this.results.performance = result;
    
    this.logTestResult('Performance Tests', result);
  }

  async runSecurityTests() {
    console.log('🔒 Running Security Tests...');
    
    const result = await this.executeCommand('npm', ['run', 'test:security']);
    this.results.security = result;
    
    this.logTestResult('Security Tests', result);
  }

  async executeCommand(command, args) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const process = spawn(command, args, {
        stdio: this.config.verbose ? 'inherit' : 'pipe',
        shell: true
      });

      let output = '';
      let errorOutput = '';

      if (!this.config.verbose) {
        process.stdout?.on('data', (data) => {
          output += data.toString();
        });

        process.stderr?.on('data', (data) => {
          errorOutput += data.toString();
        });
      }

      process.on('close', (code) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        resolve({
          success: code === 0,
          exitCode: code,
          duration,
          output: output.trim(),
          errorOutput: errorOutput.trim()
        });
      });

      process.on('error', (error) => {
        resolve({
          success: false,
          error: error.message,
          duration: Date.now() - startTime
        });
      });
    });
  }

  logTestResult(testName, result) {
    const status = result.success ? '✅' : '❌';
    const duration = `(${(result.duration / 1000).toFixed(2)}s)`;
    
    console.log(`${status} ${testName} ${duration}`);
    
    if (!result.success && this.config.verbose) {
      console.log('Error Output:', result.errorOutput || result.error);
    }
    
    console.log('');
  }

  async generateFinalReport() {
    this.results.endTime = Date.now();
    const totalDuration = this.results.endTime - this.results.startTime;
    
    console.log('📊 Test Execution Summary');
    console.log('═══════════════════════════');
    
    const testSuites = [
      { name: 'Unit Tests', result: this.results.unit },
      { name: 'Integration Tests', result: this.results.integration },
      { name: 'E2E Tests', result: this.results.e2e },
      { name: 'Performance Tests', result: this.results.performance },
      { name: 'Security Tests', result: this.results.security }
    ].filter(suite => suite.result !== null);

    let totalTests = 0;
    let passedTests = 0;

    testSuites.forEach(suite => {
      const status = suite.result.success ? '✅ PASS' : '❌ FAIL';
      const duration = `${(suite.result.duration / 1000).toFixed(2)}s`;
      
      console.log(`${suite.name}: ${status} (${duration})`);
      
      totalTests++;
      if (suite.result.success) passedTests++;
    });

    console.log('');
    console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`Test Suites: ${passedTests}/${totalTests} passed`);
    
    const overallSuccess = passedTests === totalTests;
    console.log(`Overall Result: ${overallSuccess ? '✅ SUCCESS' : '❌ FAILURE'}`);

    // Generate JSON report if requested
    if (this.config.generateReports) {
      await this.saveJsonReport();
    }

    // Exit with appropriate code
    process.exit(overallSuccess ? 0 : 1);
  }

  async saveJsonReport() {
    const report = {
      summary: {
        startTime: new Date(this.results.startTime).toISOString(),
        endTime: new Date(this.results.endTime).toISOString(),
        totalDuration: this.results.endTime - this.results.startTime,
        overallSuccess: Object.values(this.results).every(r => r === null || r.success)
      },
      testSuites: {
        unit: this.results.unit,
        integration: this.results.integration,
        e2e: this.results.e2e,
        performance: this.results.performance,
        security: this.results.security
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        timestamp: new Date().toISOString()
      }
    };

    const reportPath = path.join('test-results', 'comprehensive-test-report.json');
    await fs.ensureDir(path.dirname(reportPath));
    await fs.writeJson(reportPath, report, { spaces: 2 });
    
    console.log(`📋 Detailed report saved to: ${reportPath}`);
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new TestRunner();
  runner.run().catch(console.error);
}

module.exports = TestRunner;