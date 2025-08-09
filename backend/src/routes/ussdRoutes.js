const express = require('express');
const router = express.Router();
const USSDController = require('../controllers/ussdController');
const { phoneRateLimit } = require('../middleware/authMiddleware');
const { ussdValidationRules, validate } = require('../middleware/validation');

// Route definitions using controllers and validation

/**
 * Handle USSD requests from Africa's Talking
 * POST /api/ussd
 */
router.post('/', phoneRateLimit, USSDController.handleUSSDRequest);

/**
 * Handle USSD session timeout
 * POST /api/ussd/timeout
 */
router.post('/timeout', USSDController.handleSessionTimeout);

/**
 * Get active USSD sessions (for monitoring)
 * GET /api/ussd/sessions
 */
router.get('/sessions', USSDController.getActiveSessions);

/**
 * Clear expired USSD sessions (cleanup endpoint)
 * DELETE /api/ussd/sessions/expired
 */
router.delete('/sessions/expired', USSDController.clearExpiredSessions);

/**
 * Get USSD statistics
 * GET /api/ussd/stats
 */
router.get('/stats', USSDController.getUSSDStats);

/**
 * Test USSD menu flow (for development/testing)
 * POST /api/ussd/test
 */
router.post('/test',
  validate(ussdValidationRules.testFlow),
  USSDController.testUSSDFlow
);

/**
 * Get USSD session details
 * GET /api/ussd/sessions/:sessionId
 */
router.get('/sessions/:sessionId',
  validate(ussdValidationRules.sessionDetails),
  USSDController.getSessionDetails
);

/**
 * Force end USSD session
 * DELETE /api/ussd/sessions/:sessionId
 */
router.delete('/sessions/:sessionId',
  validate(ussdValidationRules.sessionDetails),
  USSDController.endSession
);

/**
 * Get user's active sessions
 * GET /api/ussd/users/:phoneNumber/sessions
 */
router.get('/users/:phoneNumber/sessions',
  validate(ussdValidationRules.userSessions),
  USSDController.getUserSessions
);

module.exports = router;
