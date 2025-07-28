const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class YellowCardService {
  constructor() {
    this.apiKey = process.env.YELLOWCARD_API_KEY;
    this.apiSecret = process.env.YELLOWCARD_API_SECRET;
    this.baseURL = process.env.YELLOWCARD_API_URL || 'https://sandbox.api.yellowcard.io';
    
    if (!this.apiKey || !this.apiSecret) {
      logger.warn('YellowCard API credentials not configured');
    }
  }

  /**
   * Generate HMAC signature for YellowCard API authentication
   * @param {string} timestamp - ISO8601 timestamp
   * @param {string} path - API endpoint path
   * @param {string} method - HTTP method
   * @param {string} body - Request body (base64 encoded SHA256 hash for POST/PUT)
   * @returns {string} - HMAC signature
   */
  generateSignature(timestamp, path, method, body = '') {
    const message = `${timestamp}${path}${method.toUpperCase()}${body}`;
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(message)
      .digest('base64');
  }

  /**
   * Make authenticated request to YellowCard API
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @returns {Promise<Object>} - API response
   */
  async makeRequest(method, endpoint, data = null) {
    try {
      const timestamp = new Date().toISOString();
      const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      
      let bodyHash = '';
      if (data && (method.toLowerCase() === 'post' || method.toLowerCase() === 'put')) {
        const bodyString = JSON.stringify(data);
        bodyHash = crypto.createHash('sha256').update(bodyString).digest('base64');
      }

      const signature = this.generateSignature(timestamp, path, method, bodyHash);
      
      const config = {
        method: method.toLowerCase(),
        url: `${this.baseURL}${path}`,
        headers: {
          'Content-Type': 'application/json',
          'X-YC-Timestamp': timestamp,
          'Authorization': `YcHmacV1 ${this.apiKey}:${signature}`
        }
      };

      if (data) {
        config.data = data;
      }

      logger.info(`YellowCard API Request: ${method} ${path}`);
      const response = await axios(config);
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('YellowCard API Error:', {
        endpoint,
        method,
        error: error.response?.data || error.message
      });
      
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        statusCode: error.response?.status
      };
    }
  }

  /**
   * Get available payment channels for a country
   * @param {string} countryCode - ISO country code (e.g., 'KE', 'NG', 'GH')
   * @returns {Promise<Object>} - Available channels
   */
  async getChannels(countryCode = null) {
    try {
      let endpoint = '/business/channels';
      if (countryCode) {
        endpoint += `?country=${countryCode}`;
      }

      const result = await this.makeRequest('GET', endpoint);
      
      if (result.success) {
        // Filter only active channels
        const activeChannels = result.data.filter(channel => 
          channel.status === 'active' && channel.apiStatus === 'active'
        );
        
        return {
          success: true,
          channels: activeChannels
        };
      }
      
      return result;
    } catch (error) {
      logger.error('Error getting YellowCard channels:', error);
      return {
        success: false,
        error: 'Failed to fetch payment channels'
      };
    }
  }

  /**
   * Get available mobile money networks for a country
   * @param {string} countryCode - ISO country code
   * @returns {Promise<Object>} - Available networks
   */
  async getNetworks(countryCode) {
    try {
      const endpoint = `/business/networks?country=${countryCode}`;
      const result = await this.makeRequest('GET', endpoint);
      
      if (result.success) {
        return {
          success: true,
          networks: result.data
        };
      }
      
      return result;
    } catch (error) {
      logger.error('Error getting YellowCard networks:', error);
      return {
        success: false,
        error: 'Failed to fetch mobile money networks'
      };
    }
  }

  /**
   * Get exchange rates for fiat to crypto conversion
   * @param {string} fromCurrency - Source currency (e.g., 'KES', 'NGN')
   * @param {string} toCurrency - Target currency (e.g., 'USDT', 'USDC')
   * @param {string} countryCode - ISO country code
   * @returns {Promise<Object>} - Exchange rates
   */
  async getRates(fromCurrency, toCurrency = 'USDT', countryCode) {
    try {
      const endpoint = `/business/rates?from=${fromCurrency}&to=${toCurrency}&country=${countryCode}`;
      const result = await this.makeRequest('GET', endpoint);
      
      if (result.success) {
        return {
          success: true,
          rate: result.data.rate,
          fromCurrency,
          toCurrency,
          timestamp: result.data.timestamp
        };
      }
      
      return result;
    } catch (error) {
      logger.error('Error getting YellowCard rates:', error);
      return {
        success: false,
        error: 'Failed to fetch exchange rates'
      };
    }
  }

  /**
   * Submit a collection request (buy crypto with fiat)
   * @param {Object} collectionData - Collection request data
   * @returns {Promise<Object>} - Collection request result
   */
  async submitCollectionRequest(collectionData) {
    try {
      const {
        phoneNumber,
        amount,
        currency,
        cryptoCurrency = 'USDT',
        countryCode,
        channel,
        network = null,
        firstName,
        lastName,
        reason = 'crypto_purchase'
      } = collectionData;

      const requestData = {
        amount: parseFloat(amount),
        currency: cryptoCurrency, // Target crypto currency
        fiatCurrency: currency, // Source fiat currency
        country: countryCode,
        channel: channel,
        customer: {
          firstName,
          lastName,
          phoneNumber,
          ...(network && { network })
        },
        reason,
        sequenceId: `YC_${Date.now()}_${phoneNumber.slice(-4)}`
      };

      const result = await this.makeRequest('POST', '/business/collections', requestData);
      
      if (result.success) {
        return {
          success: true,
          collectionId: result.data.id,
          sequenceId: result.data.sequenceId,
          status: result.data.status,
          amount: result.data.amount,
          fiatAmount: result.data.fiatAmount,
          rate: result.data.rate,
          instructions: result.data.instructions
        };
      }
      
      return result;
    } catch (error) {
      logger.error('Error submitting YellowCard collection request:', error);
      return {
        success: false,
        error: 'Failed to submit collection request'
      };
    }
  }

  /**
   * Accept a collection request
   * @param {string} collectionId - Collection request ID
   * @returns {Promise<Object>} - Accept result
   */
  async acceptCollectionRequest(collectionId) {
    try {
      const result = await this.makeRequest('POST', `/business/collections/${collectionId}/accept`);
      
      if (result.success) {
        return {
          success: true,
          collectionId,
          status: result.data.status,
          message: 'Collection request accepted'
        };
      }
      
      return result;
    } catch (error) {
      logger.error('Error accepting YellowCard collection request:', error);
      return {
        success: false,
        error: 'Failed to accept collection request'
      };
    }
  }

  /**
   * Get collection status
   * @param {string} collectionId - Collection request ID
   * @returns {Promise<Object>} - Collection status
   */
  async getCollectionStatus(collectionId) {
    try {
      const result = await this.makeRequest('GET', `/business/collections/${collectionId}`);
      
      if (result.success) {
        return {
          success: true,
          collection: result.data
        };
      }
      
      return result;
    } catch (error) {
      logger.error('Error getting YellowCard collection status:', error);
      return {
        success: false,
        error: 'Failed to get collection status'
      };
    }
  }

  /**
   * Process crypto purchase through YellowCard
   * @param {Object} purchaseData - Purchase data
   * @returns {Promise<Object>} - Purchase result
   */
  async purchaseCrypto(purchaseData) {
    try {
      const {
        phoneNumber,
        fiatAmount,
        fiatCurrency,
        cryptoCurrency = 'USDT',
        countryCode,
        paymentMethod,
        firstName,
        lastName
      } = purchaseData;

      // Step 1: Get available channels
      const channelsResult = await this.getChannels(countryCode);
      if (!channelsResult.success) {
        return channelsResult;
      }

      // Find the requested payment method
      const channel = channelsResult.channels.find(ch =>
        ch.name.toLowerCase().includes(paymentMethod.toLowerCase())
      );

      if (!channel) {
        return {
          success: false,
          error: `Payment method ${paymentMethod} not available in ${countryCode}`
        };
      }

      // Step 2: Get current rates
      const ratesResult = await this.getRates(fiatCurrency, cryptoCurrency, countryCode);
      if (!ratesResult.success) {
        return ratesResult;
      }

      // Step 3: Submit collection request
      const collectionResult = await this.submitCollectionRequest({
        phoneNumber,
        amount: fiatAmount,
        currency: fiatCurrency,
        cryptoCurrency,
        countryCode,
        channel: channel.id,
        firstName,
        lastName
      });

      if (!collectionResult.success) {
        return collectionResult;
      }

      // Step 4: Auto-accept the collection request
      const acceptResult = await this.acceptCollectionRequest(collectionResult.collectionId);

      return {
        success: true,
        collectionId: collectionResult.collectionId,
        sequenceId: collectionResult.sequenceId,
        fiatAmount,
        cryptoAmount: collectionResult.amount,
        rate: ratesResult.rate,
        status: acceptResult.success ? 'accepted' : 'pending',
        instructions: collectionResult.instructions
      };

    } catch (error) {
      logger.error('Error processing YellowCard crypto purchase:', error);
      return {
        success: false,
        error: 'Failed to process crypto purchase'
      };
    }
  }

  /**
   * Submit a payment request (sell crypto for fiat)
   * @param {Object} paymentData - Payment request data
   * @returns {Promise<Object>} - Payment request result
   */
  async submitPaymentRequest(paymentData) {
    try {
      const {
        phoneNumber,
        amount,
        cryptoCurrency = 'USDT',
        fiatCurrency,
        countryCode,
        channel,
        firstName,
        lastName,
        accountNumber,
        bankCode
      } = paymentData;

      const requestData = {
        amount: parseFloat(amount),
        currency: fiatCurrency, // Target fiat currency
        cryptoCurrency, // Source crypto currency
        country: countryCode,
        channel: channel,
        beneficiary: {
          firstName,
          lastName,
          phoneNumber,
          accountNumber,
          bankCode
        },
        sequenceId: `YC_PAYOUT_${Date.now()}_${phoneNumber.slice(-4)}`
      };

      const result = await this.makeRequest('POST', '/business/payments', requestData);

      if (result.success) {
        return {
          success: true,
          paymentId: result.data.id,
          sequenceId: result.data.sequenceId,
          status: result.data.status,
          amount: result.data.amount,
          fiatAmount: result.data.fiatAmount,
          rate: result.data.rate
        };
      }

      return result;
    } catch (error) {
      logger.error('Error submitting YellowCard payment request:', error);
      return {
        success: false,
        error: 'Failed to submit payment request'
      };
    }
  }

  /**
   * Get supported countries and their details
   * @returns {Promise<Object>} - Supported countries
   */
  async getSupportedCountries() {
    try {
      const channelsResult = await this.getChannels();

      if (channelsResult.success) {
        // Extract unique countries from channels
        const countries = [...new Set(channelsResult.channels.map(ch => ch.country))];

        return {
          success: true,
          countries: countries.map(country => ({
            code: country,
            name: this.getCountryName(country),
            currencies: this.getCountryCurrencies(country)
          }))
        };
      }

      return channelsResult;
    } catch (error) {
      logger.error('Error getting supported countries:', error);
      return {
        success: false,
        error: 'Failed to get supported countries'
      };
    }
  }

  /**
   * Get country name from country code
   * @param {string} countryCode - ISO country code
   * @returns {string} - Country name
   */
  getCountryName(countryCode) {
    const countryNames = {
      'KE': 'Kenya',
      'NG': 'Nigeria',
      'GH': 'Ghana',
      'UG': 'Uganda',
      'TZ': 'Tanzania',
      'RW': 'Rwanda',
      'ZA': 'South Africa',
      'ZM': 'Zambia',
      'MW': 'Malawi',
      'BF': 'Burkina Faso',
      'CI': 'Côte d\'Ivoire',
      'SN': 'Senegal',
      'ML': 'Mali',
      'BJ': 'Benin',
      'TG': 'Togo',
      'NE': 'Niger',
      'CM': 'Cameroon',
      'CD': 'Democratic Republic of Congo',
      'MG': 'Madagascar',
      'ET': 'Ethiopia'
    };

    return countryNames[countryCode] || countryCode;
  }

  /**
   * Get supported currencies for a country
   * @param {string} countryCode - ISO country code
   * @returns {Array} - Supported currencies
   */
  getCountryCurrencies(countryCode) {
    const countryCurrencies = {
      'KE': ['KES'],
      'NG': ['NGN'],
      'GH': ['GHS'],
      'UG': ['UGX'],
      'TZ': ['TZS'],
      'RW': ['RWF'],
      'ZA': ['ZAR'],
      'ZM': ['ZMW'],
      'MW': ['MWK'],
      'BF': ['XOF'],
      'CI': ['XOF'],
      'SN': ['XOF'],
      'ML': ['XOF'],
      'BJ': ['XOF'],
      'TG': ['XOF'],
      'NE': ['XOF'],
      'CM': ['XAF'],
      'CD': ['CDF'],
      'MG': ['MGA'],
      'ET': ['ETB']
    };

    return countryCurrencies[countryCode] || ['USD'];
  }

  /**
   * Validate webhook signature
   * @param {string} payload - Webhook payload
   * @param {string} signature - Webhook signature
   * @param {string} secret - Webhook secret
   * @returns {boolean} - Validation result
   */
  validateWebhookSignature(payload, signature, secret) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      return signature === expectedSignature;
    } catch (error) {
      logger.error('Error validating YellowCard webhook signature:', error);
      return false;
    }
  }
}

module.exports = new YellowCardService();
