#!/usr/bin/env node

/**
 * Zybra SMS/USSD System Test Script
 * This script tests the core functionality of the system
 */

const axios = require('axios');
const colors = require('colors');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_PHONE = process.env.TEST_PHONE || '254712345678';
const TEST_PHONE_2 = process.env.TEST_PHONE_2 || '254787654321';

// Test results tracking
let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

// Helper functions
const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`);
const success = (message) => console.log(colors.green(`✅ ${message}`));
const error = (message) => console.log(colors.red(`❌ ${message}`));
const info = (message) => console.log(colors.blue(`ℹ️  ${message}`));
const warning = (message) => console.log(colors.yellow(`⚠️  ${message}`));

// Test runner
async function runTest(testName, testFunction) {
  testResults.total++;
  log(`Running test: ${testName}`);
  
  try {
    await testFunction();
    testResults.passed++;
    success(`${testName} - PASSED`);
  } catch (err) {
    testResults.failed++;
    error(`${testName} - FAILED: ${err.message}`);
  }
  
  console.log(''); // Empty line for readability
}

// API helper
async function apiCall(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (err) {
    throw new Error(`API call failed: ${err.response?.data?.error || err.message}`);
  }
}

// Test functions
async function testHealthCheck() {
  const response = await apiCall('GET', '/health');
  if (response.status !== 'OK') {
    throw new Error('Health check failed');
  }
}

async function testSMSSending() {
  const response = await apiCall('POST', '/api/sms/send', {
    phoneNumber: TEST_PHONE,
    message: 'Test message from Zybra system test',
    from: 'ZYBRA'
  });
  
  if (!response.success) {
    throw new Error('SMS sending failed');
  }
}

async function testUSSDSimulation() {
  // Simulate USSD session
  const sessionId = `TEST_${Date.now()}`;
  
  // Test main menu
  const mainMenuResponse = await apiCall('POST', '/api/ussd', {
    sessionId,
    serviceCode: '*384*96#',
    phoneNumber: TEST_PHONE,
    text: ''
  });
  
  if (!mainMenuResponse.includes('Welcome')) {
    throw new Error('USSD main menu test failed');
  }
  
  // Test balance check
  const balanceResponse = await apiCall('POST', '/api/ussd', {
    sessionId,
    serviceCode: '*384*96#',
    phoneNumber: TEST_PHONE,
    text: '1'
  });
  
  if (!balanceResponse.includes('Balance')) {
    throw new Error('USSD balance check test failed');
  }
}

async function testUserCreation() {
  // This would typically be done through USSD, but we'll test the underlying service
  const walletService = require('./backend/src/services/walletService');
  
  try {
    const user = await walletService.createUserWallet(TEST_PHONE);
    if (!user.wallet_address) {
      throw new Error('User wallet creation failed');
    }
  } catch (err) {
    // User might already exist, which is fine for testing
    if (!err.message.includes('already exists')) {
      throw err;
    }
  }
}

async function testTransactionHistory() {
  const response = await apiCall('GET', `/api/transactions/history/${TEST_PHONE}?limit=5`);
  
  if (!response.success) {
    throw new Error('Transaction history retrieval failed');
  }
}

async function testOTPGeneration() {
  const response = await apiCall('POST', '/api/sms/otp', {
    phoneNumber: TEST_PHONE
  });
  
  if (!response.success) {
    throw new Error('OTP generation failed');
  }
}

async function testWebhookEndpoints() {
  // Test webhook verification
  const response = await apiCall('GET', '/api/webhooks/verify?challenge=test123');
  
  if (response !== 'test123') {
    throw new Error('Webhook verification failed');
  }
}

async function testSystemStats() {
  // Test SMS stats
  const smsStats = await apiCall('GET', '/api/sms/stats');
  if (!smsStats.success) {
    throw new Error('SMS stats retrieval failed');
  }
  
  // Test USSD stats
  const ussdStats = await apiCall('GET', '/api/ussd/stats');
  if (!ussdStats.success) {
    throw new Error('USSD stats retrieval failed');
  }
  
  // Test transaction stats
  const txStats = await apiCall('GET', '/api/transactions/stats/overview');
  if (!txStats.success) {
    throw new Error('Transaction stats retrieval failed');
  }
}

async function testDatabaseConnection() {
  // Test by trying to get user data
  try {
    const { User } = require('./backend/src/db/models');
    await User.findByPhone(TEST_PHONE);
    // If no error, database connection is working
  } catch (err) {
    if (err.message.includes('connect')) {
      throw new Error('Database connection failed');
    }
    // Other errors are fine (like user not found)
  }
}

async function testRedisConnection() {
  try {
    const redisClient = require('./backend/src/db/redisClient');
    await redisClient.set('test_key', 'test_value');
    const value = await redisClient.get('test_key');
    
    if (value !== 'test_value') {
      throw new Error('Redis read/write test failed');
    }
    
    await redisClient.del('test_key');
  } catch (err) {
    throw new Error(`Redis connection failed: ${err.message}`);
  }
}

// Main test suite
async function runAllTests() {
  console.log(colors.cyan('🚀 Starting Zybra SMS/USSD System Tests\n'));
  
  // Basic connectivity tests
  await runTest('Health Check', testHealthCheck);
  await runTest('Database Connection', testDatabaseConnection);
  await runTest('Redis Connection', testRedisConnection);
  
  // Core functionality tests
  await runTest('User Creation', testUserCreation);
  await runTest('SMS Sending', testSMSSending);
  await runTest('USSD Simulation', testUSSDSimulation);
  await runTest('OTP Generation', testOTPGeneration);
  
  // API endpoint tests
  await runTest('Transaction History', testTransactionHistory);
  await runTest('Webhook Endpoints', testWebhookEndpoints);
  await runTest('System Statistics', testSystemStats);
  
  // Print results
  console.log(colors.cyan('📊 Test Results Summary:'));
  console.log(`Total Tests: ${testResults.total}`);
  console.log(colors.green(`Passed: ${testResults.passed}`));
  console.log(colors.red(`Failed: ${testResults.failed}`));
  
  const successRate = ((testResults.passed / testResults.total) * 100).toFixed(1);
  console.log(`Success Rate: ${successRate}%`);
  
  if (testResults.failed === 0) {
    console.log(colors.green('\n🎉 All tests passed! System is working correctly.'));
  } else {
    console.log(colors.yellow('\n⚠️  Some tests failed. Please check the logs above.'));
  }
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Zybra SMS/USSD System Test Script

Usage: node test-system.js [options]

Options:
  --help, -h     Show this help message
  --base-url     Set base URL (default: http://localhost:3000)
  --phone        Set test phone number (default: 254712345678)

Environment Variables:
  BASE_URL       Base URL for API calls
  TEST_PHONE     Primary test phone number
  TEST_PHONE_2   Secondary test phone number

Examples:
  node test-system.js
  node test-system.js --base-url http://localhost:3000
  BASE_URL=https://api.zybra.com node test-system.js
`);
  process.exit(0);
}

// Parse command line arguments
const baseUrlIndex = process.argv.indexOf('--base-url');
if (baseUrlIndex !== -1 && process.argv[baseUrlIndex + 1]) {
  BASE_URL = process.argv[baseUrlIndex + 1];
}

const phoneIndex = process.argv.indexOf('--phone');
if (phoneIndex !== -1 && process.argv[phoneIndex + 1]) {
  TEST_PHONE = process.argv[phoneIndex + 1];
}

// Run tests
if (require.main === module) {
  runAllTests().catch((err) => {
    error(`Test suite failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  runTest,
  apiCall
};
