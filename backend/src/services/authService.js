const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User } = require('../db/models');
const redisClient = require('../db/redisClient');
const SMSService = require('./smsEngine');
const logger = require('../utils/logger');

class AuthService {
  /**
   * Enhanced phone number validation for African countries
   * @param {string} phoneNumber - Phone number to validate
   * @returns {Object} - Validation result
   */
  static validatePhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // African country codes and their patterns
    const africanPatterns = {
      '254': { country: 'Kenya', minLength: 12, maxLength: 12 },
      '255': { country: 'Tanzania', minLength: 12, maxLength: 12 },
      '256': { country: 'Uganda', minLength: 12, maxLength: 12 },
      '234': { country: 'Nigeria', minLength: 13, maxLength: 14 },
      '233': { country: 'Ghana', minLength: 12, maxLength: 12 },
      '260': { country: 'Zambia', minLength: 12, maxLength: 12 },
      '265': { country: 'Malawi', minLength: 12, maxLength: 12 }
    };
    
    // Check if number matches any African pattern
    for (const [code, pattern] of Object.entries(africanPatterns)) {
      if (cleanNumber.startsWith(code)) {
        if (cleanNumber.length >= pattern.minLength && cleanNumber.length <= pattern.maxLength) {
          return {
            isValid: true,
            normalizedNumber: cleanNumber,
            countryCode: code,
            country: pattern.country
          };
        }
      }
    }
    
