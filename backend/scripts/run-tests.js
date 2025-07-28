#!/usr/bin/env node

/**
 * Comprehensive test runner for Zybra USSD DeFi System
 * Runs all tests with proper setup and teardown
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_CONFIG = {
  timeout: 30000,
  verbose: true,
  coverage: true,
  setupFiles: ['<rootDir>/tests/setup.js'],
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/db/migrations/**',
    '!src/config/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};

// Test suites
const TEST_SUITES = {
  unit: [
    'tests/services/authService.test.js',
    'tests/services/yellowCardService.test.js',
    'tests/services/morphoService.test.js',
    'tests/services/ussdService.test.js',
    'tests/services/smsEngine.test.js',
    'tests/middleware/authMiddleware.test.js',
    'tests/db/models.test.js'
  ],
  integration: [
    'tests/integration/ussd-flow.test.js',
    'tests/integration/investment-flow.test.js',
    'tests/integration/withdrawal-flow.test.js',
    'tests/integration/authentication-flow.test.js'
  ],
  api: [
    'tests/api/auth.test.js',
    'tests/api/ussd.test.js',
    'tests/api/webhooks.test.js',
    'tests/api/transactions.test.js'
  ]
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
  log('\n' + '='.repeat(60), 'cyan');
  log(`  ${message}`, 'bright');
  log('='.repeat(60), 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Check if required files exist
function checkTestFiles() {
  logHeader('Checking Test Files');
  
  const allTests = [
    ...TEST_SUITES.unit,
    ...TEST_SUITES.integration,
    ...TEST_SUITES.api
  ];
  
  const missingFiles = [];
  
  allTests.forEach(testFile => {
    const fullPath = path.join(__dirname, '..', testFile);
    if (!fs.existsSync(fullPath)) {
      missingFiles.push(testFile);
    }
  });
  
  if (missingFiles.length > 0) {
    logWarning(`Missing test files: ${missingFiles.length}`);
    missingFiles.forEach(file => logError(`  - ${file}`));
    return false;
  }
  
  logSuccess(`All ${allTests.length} test files found`);
  return true;
}

// Run Jest with specific configuration
function runJest(testPattern, suiteName) {
  return new Promise((resolve, reject) => {
    const jestArgs = [
      '--testPathPattern=' + testPattern,
      '--verbose',
      '--colors',
      '--coverage',
      '--coverageDirectory=coverage/' + suiteName,
      '--testTimeout=' + TEST_CONFIG.timeout
    ];
    
    logInfo(`Running ${suiteName} tests...`);
    
    const jest = spawn('npx', ['jest', ...jestArgs], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    jest.on('close', (code) => {
      if (code === 0) {
        logSuccess(`${suiteName} tests passed`);
        resolve();
      } else {
        logError(`${suiteName} tests failed with code ${code}`);
        reject(new Error(`Tests failed: ${suiteName}`));
      }
    });
    
    jest.on('error', (error) => {
      logError(`Failed to run ${suiteName} tests: ${error.message}`);
      reject(error);
    });
  });
}

// Run specific test suite
async function runTestSuite(suiteName) {
  if (!TEST_SUITES[suiteName]) {
    throw new Error(`Unknown test suite: ${suiteName}`);
  }
  
  const testPattern = TEST_SUITES[suiteName].join('|');
  await runJest(testPattern, suiteName);
}

// Run all test suites
async function runAllTests() {
  logHeader('Running All Test Suites');
  
  const results = {
    passed: [],
    failed: []
  };
  
  for (const [suiteName, tests] of Object.entries(TEST_SUITES)) {
    try {
      await runTestSuite(suiteName);
      results.passed.push(suiteName);
    } catch (error) {
      results.failed.push({ suite: suiteName, error: error.message });
    }
  }
  
  // Summary
  logHeader('Test Results Summary');
  
  if (results.passed.length > 0) {
    logSuccess(`Passed suites (${results.passed.length}):`);
    results.passed.forEach(suite => log(`  ✅ ${suite}`, 'green'));
  }
  
  if (results.failed.length > 0) {
    logError(`Failed suites (${results.failed.length}):`);
    results.failed.forEach(({ suite, error }) => {
      log(`  ❌ ${suite}: ${error}`, 'red');
    });
  }
  
  const totalSuites = results.passed.length + results.failed.length;
  const successRate = Math.round((results.passed.length / totalSuites) * 100);
  
  log(`\nOverall Success Rate: ${successRate}%`, successRate === 100 ? 'green' : 'yellow');
  
  return results.failed.length === 0;
}

// Generate test coverage report
async function generateCoverageReport() {
  logHeader('Generating Coverage Report');
  
  return new Promise((resolve, reject) => {
    const jest = spawn('npx', ['jest', '--coverage', '--coverageReporters=html', '--coverageReporters=text'], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    jest.on('close', (code) => {
      if (code === 0) {
        logSuccess('Coverage report generated in coverage/ directory');
        logInfo('Open coverage/index.html in your browser to view detailed report');
        resolve();
      } else {
        logError('Failed to generate coverage report');
        reject(new Error('Coverage generation failed'));
      }
    });
  });
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';
  
  logHeader('Zybra USSD DeFi System - Test Runner');
  
  try {
    // Check test files exist
    if (!checkTestFiles()) {
      process.exit(1);
    }
    
    switch (command) {
      case 'unit':
      case 'integration':
      case 'api':
        await runTestSuite(command);
        break;
        
      case 'coverage':
        await generateCoverageReport();
        break;
        
      case 'all':
      default:
        const success = await runAllTests();
        if (!success) {
          process.exit(1);
        }
        break;
    }
    
    logSuccess('All tests completed successfully! 🎉');
    
  } catch (error) {
    logError(`Test execution failed: ${error.message}`);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  log('\nTest execution interrupted by user', 'yellow');
  process.exit(130);
});

process.on('SIGTERM', () => {
  log('\nTest execution terminated', 'yellow');
  process.exit(143);
});

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  runTestSuite,
  runAllTests,
  generateCoverageReport,
  TEST_SUITES,
  TEST_CONFIG
};
