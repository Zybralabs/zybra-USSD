const { body, param, query, validationResult } = require('express-validator');

// Common validation rules
const phoneNumberValidation = body('phoneNumber')
  .isMobilePhone()
  .withMessage('Invalid phone number format')
  .customSanitizer(value => value.replace(/[\s\-\+]/g, ''));

const amountValidation = body('amount')
  .isFloat({ min: 0.01 })
  .withMessage('Amount must be a positive number greater than 0');

const currencyValidation = body('currency')
  .optional()
  .isIn(['ZrUSD', 'MWK', 'KES', 'UGX', 'TZS'])
  .withMessage('Invalid currency');

// SMS validation rules
const smsValidationRules = {
  sendSMS: [
    phoneNumberValidation,
    body('message')
      .isLength({ min: 1, max: 1600 })
      .withMessage('Message must be between 1 and 1600 characters'),
    body('from')
      .optional()
      .isLength({ max: 11 })
      .withMessage('Sender ID must be 11 characters or less')
  ],

  balanceNotification: [
    phoneNumberValidation
  ],

  sendOTP: [
    phoneNumberValidation
  ],

  verifyOTP: [
    phoneNumberValidation,
    body('otp')
      .isLength({ min: 4, max: 6 })
      .isNumeric()
      .withMessage('OTP must be 4-6 digits')
  ],

  transactionConfirmation: [
    phoneNumberValidation,
    body('transaction')
      .isObject()
      .withMessage('Transaction details are required'),
    body('transaction.type')
      .isIn(['transfer', 'deposit', 'withdrawal', 'receive'])
      .withMessage('Invalid transaction type'),
    body('transaction.amount')
      .isFloat({ min: 0 })
      .withMessage('Invalid transaction amount'),
    body('transaction.status')
      .isIn(['pending', 'completed', 'failed'])
      .withMessage('Invalid transaction status')
  ],

  welcomeSMS: [
    phoneNumberValidation,
    body('walletAddress')
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage('Invalid wallet address format')
  ]
};

// USSD validation rules
const ussdValidationRules = {
  testFlow: [
    phoneNumberValidation,
    body('menuPath')
      .isArray({ min: 1 })
      .withMessage('Menu path must be a non-empty array'),
    body('menuPath.*')
      .isString()
      .withMessage('Menu path items must be strings')
  ],

  sessionDetails: [
    param('sessionId')
      .isLength({ min: 1 })
      .withMessage('Session ID is required')
  ],

  userSessions: [
    param('phoneNumber')
      .isMobilePhone()
      .withMessage('Invalid phone number format')
  ]
};

