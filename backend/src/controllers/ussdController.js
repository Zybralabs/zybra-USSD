const USSDService = require('../services/ussdService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

class USSDController {
  /**
   * Handle USSD requests from Africa's Talking
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handleUSSDRequest(req, res) {
    try {
      const { sessionId, serviceCode, phoneNumber, text } = req.body;
      
      logger.info('USSD Request:', { 
        sessionId, 
        serviceCode, 
        phoneNumber, 
        text: text || '(empty)' 
      });

      // Validate required fields
      if (!sessionId || !phoneNumber) {
        return res.status(400).send('END Invalid request parameters');
      }

      // Process USSD request
      const response = await USSDService.processUSSDRequest({
        sessionId,
        serviceCode,
        phoneNumber,
        text: text || ''
      });

      // Send response back to Africa's Talking
      res.set('Content-Type', 'text/plain');
      res.status(200).send(response);

    } catch (error) {
      logger.error('Error processing USSD request:', error);
      res.set('Content-Type', 'text/plain');
      res.status(200).send('END Service temporarily unavailable. Please try again later.');
    }
  }

  /**
   * Handle USSD session timeout
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handleSessionTimeout(req, res) {
    try {
      const { sessionId, phoneNumber } = req.body;
      
      logger.info('USSD Session Timeout:', { sessionId, phoneNumber });

      // Clean up session data
      const { USSDSession } = require('../db/models');
      await USSDSession.delete(sessionId);

      res.status(200).json({
        success: true,
        message: 'Session timeout handled'
      });

    } catch (error) {
      logger.error('Error handling USSD timeout:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to handle session timeout'
      });
    }
  }

  /**
   * Get active USSD sessions (for monitoring)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getActiveSessions(req, res) {
    try {
      // This would typically require admin authentication
      const { pool } = require('../db/models');
      
      const result = await pool.query(`
        SELECT session_id, phone_number, current_menu, created_at, updated_at
        FROM ussd_sessions 
        WHERE updated_at > NOW() - INTERVAL '1 hour'
        ORDER BY updated_at DESC
        LIMIT 100
      `);

      res.status(200).json({
        success: true,
        data: {
          activeSessions: result.rows.length,
          sessions: result.rows
        }
      });

    } catch (error) {
      logger.error('Error getting USSD sessions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get USSD sessions'
      });
    }
  }

  /**
   * Clear expired USSD sessions (cleanup endpoint)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async clearExpiredSessions(req, res) {
    try {
      const { pool } = require('../db/models');
      
      // Delete sessions older than 1 hour
      const result = await pool.query(`
        DELETE FROM ussd_sessions 
        WHERE updated_at < NOW() - INTERVAL '1 hour'
      `);

      logger.info(`Cleaned up ${result.rowCount} expired USSD sessions`);

      res.status(200).json({
        success: true,
        message: `Cleaned up ${result.rowCount} expired sessions`
      });

    } catch (error) {
      logger.error('Error cleaning up USSD sessions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to clean up expired sessions'
      });
    }
  }

  /**
   * Get USSD statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getUSSDStats(req, res) {
    try {
      const { pool } = require('../db/models');
      
      // Get basic statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as sessions_24h,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as sessions_1h,
          COUNT(DISTINCT phone_number) as unique_users
        FROM ussd_sessions
        WHERE created_at > NOW() - INTERVAL '7 days'
      `;

      const result = await pool.query(statsQuery);
      const stats = result.rows[0];

      // Get menu usage statistics
      const menuStatsQuery = `
        SELECT 
          current_menu,
          COUNT(*) as usage_count
        FROM ussd_sessions
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY current_menu
        ORDER BY usage_count DESC
      `;

      const menuResult = await pool.query(menuStatsQuery);

      res.status(200).json({
        success: true,
        data: {
          overview: {
            totalSessions: parseInt(stats.total_sessions),
            sessions24h: parseInt(stats.sessions_24h),
            sessions1h: parseInt(stats.sessions_1h),
            uniqueUsers: parseInt(stats.unique_users)
          },
          menuUsage: menuResult.rows,
          lastUpdated: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Error getting USSD stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get USSD statistics'
      });
    }
  }

  /**
   * Test USSD menu flow (for development/testing)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async testUSSDFlow(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { phoneNumber, menuPath } = req.body;

      // Simulate USSD session for testing
      const sessionId = 'TEST_' + Date.now();
      const responses = [];

      // Process each step in the menu path
      for (let i = 0; i < menuPath.length; i++) {
        const text = menuPath.slice(0, i + 1).join('*');
        
        const response = await USSDService.processUSSDRequest({
          sessionId,
          serviceCode: '*384*96#',
          phoneNumber,
          text
        });

        responses.push({
          step: i + 1,
          input: menuPath[i],
          response: response
        });

        // If session ended, break
        if (response.startsWith('END')) {
          break;
        }
      }

      res.status(200).json({
        success: true,
        data: {
          phoneNumber,
          menuPath,
          responses
        }
      });

    } catch (error) {
      logger.error('Error testing USSD menu:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to test USSD menu'
      });
    }
  }

  /**
   * Get USSD session details
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getSessionDetails(req, res) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Session ID is required'
        });
      }

      const { USSDSession } = require('../db/models');
      const session = await USSDSession.findBySessionId(sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      res.status(200).json({
        success: true,
        data: session
      });

    } catch (error) {
      logger.error('Error getting session details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get session details'
      });
    }
  }

  /**
   * Force end USSD session
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async endSession(req, res) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Session ID is required'
        });
      }

      const { USSDSession } = require('../db/models');
      const deleted = await USSDSession.delete(sessionId);

      if (deleted) {
        res.status(200).json({
          success: true,
          message: 'Session ended successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

    } catch (error) {
      logger.error('Error ending session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to end session'
      });
    }
  }

  /**
   * Get user's active sessions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getUserSessions(req, res) {
    try {
      const { phoneNumber } = req.params;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is required'
        });
      }

      const { pool } = require('../db/models');
      const result = await pool.query(`
        SELECT session_id, current_menu, session_data, created_at, updated_at
        FROM ussd_sessions 
        WHERE phone_number = $1 
        ORDER BY updated_at DESC
        LIMIT 10
      `, [phoneNumber]);

      res.status(200).json({
        success: true,
        data: {
          phoneNumber,
          sessions: result.rows,
          count: result.rows.length
        }
      });

    } catch (error) {
      logger.error('Error getting user sessions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user sessions'
      });
    }
  }
}

module.exports = USSDController;
