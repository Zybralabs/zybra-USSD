const express = require('express');
const router = express.Router();
const TransactionController = require('../controllers/transactionController');
const { authenticatePhone, phoneRateLimit } = require('../middleware/authMiddleware');
const { transactionValidationRules, validate } = require('../middleware/validation');

// Route definitions using controllers and validation

/**
 * Process transfer between users
 * POST /api/transactions/transfer
 */
router.post('/transfer',
  authenticatePhone,
  phoneRateLimit,
  validate(transactionValidationRules.transfer),
  TransactionController.processTransfer
);

/**
 * Process mobile money deposit
 * POST /api/transactions/deposit
 */
router.post('/deposit',
  authenticatePhone,
  phoneRateLimit,
  validate(transactionValidationRules.deposit),
  TransactionController.processDeposit
);

/**
 * Process mobile money withdrawal
 * POST /api/transactions/withdraw
 */
router.post('/withdraw',
  authenticatePhone,
  phoneRateLimit,
  validate(transactionValidationRules.withdrawal),
  TransactionController.processWithdrawal
);

/**
 * Get transaction history for user
 * GET /api/transactions/history/:phoneNumber
 */
router.get('/history/:phoneNumber',
  authenticatePhone,
  validate(transactionValidationRules.history),
  TransactionController.getTransactionHistory
);

/**
 * Get specific transaction details
 * GET /api/transactions/:transactionId
 */
router.get('/:transactionId',
  validate(transactionValidationRules.details),
  TransactionController.getTransactionDetails
);

/**
 * Get transaction statistics
 * GET /api/transactions/stats/overview
 */
router.get('/stats/overview',
  validate(transactionValidationRules.stats),
  TransactionController.getTransactionStats
);

/**
 * Retry failed transaction
 * POST /api/transactions/:transactionId/retry
 */
router.post('/:transactionId/retry',
  authenticatePhone,
  validate(transactionValidationRules.retry),
  TransactionController.retryTransaction
);

/**
 * Cancel pending transaction
 * POST /api/transactions/:transactionId/cancel
 */
router.post('/:transactionId/cancel',
  authenticatePhone,
  validate(transactionValidationRules.cancel),
  TransactionController.cancelTransaction
);

/**
 * Get user balance
 * GET /api/transactions/balance/:phoneNumber
 */
router.get('/balance/:phoneNumber',
  authenticatePhone,
  validate(transactionValidationRules.balance),
  TransactionController.getUserBalance
);

module.exports = router;
