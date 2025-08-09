const express = require('express');
const router = express.Router();
const YellowCardController = require('../controllers/yellowCardController');
const { authenticatePhone, phoneRateLimit } = require('../middleware/authMiddleware');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');

// Validation rules for Yellow Card operations
const yellowCardValidationRules = {
  initiateCollection: [
    body('phoneNumber')
      .isMobilePhone()
      .withMessage('Invalid phone number format')
      .customSanitizer(value => value.replace(/[\s\-\+]/g, '')),
    body('amount')
      .isFloat({ min: 1 })
      .withMessage('Amount must be a positive number greater than 0'),
    body('currency')
      .isIn(['NGN', 'GHS', 'KES', 'UGX', 'TZS', 'ZAR', 'EGP', 'MAD'])
      .withMessage('Invalid currency. Supported: NGN, GHS, KES, UGX, TZS, ZAR, EGP, MAD'),
    body('countryCode')
      .optional()
      .isLength({ min: 2, max: 2 })
      .withMessage('Country code must be 2-letter code')
  ],

  initiateDisbursement: [
    body('phoneNumber')
      .isMobilePhone()
      .withMessage('Invalid phone number format')
      .customSanitizer(value => value.replace(/[\s\-\+]/g, '')),
    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be a positive number greater than 0'),
    body('targetCurrency')
      .isIn(['NGN', 'GHS', 'KES', 'UGX', 'TZS', 'ZAR', 'EGP', 'MAD'])
      .withMessage('Invalid target currency. Supported: NGN, GHS, KES, UGX, TZS, ZAR, EGP, MAD'),
    body('countryCode')
      .optional()
      .isLength({ min: 2, max: 2 })
      .withMessage('Country code must be 2-letter code')
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

  getCollectionStatus: [
    param('collectionId')
      .isLength({ min: 1 })
      .withMessage('Collection ID is required')
  ],

  getDisbursementStatus: [
    param('disbursementId')
      .isLength({ min: 1 })
      .withMessage('Disbursement ID is required')
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
 * Initiate collection (deposit)
 * POST /api/yellowcard/collection
 */
router.post('/collection',
  authenticatePhone,
  phoneRateLimit,
  validate(yellowCardValidationRules.initiateCollection),
  YellowCardController.initiateCollection
);

/**
 * Initiate disbursement (withdrawal)
 * POST /api/yellowcard/disbursement
 */
router.post('/disbursement',
  authenticatePhone,
  phoneRateLimit,
  validate(yellowCardValidationRules.initiateDisbursement),
  YellowCardController.initiateDisbursement
);

/**
 * Get exchange rates
 * GET /api/yellowcard/rates?fromCurrency=NGN&toCurrency=USD
 */
router.get('/rates',
  validate(yellowCardValidationRules.getExchangeRates),
  YellowCardController.getExchangeRates
);

/**
 * Get supported countries
 * GET /api/yellowcard/countries
 */
router.get('/countries',
  YellowCardController.getSupportedCountries
);

/**
 * Get collection status
 * GET /api/yellowcard/collection/:collectionId
 */
router.get('/collection/:collectionId',
  validate(yellowCardValidationRules.getCollectionStatus),
  YellowCardController.getCollectionStatus
);

/**
 * Get disbursement status
 * GET /api/yellowcard/disbursement/:disbursementId
 */
router.get('/disbursement/:disbursementId',
  validate(yellowCardValidationRules.getDisbursementStatus),
  YellowCardController.getDisbursementStatus
);

/**
 * Create Yellow Card customer
 * POST /api/yellowcard/customer
 */
router.post('/customer',
  authenticatePhone,
  validate(yellowCardValidationRules.createCustomer),
  YellowCardController.createCustomer
);

/**
 * Get customer by phone number
 * GET /api/yellowcard/customer/:phoneNumber
 */
router.get('/customer/:phoneNumber',
  authenticatePhone,
  validate(yellowCardValidationRules.getCustomerByPhone),
  YellowCardController.getCustomerByPhone
);

/**
 * Health check for Yellow Card integration
 * GET /api/yellowcard/health
 */
router.get('/health', async (req, res) => {
  try {
    // Test basic connectivity to Yellow Card API
    const YellowCardService = require('../services/yellowCardService');
    
    // Try to get supported countries as a health check
    const healthCheck = await YellowCardService.getSupportedCountries();
    
    if (healthCheck.success) {
      res.status(200).json({
        success: true,
        message: 'Yellow Card integration is healthy',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        success: false,
        message: 'Yellow Card integration is unhealthy',
        error: healthCheck.error,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Yellow Card integration is unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get supported currencies
 * GET /api/yellowcard/currencies
 */
router.get('/currencies', (req, res) => {
  const YellowCardService = require('../services/yellowCardService');
  const supportedCurrencies = YellowCardService.getSupportedCurrencies();

  res.status(200).json({
    success: true,
    data: {
      currencies: supportedCurrencies,
      count: supportedCurrencies.length
    }
  });
});

module.exports = router;
