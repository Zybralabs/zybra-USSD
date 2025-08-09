const express = require('express');
const router = express.Router();
const KotaniPayController = require('../controllers/kotaniPayController');
const { authenticatePhone, phoneRateLimit } = require('../middleware/authMiddleware');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');

// Validation rules for Kotani Pay operations
const kotaniPayValidationRules = {
  initiateDeposit: [
    body('phoneNumber')
      .isMobilePhone()
      .withMessage('Invalid phone number format')
      .customSanitizer(value => value.replace(/[\s\-\+]/g, '')),
    body('amount')
      .isFloat({ min: 1 })
      .withMessage('Amount must be a positive number greater than 0'),
    body('currency')
      .isIn(['KES', 'UGX', 'TZS', 'GHS', 'NGN'])
      .withMessage('Invalid currency. Supported: KES, UGX, TZS, GHS, NGN')
  ],

  initiateWithdrawal: [
    body('phoneNumber')
      .isMobilePhone()
      .withMessage('Invalid phone number format')
      .customSanitizer(value => value.replace(/[\s\-\+]/g, '')),
    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be a positive number greater than 0'),
    body('targetCurrency')
      .isIn(['KES', 'UGX', 'TZS', 'GHS', 'NGN'])
      .withMessage('Invalid target currency. Supported: KES, UGX, TZS, GHS, NGN')
  ],

  createCustomer: [
    body('phoneNumber')
      .isMobilePhone()
      .withMessage('Invalid phone number format')
      .customSanitizer(value => value.replace(/[\s\-\+]/g, '')),
    body('firstName')
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage('First name must be 1-50 characters'),
    body('lastName')
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name must be 1-50 characters'),
    body('email')
      .optional()
      .isEmail()
      .withMessage('Invalid email format'),
    body('country')
      .optional()
      .isLength({ min: 2, max: 2 })
      .withMessage('Country must be 2-letter code')
  ],

  getCustomerByPhone: [
    param('phoneNumber')
      .isMobilePhone()
      .withMessage('Invalid phone number format')
  ],

  getTransactionStatus: [
    param('transactionId')
      .isLength({ min: 1 })
      .withMessage('Transaction ID is required'),
    query('type')
      .optional()
      .isIn(['deposit', 'withdrawal'])
      .withMessage('Type must be either deposit or withdrawal')
  ],

  getPaymentProviders: [
    param('country')
      .isLength({ min: 2, max: 2 })
      .withMessage('Country must be 2-letter code')
  ],

  getExchangeRates: [
    query('fromCurrency')
      .isLength({ min: 3, max: 3 })
      .withMessage('From currency must be 3-letter code'),
    query('toCurrency')
      .isLength({ min: 3, max: 3 })
      .withMessage('To currency must be 3-letter code')
  ]
};

/**
 * Initiate mobile money deposit
 * POST /api/kotanipay/deposit
 */
router.post('/deposit',
  authenticatePhone,
  phoneRateLimit,
  validate(kotaniPayValidationRules.initiateDeposit),
  KotaniPayController.initiateDeposit
);

/**
 * Initiate mobile money withdrawal
 * POST /api/kotanipay/withdrawal
 */
router.post('/withdrawal',
  authenticatePhone,
  phoneRateLimit,
  validate(kotaniPayValidationRules.initiateWithdrawal),
  KotaniPayController.initiateWithdrawal
);

/**
 * Get exchange rates
 * GET /api/kotanipay/rates?fromCurrency=KES&toCurrency=USD
 */
router.get('/rates',
  validate(kotaniPayValidationRules.getExchangeRates),
  KotaniPayController.getExchangeRates
);

/**
 * Get payment providers for a country
 * GET /api/kotanipay/providers/:country
 */
router.get('/providers/:country',
  validate(kotaniPayValidationRules.getPaymentProviders),
  KotaniPayController.getPaymentProviders
);

/**
 * Get transaction status
 * GET /api/kotanipay/status/:transactionId?type=deposit
 */
router.get('/status/:transactionId',
  validate(kotaniPayValidationRules.getTransactionStatus),
  KotaniPayController.getTransactionStatus
);

/**
 * Create Kotani Pay customer
 * POST /api/kotanipay/customer
 */
router.post('/customer',
  authenticatePhone,
  validate(kotaniPayValidationRules.createCustomer),
  KotaniPayController.createCustomer
);

/**
 * Get customer by phone number
 * GET /api/kotanipay/customer/:phoneNumber
 */
router.get('/customer/:phoneNumber',
  authenticatePhone,
  validate(kotaniPayValidationRules.getCustomerByPhone),
  KotaniPayController.getCustomerByPhone
);

/**
 * Health check for Kotani Pay integration
 * GET /api/kotanipay/health
 */
router.get('/health', async (req, res) => {
  try {
    // Test basic connectivity to Kotani Pay API
    const KotaniPayService = require('../services/kotaniPayService');
    
    // Try to get exchange rate as a health check
    const healthCheck = await KotaniPayService.getExchangeRate('USD', 'KES');
    
    if (healthCheck.success) {
      res.status(200).json({
        success: true,
        message: 'Kotani Pay integration is healthy',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        success: false,
        message: 'Kotani Pay integration is unhealthy',
        error: healthCheck.error,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Kotani Pay integration is unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get supported currencies
 * GET /api/kotanipay/currencies
 */
router.get('/currencies', (req, res) => {
  const supportedCurrencies = [
    { code: 'KES', name: 'Kenyan Shilling', country: 'Kenya' },
    { code: 'UGX', name: 'Ugandan Shilling', country: 'Uganda' },
    { code: 'TZS', name: 'Tanzanian Shilling', country: 'Tanzania' },
    { code: 'GHS', name: 'Ghanaian Cedi', country: 'Ghana' },
    { code: 'NGN', name: 'Nigerian Naira', country: 'Nigeria' }
  ];

  res.status(200).json({
    success: true,
    data: {
      currencies: supportedCurrencies,
      count: supportedCurrencies.length
    }
  });
});

/**
 * Get supported countries
 * GET /api/kotanipay/countries
 */
router.get('/countries', (req, res) => {
  const supportedCountries = [
    { code: 'KE', name: 'Kenya', currency: 'KES' },
    { code: 'UG', name: 'Uganda', currency: 'UGX' },
    { code: 'TZ', name: 'Tanzania', currency: 'TZS' },
    { code: 'GH', name: 'Ghana', currency: 'GHS' },
    { code: 'NG', name: 'Nigeria', currency: 'NGN' }
  ];

  res.status(200).json({
    success: true,
    data: {
      countries: supportedCountries,
      count: supportedCountries.length
    }
  });
});

module.exports = router;
