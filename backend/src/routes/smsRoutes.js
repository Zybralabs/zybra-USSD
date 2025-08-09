const express = require('express');
const router = express.Router();
const SMSController = require('../controllers/smsController');
const { authenticatePhone, phoneRateLimit } = require('../middleware/authMiddleware');
const { smsValidationRules, validate } = require('../middleware/validation');

// Route definitions using controllers and validation

/**
 * Handle incoming SMS from Africa's Talking
 * POST /api/sms/incoming
 */
router.post('/incoming', SMSController.handleIncomingSMS);

/**
 * Send SMS manually (for testing/admin purposes)
 * POST /api/sms/send
 */
router.post('/send',
  authenticatePhone,
  phoneRateLimit,
  validate(smsValidationRules.sendSMS),
  SMSController.sendSMS
);

/**
 * Send balance notification SMS
 * POST /api/sms/balance
 */
router.post('/balance',
  authenticatePhone,
  phoneRateLimit,
  validate(smsValidationRules.balanceNotification),
  SMSController.sendBalanceNotification
);

/**
 * Send OTP SMS
 * POST /api/sms/otp
 */
router.post('/otp',
  authenticatePhone,
  phoneRateLimit,
  validate(smsValidationRules.sendOTP),
  SMSController.sendOTP
);

/**
 * Verify OTP
 * POST /api/sms/verify-otp
 */
router.post('/verify-otp',
  authenticatePhone,
  validate(smsValidationRules.verifyOTP),
  SMSController.verifyOTP
);

/**
 * Send transaction confirmation SMS
 * POST /api/sms/transaction-confirmation
 */
router.post('/transaction-confirmation',
  authenticatePhone,
  validate(smsValidationRules.transactionConfirmation),
  SMSController.sendTransactionConfirmation
);

/**
 * Send welcome SMS to new user
 * POST /api/sms/welcome
 */
router.post('/welcome',
  authenticatePhone,
  validate(smsValidationRules.welcomeSMS),
  SMSController.sendWelcomeSMS
);

/**
 * Handle SMS delivery reports from Africa's Talking
 * POST /api/sms/delivery-report
 */
router.post('/delivery-report', SMSController.handleDeliveryReport);

/**
 * Get SMS statistics (for admin/monitoring)
 * GET /api/sms/stats
 */
router.get('/stats', SMSController.getSMSStats);

module.exports = router;
