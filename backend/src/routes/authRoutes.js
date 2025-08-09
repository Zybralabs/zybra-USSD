const express = require('express');
const router = express.Router();
const AuthService = require('../services/authService');
const { authenticatePhone, enhancedPhoneRateLimit, verifyOTP } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validation');
const { body } = require('express-validator');
const logger = require('../utils/logger');

// Validation rules
const phoneValidation = body('phoneNumber')
  .notEmpty()
  .withMessage('Phone number is required');

const otpValidation = body('otp')
  .isLength({ min: 6, max: 6 })
  .isNumeric()
  .withMessage('OTP must be a 6-digit number');

const purposeValidation = body('purpose')
  .optional()
  .isIn(['authentication', 'transaction', 'investment', 'withdrawal', 'wallet_access'])
  .withMessage('Invalid purpose');

/**
 * Generate OTP for authentication
 * POST /api/auth/generate-otp
 */
router.post('/generate-otp', 
  enhancedPhoneRateLimit,
  validate([phoneValidation, purposeValidation]),
  authenticatePhone,
  async (req, res) => {
    try {
      const { phoneNumber, purpose = 'authentication', expiryMinutes = 5 } = req.body;

      const result = await AuthService.generateSecureOTP(phoneNumber, purpose, expiryMinutes);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: result.message,
          expiresIn: result.expiresIn
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      logger.error('Error in generate-otp route:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Verify OTP
 * POST /api/auth/verify-otp
 */
router.post('/verify-otp',
  enhancedPhoneRateLimit,
  validate([phoneValidation, otpValidation, purposeValidation]),
  authenticatePhone,
  async (req, res) => {
    try {
      const { phoneNumber, otp, purpose = 'authentication' } = req.body;

      const result = await AuthService.verifySecureOTP(phoneNumber, otp, purpose);

      if (result.success) {
        // Create secure session after successful OTP verification
        const sessionResult = await AuthService.createSecureSession(phoneNumber, 'api', 30);
        
        res.status(200).json({
          success: true,
          message: result.message,
          sessionToken: sessionResult.sessionToken,
          expiresIn: sessionResult.expiresIn
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      logger.error('Error in verify-otp route:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Create secure session
 * POST /api/auth/create-session
 */
router.post('/create-session',
  enhancedPhoneRateLimit,
  validate([phoneValidation, purposeValidation]),
  verifyOTP('authentication'),
  async (req, res) => {
    try {
      const { phoneNumber, purpose = 'api', expiryMinutes = 30 } = req.body;

      const result = await AuthService.createSecureSession(phoneNumber, purpose, expiryMinutes);

      if (result.success) {
        res.status(200).json({
          success: true,
          sessionToken: result.sessionToken,
          expiresIn: result.expiresIn,
          phoneNumber: result.phoneNumber
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      logger.error('Error in create-session route:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Validate session
 * POST /api/auth/validate-session
 */
router.post('/validate-session',
  async (req, res) => {
    try {
      const { sessionToken } = req.body;

      if (!sessionToken) {
        return res.status(400).json({
          success: false,
          error: 'Session token is required'
        });
      }

      const result = await AuthService.validateSecureSession(sessionToken);

      if (result.success) {
        res.status(200).json({
          success: true,
          session: result.session
        });
      } else {
        res.status(401).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      logger.error('Error in validate-session route:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Invalidate session (logout)
 * POST /api/auth/logout
 */
router.post('/logout',
  async (req, res) => {
    try {
      const { sessionToken } = req.body;

      if (!sessionToken) {
        return res.status(400).json({
          success: false,
          error: 'Session token is required'
        });
      }

      const result = await AuthService.invalidateSession(sessionToken);

      res.status(200).json({
        success: result,
        message: result ? 'Session invalidated successfully' : 'Failed to invalidate session'
      });
    } catch (error) {
      logger.error('Error in logout route:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Check wallet operation authorization
 * POST /api/auth/authorize-wallet-operation
 */
router.post('/authorize-wallet-operation',
  enhancedPhoneRateLimit,
  validate([
    phoneValidation,
    body('operation')
      .isIn(['transfer', 'invest', 'withdraw', 'balance'])
      .withMessage('Invalid operation type')
  ]),
  authenticatePhone,
  async (req, res) => {
    try {
      const { phoneNumber, operation } = req.body;

      const result = await AuthService.authorizeWalletOperation(phoneNumber, operation);

      if (result.success) {
        res.status(200).json({
          success: true,
          user: result.user
        });
      } else {
        const statusCode = result.requiresAuth || result.requiresRecentAuth ? 401 : 403;
        res.status(statusCode).json({
          success: false,
          error: result.error,
          requiresAuth: result.requiresAuth,
          requiresRecentAuth: result.requiresRecentAuth
        });
      }
    } catch (error) {
      logger.error('Error in authorize-wallet-operation route:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * Health check for authentication service
 * GET /api/auth/health
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Authentication service is healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
