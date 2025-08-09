const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const { User } = require('../db/models');
const AuthService = require('../services/authService');
const logger = require('../utils/logger');

// Protect routes - require authentication
const protect = async (req, res, next) => {
  try {
    let token;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route'
      });
    }

    try {
      // Verify token
      const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
      
      // Get user from token
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'No user found with this token'
        });
      }

      req.user = user;
      next();
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route'
      });
    }
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error in authentication'
    });
  }
};

// Enhanced phone number authentication for SMS/USSD
const authenticatePhone = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    // Use enhanced phone validation
    const validation = AuthService.validatePhoneNumber(phoneNumber);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    req.phoneNumber = validation.normalizedNumber;
    req.countryCode = validation.countryCode;
    req.country = validation.country;
    next();
  } catch (error) {
    logger.error('Phone auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error in phone authentication'
    });
  }
};

// Rate limiting for specific phone numbers
const phoneRateLimit = async (req, res, next) => {
  try {
    const redisClient = require('../db/redisClient');
    const phoneNumber = req.phoneNumber || req.body.phoneNumber;
    
    if (!phoneNumber) {
      return next();
    }

    const key = `rate_limit:${phoneNumber}`;
    const current = await redisClient.get(key);
    
    if (current && parseInt(current) >= 10) { // 10 requests per hour
      return res.status(429).json({
        success: false,
        error: 'Too many requests from this phone number. Please try again later.'
      });
    }

    // Increment counter
    await redisClient.multi()
      .incr(key)
      .expire(key, 3600) // 1 hour
      .exec();

    next();
  } catch (error) {
    logger.error('Phone rate limit error:', error);
    next(); // Continue on error to not block legitimate requests
  }
};

// Secure session authentication for USSD
const authenticateSecureSession = async (req, res, next) => {
  try {
    const sessionToken = req.headers['x-session-token'] || req.body.sessionToken;

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'Session token required',
        requiresAuth: true
      });
    }

    const validation = await AuthService.validateSecureSession(sessionToken);
    if (!validation.success) {
      return res.status(401).json({
        success: false,
        error: validation.error,
        requiresAuth: true
      });
    }

    req.session = validation.session;
    req.phoneNumber = validation.session.phoneNumber;
    next();
  } catch (error) {
    logger.error('Secure session auth error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error in session authentication'
    });
  }
};

// Wallet operation authorization
const authorizeWalletOperation = (operation) => {
  return async (req, res, next) => {
    try {
      const phoneNumber = req.phoneNumber || req.body.phoneNumber;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          error: 'Phone number required for wallet operations'
        });
      }

      const authorization = await AuthService.authorizeWalletOperation(phoneNumber, operation);
      if (!authorization.success) {
        const statusCode = authorization.requiresAuth || authorization.requiresRecentAuth ? 401 : 403;
        return res.status(statusCode).json({
          success: false,
          error: authorization.error,
          requiresAuth: authorization.requiresAuth,
          requiresRecentAuth: authorization.requiresRecentAuth
        });
      }

      req.authorizedUser = authorization.user;
      next();
    } catch (error) {
      logger.error('Wallet operation auth error:', error);
      return res.status(500).json({
        success: false,
        error: 'Server error in wallet authorization'
      });
    }
  };
};

// Enhanced rate limiting with progressive delays
const enhancedPhoneRateLimit = async (req, res, next) => {
  try {
    const redisClient = require('../db/redisClient');
    const phoneNumber = req.phoneNumber || req.body.phoneNumber;

    if (!phoneNumber) {
      return next();
    }

    const key = `enhanced_rate_limit:${phoneNumber}`;
    const current = await redisClient.get(key);

    if (current) {
      const attempts = parseInt(current);

      // Progressive rate limiting
      if (attempts >= 20) { // 24 hour block
        return res.status(429).json({
          success: false,
          error: 'Account temporarily locked due to excessive requests. Please contact support.'
        });
      } else if (attempts >= 10) { // 1 hour block
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Please wait 1 hour before trying again.'
        });
      } else if (attempts >= 5) { // 15 minute block
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Please wait 15 minutes before trying again.'
        });
      }
    }

    // Increment counter with appropriate expiry
    const newCount = current ? parseInt(current) + 1 : 1;
    let expiry = 3600; // 1 hour default

    if (newCount >= 20) {
      expiry = 86400; // 24 hours
    } else if (newCount >= 10) {
      expiry = 3600; // 1 hour
    } else if (newCount >= 5) {
      expiry = 900; // 15 minutes
    }

    await redisClient.setex(key, expiry, newCount);
    next();
  } catch (error) {
    logger.error('Enhanced phone rate limit error:', error);
    next(); // Continue on error to not block legitimate requests
  }
};

// OTP verification middleware
const verifyOTP = (purpose = 'authentication') => {
  return async (req, res, next) => {
    try {
      const { phoneNumber, otp } = req.body;

      if (!phoneNumber || !otp) {
        return res.status(400).json({
          success: false,
          error: 'Phone number and OTP are required'
        });
      }

      const verification = await AuthService.verifySecureOTP(phoneNumber, otp, purpose);
      if (!verification.success) {
        return res.status(400).json({
          success: false,
          error: verification.error
        });
      }

      req.phoneNumber = verification.phoneNumber;
      req.otpVerified = true;

      // Mark recent authentication for sensitive operations
      await AuthService.markRecentAuthentication(verification.phoneNumber);

      next();
    } catch (error) {
      logger.error('OTP verification error:', error);
      return res.status(500).json({
        success: false,
        error: 'Server error in OTP verification'
      });
    }
  };
};

module.exports = {
  protect,
  authenticatePhone,
  phoneRateLimit,
  authenticateSecureSession,
  authorizeWalletOperation,
  enhancedPhoneRateLimit,
  verifyOTP
};
