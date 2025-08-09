const axios = require('axios');
const logger = require('../utils/logger');

class KotaniPayService {
  constructor() {
    this.baseURL = process.env.KOTANI_PAY_BASE_URL || 'https://sandbox-api.kotanipay.io/api/v3';
    this.apiKey = process.env.KOTANI_PAY_API_KEY;
    this.integratorId = process.env.KOTANI_PAY_INTEGRATOR_ID;
    
    // Initialize axios instance
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      timeout: 30000
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info(`Kotani Pay API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Kotani Pay API Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.info(`Kotani Pay API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error('Kotani Pay API Response Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create a mobile money customer
   * @param {Object} customerData - Customer information
   * @returns {Promise<Object>} - Customer creation result
   */
  async createMobileMoneyCustomer(customerData) {
    try {
      const { phoneNumber, firstName, lastName, country } = customerData;

      const payload = {
        phone: phoneNumber,
        first_name: firstName || 'User',
        last_name: lastName || 'Zybra',
        country: country || 'KE', // Default to Kenya
        integrator_id: this.integratorId
      };

      const response = await this.client.post('/customer/mobile-money', payload);
      
      logger.info(`Created Kotani Pay customer for ${phoneNumber}`);
      return {
        success: true,
        data: response.data,
        customerKey: response.data.customer_key
      };

    } catch (error) {
      logger.error('Error creating Kotani Pay customer:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Get mobile money customer by phone number
   * @param {string} phoneNumber - Customer phone number
   * @returns {Promise<Object>} - Customer details
   */
  async getMobileMoneyCustomerByPhone(phoneNumber) {
    try {
      const response = await this.client.get(`/customer/mobile-money/phone/${phoneNumber}`);
      
      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      if (error.response?.status === 404) {
        return {
          success: false,
          error: 'Customer not found',
          notFound: true
        };
      }

      logger.error('Error getting Kotani Pay customer:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Initiate mobile money deposit
   * @param {Object} depositData - Deposit information
   * @returns {Promise<Object>} - Deposit initiation result
   */
  async initiateMobileMoneyDeposit(depositData) {
    try {
      const { 
        phoneNumber, 
        amount, 
        currency, 
        customerKey,
        walletId,
        callbackUrl 
      } = depositData;

      const payload = {
        customer_key: customerKey,
        wallet_id: walletId,
        amount: parseFloat(amount),
        currency: currency,
        phone: phoneNumber,
        callback_url: callbackUrl || `${process.env.BASE_URL}/api/webhooks/kotanipay/deposit`,
        integrator_id: this.integratorId
      };

      const response = await this.client.post('/deposit/mobile-money', payload);
      
      logger.info(`Initiated Kotani Pay deposit for ${phoneNumber}: ${amount} ${currency}`);
      return {
        success: true,
        data: response.data,
        transactionId: response.data.transaction_id,
        status: response.data.status,
        instructions: response.data.instructions
      };

    } catch (error) {
      logger.error('Error initiating Kotani Pay deposit:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Get mobile money deposit status
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} - Deposit status
   */
  async getMobileMoneyDepositStatus(transactionId) {
    try {
      const response = await this.client.get(`/deposit/mobile-money/status/${transactionId}`);
      
      return {
        success: true,
        data: response.data,
        status: response.data.status,
        amount: response.data.amount,
        currency: response.data.currency
      };

    } catch (error) {
      logger.error('Error getting Kotani Pay deposit status:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Initiate mobile money withdrawal
   * @param {Object} withdrawalData - Withdrawal information
   * @returns {Promise<Object>} - Withdrawal initiation result
   */
  async initiateMobileMoneyWithdrawal(withdrawalData) {
    try {
      const { 
        phoneNumber, 
        amount, 
        currency, 
        customerKey,
        walletId,
        callbackUrl 
      } = withdrawalData;

      const payload = {
        customer_key: customerKey,
        wallet_id: walletId,
        amount: parseFloat(amount),
        currency: currency,
        phone: phoneNumber,
        callback_url: callbackUrl || `${process.env.BASE_URL}/api/webhooks/kotanipay/withdrawal`,
        integrator_id: this.integratorId
      };

      const response = await this.client.post('/withdraw/mobile-money', payload);
      
      logger.info(`Initiated Kotani Pay withdrawal for ${phoneNumber}: ${amount} ${currency}`);
      return {
        success: true,
        data: response.data,
        transactionId: response.data.transaction_id,
        status: response.data.status
      };

    } catch (error) {
      logger.error('Error initiating Kotani Pay withdrawal:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Get mobile money withdrawal status
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} - Withdrawal status
   */
  async getMobileMoneyWithdrawalStatus(transactionId) {
    try {
      const response = await this.client.get(`/withdraw/mobile-money/status/${transactionId}`);
      
      return {
        success: true,
        data: response.data,
        status: response.data.status,
        amount: response.data.amount,
        currency: response.data.currency
      };

    } catch (error) {
      logger.error('Error getting Kotani Pay withdrawal status:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Get exchange rates
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {Promise<Object>} - Exchange rate
   */
  async getExchangeRate(fromCurrency, toCurrency) {
    try {
      const payload = {
        from_currency: fromCurrency,
        to_currency: toCurrency,
        integrator_id: this.integratorId
      };

      const response = await this.client.post('/rate', payload);
      
      return {
        success: true,
        data: response.data,
        rate: response.data.rate,
        fromCurrency: response.data.from_currency,
        toCurrency: response.data.to_currency
      };

    } catch (error) {
      logger.error('Error getting Kotani Pay exchange rate:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Get payment providers for a country
   * @param {string} country - Country code
   * @returns {Promise<Object>} - Available payment providers
   */
  async getPaymentProviders(country) {
    try {
      const payload = {
        country: country,
        integrator_id: this.integratorId
      };

      const response = await this.client.post('/payment-providers', payload);
      
      return {
        success: true,
        data: response.data,
        providers: response.data.providers
      };

    } catch (error) {
      logger.error('Error getting Kotani Pay payment providers:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Create or get fiat wallet
   * @param {string} currency - Wallet currency
   * @returns {Promise<Object>} - Wallet details
   */
  async createFiatWallet(currency) {
    try {
      const payload = {
        currency: currency,
        integrator_id: this.integratorId
      };

      const response = await this.client.post('/wallet/fiat', payload);
      
      return {
        success: true,
        data: response.data,
        walletId: response.data.wallet_id,
        currency: response.data.currency,
        balance: response.data.balance
      };

    } catch (error) {
      logger.error('Error creating Kotani Pay fiat wallet:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Get fiat wallet by currency
   * @param {string} currency - Wallet currency
   * @returns {Promise<Object>} - Wallet details
   */
  async getFiatWalletByCurrency(currency) {
    try {
      const response = await this.client.get(`/wallet/fiat/currency/${currency}`);
      
      return {
        success: true,
        data: response.data,
        walletId: response.data.wallet_id,
        currency: response.data.currency,
        balance: response.data.balance
      };

    } catch (error) {
      logger.error('Error getting Kotani Pay fiat wallet:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Verify webhook signature
   * @param {string} payload - Raw payload
   * @param {string} signature - Webhook signature
   * @returns {boolean} - Verification result
   */
  verifyWebhookSignature(payload, signature) {
    try {
      const webhookSecret = process.env.KOTANI_PAY_WEBHOOK_SECRET;
      if (!webhookSecret) {
        logger.warn('Kotani Pay webhook secret not configured');
        return true; // Allow webhook if secret not configured
      }

      const expectedSignature = require('crypto')
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');
      
      return require('crypto').timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error('Error verifying Kotani Pay webhook signature:', error);
      return false;
    }
  }
}

module.exports = new KotaniPayService();
