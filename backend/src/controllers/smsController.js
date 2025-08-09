const SMSService = require('../services/smsEngine');
const USSDService = require('../services/ussdService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

class SMSController {
  /**
   * Handle incoming SMS from Africa's Talking
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handleIncomingSMS(req, res) {
    try {
      const { from, text, linkId, date, id, to } = req.body;
      
      logger.info('Incoming SMS:', { from, text, linkId, date, id, to });

      // Validate required fields
      if (!from || !text) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: from, text'
        });
      }

      // Process the SMS
      const result = await SMSService.processIncomingSMS({
        from,
        text,
        linkId,
        date,
        id,
        to
      });

      res.status(200).json({
        success: true,
        message: 'SMS processed successfully',
        data: result
      });

    } catch (error) {
      logger.error('Error processing incoming SMS:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process SMS'
      });
    }
  }

  /**
   * Send SMS manually
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async sendSMS(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { phoneNumber, message, from } = req.body;

      const result = await SMSService.sendSMS(phoneNumber, message, from);

      res.status(200).json({
        success: true,
        message: 'SMS sent successfully',
        data: result
      });

    } catch (error) {
      logger.error('Error sending SMS:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send SMS'
      });
    }
  }

  /**
   * Send balance notification SMS
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async sendBalanceNotification(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { phoneNumber } = req.body;

      const result = await SMSService.handleBalanceRequest(phoneNumber);

      res.status(200).json({
        success: true,
        message: 'Balance SMS sent',
        data: result
      });

    } catch (error) {
      logger.error('Error sending balance SMS:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send balance SMS'
      });
    }
  }

  /**
   * Generate and send OTP SMS
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async sendOTP(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { phoneNumber } = req.body;

      // Generate and send OTP
      const otp = await USSDService.generateOTP(phoneNumber);

      res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        data: {
          phoneNumber,
          otpSent: true
        }
      });

    } catch (error) {
      logger.error('Error sending OTP SMS:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send OTP'
      });
    }
  }

  /**
   * Verify OTP
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async verifyOTP(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { phoneNumber, otp } = req.body;

      const isValid = await USSDService.verifyOTP(phoneNumber, otp);

      if (isValid) {
        res.status(200).json({
          success: true,
          message: 'OTP verified successfully',
          data: {
            phoneNumber,
            verified: true
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Invalid or expired OTP'
        });
      }

    } catch (error) {
      logger.error('Error verifying OTP:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify OTP'
      });
    }
  }

  /**
   * Send transaction confirmation SMS
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async sendTransactionConfirmation(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { phoneNumber, transaction } = req.body;

      const result = await SMSService.sendTransactionConfirmation(phoneNumber, transaction);

      res.status(200).json({
        success: true,
        message: 'Transaction confirmation SMS sent',
        data: result
      });

    } catch (error) {
      logger.error('Error sending transaction confirmation SMS:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send transaction confirmation SMS'
      });
    }
  }

  /**
   * Send welcome SMS to new user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async sendWelcomeSMS(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { phoneNumber, walletAddress } = req.body;

      const result = await SMSService.sendWelcomeSMS(phoneNumber, walletAddress);

      res.status(200).json({
        success: true,
        message: 'Welcome SMS sent',
        data: result
      });

    } catch (error) {
      logger.error('Error sending welcome SMS:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send welcome SMS'
      });
    }
  }

  /**
   * Handle SMS delivery reports from Africa's Talking
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handleDeliveryReport(req, res) {
    try {
      const { id, status, phoneNumber, failureReason, retryCount } = req.body;
      
      logger.info('SMS Delivery Report:', { 
        id, 
        status, 
        phoneNumber, 
        failureReason, 
        retryCount 
      });

      // Store delivery status in database if needed
      // This can be used for analytics and troubleshooting

      res.status(200).json({
        success: true,
        message: 'Delivery report processed'
      });

    } catch (error) {
      logger.error('Error processing SMS delivery report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process delivery report'
      });
    }
  }

  /**
   * Get SMS statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getSMSStats(req, res) {
    try {
      // This would typically require admin authentication
      // For now, return basic stats from database
      const { pool } = require('../db/models');
      
      const statsQuery = `
        SELECT 
          COUNT(*) as total_sms,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_sms,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_sms,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as sms_24h
        FROM sms_logs
        WHERE created_at > NOW() - INTERVAL '30 days'
      `;

      const result = await pool.query(statsQuery);
      const stats = result.rows[0];

      const responseData = {
        totalSMS: parseInt(stats.total_sms || 0),
        deliveredSMS: parseInt(stats.delivered_sms || 0),
        failedSMS: parseInt(stats.failed_sms || 0),
        sms24h: parseInt(stats.sms_24h || 0),
        successRate: stats.total_sms > 0 
          ? ((stats.delivered_sms / stats.total_sms) * 100).toFixed(2) + '%'
          : '0%',
        lastUpdated: new Date().toISOString()
      };

      res.status(200).json({
        success: true,
        data: responseData
      });

    } catch (error) {
      logger.error('Error getting SMS stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get SMS statistics'
      });
    }
  }
}

module.exports = SMSController;
