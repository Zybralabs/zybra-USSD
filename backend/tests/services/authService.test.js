const AuthService = require('../../src/services/authService');
const redisClient = require('../../src/db/redisClient');
const SMSService = require('../../src/services/smsEngine');
const { User } = require('../../src/db/models');

// Mock dependencies
jest.mock('../../src/db/redisClient');
jest.mock('../../src/services/smsEngine');
jest.mock('../../src/db/models');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validatePhoneNumber', () => {
    test('should validate Kenyan phone number', () => {
      const result = AuthService.validatePhoneNumber('254712345678');
      expect(result.isValid).toBe(true);
      expect(result.normalizedNumber).toBe('254712345678');
      expect(result.countryCode).toBe('254');
      expect(result.country).toBe('Kenya');
    });

    test('should validate Nigerian phone number', () => {
      const result = AuthService.validatePhoneNumber('+234 801 234 5678');
      expect(result.isValid).toBe(true);
      expect(result.normalizedNumber).toBe('2348012345678');
      expect(result.countryCode).toBe('234');
      expect(result.country).toBe('Nigeria');
    });

    test('should reject invalid phone number', () => {
      const result = AuthService.validatePhoneNumber('123456789');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should reject unsupported country code', () => {
      const result = AuthService.validatePhoneNumber('1234567890123');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('generateSecureOTP', () => {
    beforeEach(() => {
      redisClient.get.mockResolvedValue(null);
      redisClient.setex.mockResolvedValue('OK');
      redisClient.multi.mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(['OK', 'OK'])
      });
      SMSService.sendOTP.mockResolvedValue({ success: true });
    });

    test('should generate OTP for valid phone number', async () => {
      const result = await AuthService.generateSecureOTP('254712345678', 'authentication');
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('OTP sent successfully');
      expect(result.expiresIn).toBe(300);
      expect(SMSService.sendOTP).toHaveBeenCalledWith('254712345678', expect.any(String), 'authentication');
    });

    test('should reject invalid phone number', async () => {
      const result = await AuthService.generateSecureOTP('invalid', 'authentication');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should enforce rate limiting', async () => {
      redisClient.get.mockResolvedValue('3');
      
      const result = await AuthService.generateSecureOTP('254712345678', 'authentication');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many OTP requests');
    });

    test('should handle SMS sending failure', async () => {
      SMSService.sendOTP.mockResolvedValue({ success: false });
      
      const result = await AuthService.generateSecureOTP('254712345678', 'authentication');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to send OTP');
    });
  });

  describe('verifySecureOTP', () => {
    const mockOTPData = {
      hash: 'mock-hash',
      purpose: 'authentication',
      attempts: 0,
      createdAt: new Date().toISOString(),
      phoneNumber: '254712345678'
    };

    beforeEach(() => {
      // Mock crypto hash to return predictable value
      const crypto = require('crypto');
      jest.spyOn(crypto, 'createHash').mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('mock-hash')
      });
    });

    test('should verify valid OTP', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify(mockOTPData));
      redisClient.del.mockResolvedValue(1);
      
      const result = await AuthService.verifySecureOTP('254712345678', '123456', 'authentication');
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('OTP verified successfully');
      expect(result.phoneNumber).toBe('254712345678');
      expect(redisClient.del).toHaveBeenCalled();
    });

    test('should reject expired OTP', async () => {
      redisClient.get.mockResolvedValue(null);
      
      const result = await AuthService.verifySecureOTP('254712345678', '123456', 'authentication');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('OTP expired or not found');
    });

    test('should reject invalid OTP', async () => {
      const crypto = require('crypto');
      crypto.createHash.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('wrong-hash')
      });
      
      redisClient.get.mockResolvedValue(JSON.stringify(mockOTPData));
      redisClient.setex.mockResolvedValue('OK');
      
      const result = await AuthService.verifySecureOTP('254712345678', '123456', 'authentication');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid OTP');
    });

    test('should handle too many attempts', async () => {
      const maxAttemptsData = { ...mockOTPData, attempts: 3 };
      redisClient.get.mockResolvedValue(JSON.stringify(maxAttemptsData));
      redisClient.del.mockResolvedValue(1);
      
      const result = await AuthService.verifySecureOTP('254712345678', '123456', 'authentication');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many failed attempts');
    });
  });

  describe('createSecureSession', () => {
    beforeEach(() => {
      redisClient.setex.mockResolvedValue('OK');
    });

    test('should create secure session', async () => {
      const result = await AuthService.createSecureSession('254712345678', 'ussd', 30);
      
      expect(result.success).toBe(true);
      expect(result.sessionToken).toBeDefined();
      expect(result.expiresIn).toBe(1800);
      expect(result.phoneNumber).toBe('254712345678');
      expect(redisClient.setex).toHaveBeenCalledTimes(2); // Session and phone mapping
    });

    test('should reject invalid phone number', async () => {
      const result = await AuthService.createSecureSession('invalid', 'ussd', 30);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateSecureSession', () => {
    const mockSessionData = {
      phoneNumber: '254712345678',
      purpose: 'ussd',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      isActive: true
    };

    test('should validate active session', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify(mockSessionData));
      
      const result = await AuthService.validateSecureSession('valid-token');
      
      expect(result.success).toBe(true);
      expect(result.session.phoneNumber).toBe('254712345678');
    });

    test('should reject missing session token', async () => {
      const result = await AuthService.validateSecureSession(null);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Session token required');
    });

    test('should reject expired session', async () => {
      const expiredSessionData = {
        ...mockSessionData,
        expiresAt: new Date(Date.now() - 1000).toISOString()
      };
      redisClient.get.mockResolvedValue(JSON.stringify(expiredSessionData));
      redisClient.del.mockResolvedValue(1);
      
      const result = await AuthService.validateSecureSession('expired-token');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Session expired');
      expect(redisClient.del).toHaveBeenCalled();
    });

    test('should reject non-existent session', async () => {
      redisClient.get.mockResolvedValue(null);
      
      const result = await AuthService.validateSecureSession('invalid-token');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid or expired session');
    });
  });

  describe('authorizeWalletOperation', () => {
    const mockUser = {
      phone_number: '254712345678',
      wallet_address: '0x123...',
      balance: 100
    };

    beforeEach(() => {
      User.findByPhone.mockResolvedValue(mockUser);
      redisClient.get.mockImplementation((key) => {
        if (key.includes('phone_session')) return Promise.resolve('session-token');
        if (key.includes('recent_auth')) return Promise.resolve(new Date().toISOString());
        return Promise.resolve(null);
      });
    });

    test('should authorize valid wallet operation', async () => {
      const mockSessionData = {
        phoneNumber: '254712345678',
        purpose: 'ussd',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        isActive: true
      };
      
      redisClient.get.mockImplementation((key) => {
        if (key.includes('secure_session')) return Promise.resolve(JSON.stringify(mockSessionData));
        if (key.includes('phone_session')) return Promise.resolve('session-token');
        if (key.includes('recent_auth')) return Promise.resolve(new Date().toISOString());
        return Promise.resolve(null);
      });
      
      const result = await AuthService.authorizeWalletOperation('254712345678', 'invest');
      
      expect(result.success).toBe(true);
      expect(result.user.phoneNumber).toBe('254712345678');
    });

    test('should reject for non-existent user', async () => {
      User.findByPhone.mockResolvedValue(null);
      
      const result = await AuthService.authorizeWalletOperation('254712345678', 'invest');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    test('should require authentication for missing session', async () => {
      redisClient.get.mockImplementation((key) => {
        if (key.includes('phone_session')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      
      const result = await AuthService.authorizeWalletOperation('254712345678', 'invest');
      
      expect(result.success).toBe(false);
      expect(result.requiresAuth).toBe(true);
    });

    test('should require recent auth for sensitive operations', async () => {
      const mockSessionData = {
        phoneNumber: '254712345678',
        purpose: 'ussd',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        isActive: true
      };
      
      redisClient.get.mockImplementation((key) => {
        if (key.includes('secure_session')) return Promise.resolve(JSON.stringify(mockSessionData));
        if (key.includes('phone_session')) return Promise.resolve('session-token');
        if (key.includes('recent_auth')) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      
      const result = await AuthService.authorizeWalletOperation('254712345678', 'invest');
      
      expect(result.success).toBe(false);
      expect(result.requiresRecentAuth).toBe(true);
    });
  });

  describe('markRecentAuthentication', () => {
    test('should mark recent authentication', async () => {
      redisClient.setex.mockResolvedValue('OK');
      
      const result = await AuthService.markRecentAuthentication('254712345678');
      
      expect(result).toBe(true);
      expect(redisClient.setex).toHaveBeenCalledWith(
        'recent_auth:254712345678',
        600,
        expect.any(String)
      );
    });

    test('should handle invalid phone number', async () => {
      const result = await AuthService.markRecentAuthentication('invalid');
      
      expect(result).toBe(false);
    });
  });
});
