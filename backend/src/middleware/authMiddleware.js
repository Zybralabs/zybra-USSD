const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../db/models/User');
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

// Phone number authentication for SMS/USSD
const authenticatePhone = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    // Normalize phone number (remove +, spaces, etc.)
    const normalizedPhone = phoneNumber.replace(/[\s\-\+]/g, '');
    
    // Validate phone number format (basic validation)
    if (!/^\d{10,15}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format'
      });
    }

    req.phoneNumber = normalizedPhone;
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

module.exports = {
  protect,
  authenticatePhone,
  phoneRateLimit
};