    return {
      isValid: false,
      error: 'Invalid phone number format or unsupported country'
    };
  }

  /**
   * Generate secure OTP with enhanced security
   * @param {string} phoneNumber - User's phone number
   * @param {string} purpose - Purpose of OTP (login, transaction, etc.)
   * @param {number} expiryMinutes - OTP expiry in minutes
   * @returns {Promise<Object>} - OTP generation result
   */
  static async generateSecureOTP(phoneNumber, purpose = 'authentication', expiryMinutes = 5) {
    try {
      // Validate phone number
      const validation = this.validatePhoneNumber(phoneNumber);
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }

      const normalizedPhone = validation.normalizedNumber;
      
      // Check rate limiting
      const rateLimitKey = `otp_rate_limit:${normalizedPhone}`;
      const attempts = await redisClient.get(rateLimitKey);
      
      if (attempts && parseInt(attempts) >= 3) {
        return { 
          success: false, 
          error: 'Too many OTP requests. Please wait 15 minutes before trying again.' 
        };
      }

      // Generate cryptographically secure OTP
      const otp = crypto.randomInt(100000, 999999).toString();
      
      // Create OTP hash for additional security
      const otpHash = crypto.createHash('sha256').update(otp + process.env.OTP_SECRET || 'default_secret').digest('hex');
      
      // Store OTP data
      const otpData = {
        hash: otpHash,
        purpose,
        attempts: 0,
        createdAt: new Date().toISOString(),
        phoneNumber: normalizedPhone
      };
      
      const otpKey = `otp:${normalizedPhone}:${purpose}`;
      await redisClient.setex(otpKey, expiryMinutes * 60, JSON.stringify(otpData));
      
      // Update rate limiting
      await redisClient.multi()
        .incr(rateLimitKey)
        .expire(rateLimitKey, 900) // 15 minutes
        .exec();
      
      // Send OTP via SMS
      const smsResult = await SMSService.sendOTP(normalizedPhone, otp, purpose);
      
      if (!smsResult.success) {
        return { success: false, error: 'Failed to send OTP' };
      }
      
      return {
        success: true,
        message: 'OTP sent successfully',
        expiresIn: expiryMinutes * 60
      };
      
    } catch (error) {
      logger.error('Error generating secure OTP:', error);
      return { success: false, error: 'Failed to generate OTP' };
    }
  }

  /**
   * Verify OTP with enhanced security
   * @param {string} phoneNumber - User's phone number
   * @param {string} otp - OTP to verify
   * @param {string} purpose - Purpose of OTP verification
   * @returns {Promise<Object>} - Verification result
   */
  static async verifySecureOTP(phoneNumber, otp, purpose = 'authentication') {
    try {
      const validation = this.validatePhoneNumber(phoneNumber);
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }

      const normalizedPhone = validation.normalizedNumber;
      const otpKey = `otp:${normalizedPhone}:${purpose}`;
      
      const storedData = await redisClient.get(otpKey);
      if (!storedData) {
        return { success: false, error: 'OTP expired or not found' };
      }
      
      const otpData = JSON.parse(storedData);
      
      // Check attempt limit
      if (otpData.attempts >= 3) {
        await redisClient.del(otpKey);
        return { success: false, error: 'Too many failed attempts. Please request a new OTP.' };
      }
      
      // Verify OTP
      const otpHash = crypto.createHash('sha256').update(otp + process.env.OTP_SECRET || 'default_secret').digest('hex');
      
      if (otpHash !== otpData.hash) {
        // Increment failed attempts
        otpData.attempts += 1;
        await redisClient.setex(otpKey, 300, JSON.stringify(otpData)); // Keep for 5 more minutes
        
        return { 
          success: false, 
          error: `Invalid OTP. ${3 - otpData.attempts} attempts remaining.` 
        };
      }
      
      // OTP verified successfully - clean up
      await redisClient.del(otpKey);
      
      return {
        success: true,
        message: 'OTP verified successfully',
        phoneNumber: normalizedPhone
      };
      
    } catch (error) {
      logger.error('Error verifying secure OTP:', error);
      return { success: false, error: 'Failed to verify OTP' };
    }
  }

  /**
   * Create secure session for authenticated user
   * @param {string} phoneNumber - User's phone number
   * @param {string} purpose - Session purpose (ussd, api, etc.)
   * @param {number} expiryMinutes - Session expiry in minutes
   * @returns {Promise<Object>} - Session creation result
   */
  static async createSecureSession(phoneNumber, purpose = 'ussd', expiryMinutes = 30) {
    try {
      const validation = this.validatePhoneNumber(phoneNumber);
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }

      const normalizedPhone = validation.normalizedNumber;
      
      // Generate session token
      const sessionToken = crypto.randomBytes(32).toString('hex');
      
      // Create session data
      const sessionData = {
        phoneNumber: normalizedPhone,
        purpose,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString(),
        isActive: true
      };
      
      const sessionKey = `secure_session:${sessionToken}`;
      await redisClient.setex(sessionKey, expiryMinutes * 60, JSON.stringify(sessionData));
      
      // Also store by phone number for quick lookup
      const phoneSessionKey = `phone_session:${normalizedPhone}:${purpose}`;
      await redisClient.setex(phoneSessionKey, expiryMinutes * 60, sessionToken);
      
      return {
        success: true,
        sessionToken,
        expiresIn: expiryMinutes * 60,
        phoneNumber: normalizedPhone
      };
      
    } catch (error) {
      logger.error('Error creating secure session:', error);
      return { success: false, error: 'Failed to create session' };
    }
  }

  /**
   * Validate secure session
   * @param {string} sessionToken - Session token to validate
   * @returns {Promise<Object>} - Validation result
   */
  static async validateSecureSession(sessionToken) {
    try {
      if (!sessionToken) {
        return { success: false, error: 'Session token required' };
      }
      
      const sessionKey = `secure_session:${sessionToken}`;
      const sessionData = await redisClient.get(sessionKey);
      
      if (!sessionData) {
        return { success: false, error: 'Invalid or expired session' };
      }
      
      const session = JSON.parse(sessionData);
      
      // Check if session is still active
      if (!session.isActive || new Date() > new Date(session.expiresAt)) {
        await redisClient.del(sessionKey);
        return { success: false, error: 'Session expired' };
      }
      
      return {
        success: true,
        session: {
          phoneNumber: session.phoneNumber,
          purpose: session.purpose,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt
        }
      };
      
    } catch (error) {
      logger.error('Error validating secure session:', error);
      return { success: false, error: 'Failed to validate session' };
    }
  }

  /**
   * Invalidate secure session
   * @param {string} sessionToken - Session token to invalidate
   * @returns {Promise<boolean>} - Success status
   */
  static async invalidateSession(sessionToken) {
    try {
      const sessionKey = `secure_session:${sessionToken}`;
      await redisClient.del(sessionKey);
      return true;
    } catch (error) {
      logger.error('Error invalidating session:', error);
      return false;
    }
  }

  /**
   * Check if user is authorized for wallet operations
   * @param {string} phoneNumber - User's phone number
   * @param {string} operation - Operation type (transfer, invest, withdraw)
   * @returns {Promise<Object>} - Authorization result
   */
  static async authorizeWalletOperation(phoneNumber, operation) {
    try {
      const validation = this.validatePhoneNumber(phoneNumber);
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }

      const normalizedPhone = validation.normalizedNumber;
      
      // Check if user exists
      const user = await User.findByPhone(normalizedPhone);
      if (!user) {
        return { success: false, error: 'User not found' };
      }
      
      // Check for active secure session
      const phoneSessionKey = `phone_session:${normalizedPhone}:ussd`;
      const sessionToken = await redisClient.get(phoneSessionKey);
      
      if (!sessionToken) {
        return { 
          success: false, 
          error: 'Authentication required',
          requiresAuth: true 
        };
      }
      
      const sessionValidation = await this.validateSecureSession(sessionToken);
      if (!sessionValidation.success) {
        return { 
          success: false, 
          error: 'Session expired. Please authenticate again.',
          requiresAuth: true 
        };
      }
      
      // Additional checks for high-value operations
      if (['invest', 'withdraw', 'transfer'].includes(operation)) {
        // Check for recent authentication (within last 10 minutes for sensitive operations)
        const recentAuthKey = `recent_auth:${normalizedPhone}`;
        const recentAuth = await redisClient.get(recentAuthKey);
        
        if (!recentAuth) {
          return {
            success: false,
            error: 'Recent authentication required for this operation',
            requiresRecentAuth: true
          };
        }
      }
      
      return {
        success: true,
        user: {
          phoneNumber: normalizedPhone,
          walletAddress: user.wallet_address,
          balance: user.balance
        }
      };
      
    } catch (error) {
      logger.error('Error authorizing wallet operation:', error);
      return { success: false, error: 'Authorization failed' };
    }
  }

  /**
   * Mark recent authentication for sensitive operations
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<boolean>} - Success status
   */
  static async markRecentAuthentication(phoneNumber) {
    try {
      const validation = this.validatePhoneNumber(phoneNumber);
      if (!validation.isValid) {
        return false;
      }

      const normalizedPhone = validation.normalizedNumber;
      const recentAuthKey = `recent_auth:${normalizedPhone}`;
      
      // Mark as recently authenticated for 10 minutes
      await redisClient.setex(recentAuthKey, 600, new Date().toISOString());
      return true;
      
    } catch (error) {
      logger.error('Error marking recent authentication:', error);
      return false;
    }
  }
}

module.exports = AuthService;
