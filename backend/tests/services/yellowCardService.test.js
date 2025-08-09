const YellowCardService = require('../../src/services/yellowCardService');
const axios = require('axios');
const crypto = require('crypto');
const { YellowCardTransaction } = require('../../src/db/models');

// Mock dependencies
jest.mock('axios');
jest.mock('../../src/db/models');

describe('YellowCardService', () => {
  const mockApiKey = 'test-api-key';
  const mockSecretKey = 'test-secret-key';
  
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.YELLOWCARD_API_KEY = mockApiKey;
    process.env.YELLOWCARD_SECRET_KEY = mockSecretKey;
  });

  describe('generateHMACSignature', () => {
    test('should generate correct HMAC signature', () => {
      const payload = { test: 'data' };
      const timestamp = '1234567890';
      
      const signature = YellowCardService.generateHMACSignature(payload, timestamp);
      
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
    });

    test('should generate different signatures for different payloads', () => {
      const payload1 = { test: 'data1' };
      const payload2 = { test: 'data2' };
      const timestamp = '1234567890';
      
      const signature1 = YellowCardService.generateHMACSignature(payload1, timestamp);
      const signature2 = YellowCardService.generateHMACSignature(payload2, timestamp);
      
      expect(signature1).not.toBe(signature2);
    });
  });

  describe('makeAuthenticatedRequest', () => {
    const mockResponse = {
      data: { success: true, data: { id: '123' } },
      status: 200
    };

    beforeEach(() => {
      axios.mockResolvedValue(mockResponse);
    });

    test('should make authenticated POST request', async () => {
      const endpoint = '/test';
      const payload = { test: 'data' };
      
      const result = await YellowCardService.makeAuthenticatedRequest('POST', endpoint, payload);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data.data);
      expect(axios).toHaveBeenCalledWith({
        method: 'POST',
        url: expect.stringContaining(endpoint),
        data: payload,
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-YC-Timestamp': expect.any(String),
          'Authorization': expect.stringContaining('Bearer')
        })
      });
    });

    test('should make authenticated GET request', async () => {
      const endpoint = '/test';
      
      const result = await YellowCardService.makeAuthenticatedRequest('GET', endpoint);
      
      expect(result.success).toBe(true);
      expect(axios).toHaveBeenCalledWith({
        method: 'GET',
        url: expect.stringContaining(endpoint),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-YC-Timestamp': expect.any(String),
          'Authorization': expect.stringContaining('Bearer')
        })
      });
    });

    test('should handle API errors', async () => {
      const errorResponse = {
        response: {
          status: 400,
          data: { error: 'Bad request' }
        }
      };
      axios.mockRejectedValue(errorResponse);
      
      const result = await YellowCardService.makeAuthenticatedRequest('POST', '/test', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Bad request');
    });

    test('should handle network errors', async () => {
      axios.mockRejectedValue(new Error('Network error'));
      
      const result = await YellowCardService.makeAuthenticatedRequest('POST', '/test', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('purchaseCrypto', () => {
    const mockPurchaseData = {
      phoneNumber: '254712345678',
      fiatAmount: 1000,
      fiatCurrency: 'KES',
      cryptoCurrency: 'USDT',
      countryCode: 'KE',
      paymentMethod: 'mobile_money',
      firstName: 'John',
      lastName: 'Doe'
    };

    const mockApiResponse = {
      success: true,
      data: {
        id: 'collection-123',
        status: 'pending',
        amount: 1000,
        currency: 'KES',
        crypto_amount: 15.5,
        crypto_currency: 'USDT',
        payment_url: 'https://pay.yellowcard.io/123'
      }
    };

    beforeEach(() => {
      YellowCardService.makeAuthenticatedRequest = jest.fn().mockResolvedValue(mockApiResponse);
      YellowCardTransaction.create = jest.fn().mockResolvedValue({ id: 1 });
    });

    test('should successfully initiate crypto purchase', async () => {
      const result = await YellowCardService.purchaseCrypto(mockPurchaseData);
      
      expect(result.success).toBe(true);
      expect(result.data.collectionId).toBe('collection-123');
      expect(result.data.paymentUrl).toBe('https://pay.yellowcard.io/123');
      expect(YellowCardTransaction.create).toHaveBeenCalledWith({
        phoneNumber: mockPurchaseData.phoneNumber,
        yellowcardId: 'collection-123',
        type: 'buy',
        fiatAmount: 1000,
        fiatCurrency: 'KES',
        cryptoAmount: 15.5,
        cryptoCurrency: 'USDT',
        status: 'pending',
        paymentMethod: 'mobile_money',
        metadata: expect.any(Object)
      });
    });

    test('should validate required fields', async () => {
      const invalidData = { ...mockPurchaseData };
      delete invalidData.phoneNumber;
      
      const result = await YellowCardService.purchaseCrypto(invalidData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Phone number is required');
    });

    test('should validate minimum amount', async () => {
      const invalidData = { ...mockPurchaseData, fiatAmount: 50 };
      
      const result = await YellowCardService.purchaseCrypto(invalidData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Minimum amount is 100 KES');
    });

    test('should handle API errors', async () => {
      YellowCardService.makeAuthenticatedRequest.mockResolvedValue({
        success: false,
        error: 'Insufficient funds'
      });
      
      const result = await YellowCardService.purchaseCrypto(mockPurchaseData);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient funds');
    });
  });

  describe('sellCrypto', () => {
    const mockSellData = {
      phoneNumber: '254712345678',
      cryptoAmount: 15.5,
      cryptoCurrency: 'USDT',
      fiatCurrency: 'KES',
      countryCode: 'KE',
      paymentMethod: 'mobile_money',
      firstName: 'John',
      lastName: 'Doe'
    };

    const mockApiResponse = {
      success: true,
      data: {
        id: 'payment-123',
        status: 'pending',
        crypto_amount: 15.5,
        crypto_currency: 'USDT',
        fiat_amount: 950,
        fiat_currency: 'KES'
      }
    };

    beforeEach(() => {
      YellowCardService.makeAuthenticatedRequest = jest.fn().mockResolvedValue(mockApiResponse);
      YellowCardTransaction.create = jest.fn().mockResolvedValue({ id: 1 });
    });

    test('should successfully initiate crypto sale', async () => {
      const result = await YellowCardService.sellCrypto(mockSellData);
      
      expect(result.success).toBe(true);
      expect(result.data.paymentId).toBe('payment-123');
      expect(result.data.fiatAmount).toBe(950);
      expect(YellowCardTransaction.create).toHaveBeenCalledWith({
        phoneNumber: mockSellData.phoneNumber,
        yellowcardId: 'payment-123',
        type: 'sell',
        cryptoAmount: 15.5,
        cryptoCurrency: 'USDT',
        fiatAmount: 950,
        fiatCurrency: 'KES',
        status: 'pending',
        paymentMethod: 'mobile_money',
        metadata: expect.any(Object)
      });
    });

    test('should validate required fields', async () => {
      const invalidData = { ...mockSellData };
      delete invalidData.cryptoAmount;
      
      const result = await YellowCardService.sellCrypto(invalidData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Crypto amount is required');
    });

    test('should validate minimum crypto amount', async () => {
      const invalidData = { ...mockSellData, cryptoAmount: 0.5 };
      
      const result = await YellowCardService.sellCrypto(invalidData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Minimum crypto amount is 1 USDT');
    });
  });

  describe('getTransactionStatus', () => {
    test('should get collection status', async () => {
      const mockResponse = {
        success: true,
        data: {
          id: 'collection-123',
          status: 'completed',
          amount: 1000,
          currency: 'KES'
        }
      };
      
      YellowCardService.makeAuthenticatedRequest = jest.fn().mockResolvedValue(mockResponse);
      
      const result = await YellowCardService.getTransactionStatus('collection-123', 'collection');
      
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('completed');
      expect(YellowCardService.makeAuthenticatedRequest).toHaveBeenCalledWith(
        'GET',
        '/collections/collection-123'
      );
    });

    test('should get payment status', async () => {
      const mockResponse = {
        success: true,
        data: {
          id: 'payment-123',
          status: 'completed',
          crypto_amount: 15.5
        }
      };
      
      YellowCardService.makeAuthenticatedRequest = jest.fn().mockResolvedValue(mockResponse);
      
      const result = await YellowCardService.getTransactionStatus('payment-123', 'payment');
      
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('completed');
      expect(YellowCardService.makeAuthenticatedRequest).toHaveBeenCalledWith(
        'GET',
        '/payments/payment-123'
      );
    });

    test('should handle invalid transaction type', async () => {
      const result = await YellowCardService.getTransactionStatus('123', 'invalid');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid transaction type. Must be "collection" or "payment"');
    });
  });

  describe('processWebhook', () => {
    const mockWebhookData = {
      id: 'collection-123',
      status: 'completed',
      amount: 1000,
      currency: 'KES',
      crypto_amount: 15.5,
      crypto_currency: 'USDT',
      type: 'collection'
    };

    beforeEach(() => {
      YellowCardTransaction.findByYellowCardId = jest.fn().mockResolvedValue({
        id: 1,
        phoneNumber: '254712345678',
        status: 'pending',
        update: jest.fn().mockResolvedValue(true)
      });
    });

    test('should process successful webhook', async () => {
      const result = await YellowCardService.processWebhook(mockWebhookData);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Webhook processed successfully');
    });

    test('should handle transaction not found', async () => {
      YellowCardTransaction.findByYellowCardId.mockResolvedValue(null);
      
      const result = await YellowCardService.processWebhook(mockWebhookData);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Transaction not found');
    });

    test('should validate webhook signature', () => {
      const payload = JSON.stringify(mockWebhookData);
      const timestamp = '1234567890';
      const signature = YellowCardService.generateHMACSignature(mockWebhookData, timestamp);
      
      const isValid = YellowCardService.validateWebhookSignature(payload, timestamp, signature);
      
      expect(isValid).toBe(true);
    });

    test('should reject invalid webhook signature', () => {
      const payload = JSON.stringify(mockWebhookData);
      const timestamp = '1234567890';
      const invalidSignature = 'invalid-signature';
      
      const isValid = YellowCardService.validateWebhookSignature(payload, timestamp, invalidSignature);
      
      expect(isValid).toBe(false);
    });
  });
});