// Transaction validation rules
const transactionValidationRules = {
  transfer: [
    body('fromPhone')
      .isMobilePhone()
      .withMessage('Invalid from phone number')
      .customSanitizer(value => value.replace(/[\s\-\+]/g, '')),
    body('toPhone')
      .isMobilePhone()
      .withMessage('Invalid to phone number')
      .customSanitizer(value => value.replace(/[\s\-\+]/g, '')),
    amountValidation,
    currencyValidation
  ],

  deposit: [
    phoneNumberValidation,
    amountValidation,
    body('currency')
      .isIn(['MWK', 'KES', 'UGX', 'TZS'])
      .withMessage('Invalid deposit currency'),
    body('paymentData')
      .isObject()
      .withMessage('Payment data is required'),
    body('paymentData.provider')
      .isIn(['airtel', 'yellowcard', 'mtn', 'vodacom'])
      .withMessage('Invalid payment provider'),
    body('paymentData.reference')
      .isLength({ min: 1 })
      .withMessage('Payment reference is required')
  ],

  withdrawal: [
    phoneNumberValidation,
    amountValidation,
    body('targetCurrency')
      .isIn(['MWK', 'KES', 'UGX', 'TZS'])
      .withMessage('Invalid target currency'),
    body('withdrawalData')
      .isObject()
      .withMessage('Withdrawal data is required'),
    body('withdrawalData.method')
      .isIn(['mobile_money', 'bank_transfer'])
      .withMessage('Invalid withdrawal method'),
    body('withdrawalData.account')
      .isLength({ min: 1 })
      .withMessage('Withdrawal account is required')
  ],

  history: [
    param('phoneNumber')
      .isMobilePhone()
      .withMessage('Invalid phone number'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be 0 or greater'),
    query('type')
      .optional()
      .isIn(['transfer', 'deposit', 'withdrawal', 'receive'])
      .withMessage('Invalid transaction type'),
    query('status')
      .optional()
      .isIn(['pending', 'completed', 'failed', 'cancelled'])
      .withMessage('Invalid transaction status')
  ],

  details: [
    param('transactionId')
      .isUUID()
      .withMessage('Invalid transaction ID format')
  ],

  retry: [
    param('transactionId')
      .isUUID()
      .withMessage('Invalid transaction ID format')
  ],

  cancel: [
    param('transactionId')
      .isUUID()
      .withMessage('Invalid transaction ID format'),
    body('reason')
      .optional()
      .isLength({ max: 255 })
      .withMessage('Reason must be 255 characters or less')
  ],

  balance: [
    param('phoneNumber')
      .isMobilePhone()
      .withMessage('Invalid phone number')
  ],

  stats: [
    query('period')
      .optional()
      .isIn(['1d', '7d', '30d', '90d'])
      .withMessage('Invalid period'),
    query('phoneNumber')
      .optional()
      .isMobilePhone()
      .withMessage('Invalid phone number')
  ]
};

// Webhook validation rules
const webhookValidationRules = {
  airtel: [
    body('transaction_id')
      .isLength({ min: 1 })
      .withMessage('Transaction ID is required'),
    body('transaction_status')
      .isLength({ min: 1 })
      .withMessage('Transaction status is required'),
    body('msisdn')
      .isMobilePhone()
      .withMessage('Invalid phone number')
  ],

  yellowcard: [
    body('event_type')
      .isLength({ min: 1 })
      .withMessage('Event type is required'),
    body('data.id')
      .isLength({ min: 1 })
      .withMessage('Transaction ID is required'),
    body('data.customer_phone')
      .isMobilePhone()
      .withMessage('Invalid customer phone number')
  ],

  blockchain: [
    body('txHash')
      .matches(/^0x[a-fA-F0-9]{64}$/)
      .withMessage('Invalid transaction hash format'),
    body('status')
      .isIn(['pending', 'confirmed', 'failed'])
      .withMessage('Invalid transaction status')
  ],

  delivery: [
    body('id')
      .isLength({ min: 1 })
      .withMessage('Message ID is required'),
    body('status')
      .isLength({ min: 1 })
      .withMessage('Delivery status is required'),
    body('phoneNumber')
      .isMobilePhone()
      .withMessage('Invalid phone number')
  ]
};

// Validation middleware factory
const validate = (rules) => {
  return async (req, res, next) => {
    // Run all validation rules
    await Promise.all(rules.map(rule => rule.run(req)));

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array().map(error => ({
          field: error.param,
          message: error.msg,
          value: error.value
        }))
      });
    }

    next();
  };
};

// Custom validation functions
const customValidations = {
  // Validate phone number format for specific countries
  validateAfricanPhoneNumber: (value) => {
    const africanCountryCodes = ['254', '255', '256', '260', '265', '233', '234'];
    const cleanNumber = value.replace(/[\s\-\+]/g, '');
    
    // Check if number starts with any African country code
    return africanCountryCodes.some(code => cleanNumber.startsWith(code));
  },

  // Validate transaction amount limits
  validateTransactionAmount: (amount, currency = 'ZrUSD') => {
    const limits = {
      'ZrUSD': { min: 0.01, max: 10000 },
      'MWK': { min: 100, max: 10000000 },
      'KES': { min: 1, max: 1000000 },
      'UGX': { min: 100, max: 50000000 },
      'TZS': { min: 100, max: 20000000 }
    };

    const limit = limits[currency] || limits['ZrUSD'];
    return amount >= limit.min && amount <= limit.max;
  },

  // Validate wallet address
  validateWalletAddress: (address) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  },

  // Validate transaction hash
  validateTxHash: (hash) => {
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
  }
};

// Error handler for validation
const handleValidationError = (error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON format'
    });
  }
  
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'Request payload too large'
    });
  }

  next(error);
};

module.exports = {
  smsValidationRules,
  ussdValidationRules,
  transactionValidationRules,
  webhookValidationRules,
  validate,
  customValidations,
  handleValidationError
};
