const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhookController');
const { webhookValidationRules, validate } = require('../middleware/validation');

// Route definitions using controllers and validation

/**
 * Handle Airtel Money webhook
 * POST /api/webhooks/airtel
 */
router.post('/airtel',
  validate(webhookValidationRules.airtel),
  WebhookController.handleAirtelWebhook
);

/**
 * Handle Kotani Pay deposit webhook
 * POST /api/webhooks/kotanipay/deposit
 */
router.post('/kotanipay/deposit', WebhookController.handleKotaniPayDepositWebhook);

/**
 * Handle Kotani Pay withdrawal webhook
 * POST /api/webhooks/kotanipay/withdrawal
 */
router.post('/kotanipay/withdrawal', WebhookController.handleKotaniPayWithdrawalWebhook);

/**
 * Handle Yellow Card webhook
 * POST /api/webhooks/yellowcard
 */
router.post('/yellowcard',
  validate(webhookValidationRules.yellowcard),
  WebhookController.handleYellowCardWebhook
);

/**
 * Handle blockchain transaction confirmations
 * POST /api/webhooks/blockchain
 */
router.post('/blockchain',
  validate(webhookValidationRules.blockchain),
  WebhookController.handleBlockchainWebhook
);

/**
 * Handle Africa's Talking delivery reports
 * POST /api/webhooks/africastalking/delivery
 */
router.post('/africastalking/delivery',
  validate(webhookValidationRules.delivery),
  WebhookController.handleAfricasTalkingDelivery
);

/**
 * Generic webhook handler for testing
 * POST /api/webhooks/test
 */
router.post('/test', WebhookController.handleTestWebhook);

/**
 * Webhook verification endpoint
 * GET /api/webhooks/verify
 */
router.get('/verify', WebhookController.handleWebhookVerification);

/**
 * Get webhook statistics
 * GET /api/webhooks/stats
 */
router.get('/stats', WebhookController.getWebhookStats);

module.exports = router;
