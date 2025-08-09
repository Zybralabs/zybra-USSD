const transactionService = require('../services/transactionService');
const KotaniPayService = require('../services/kotaniPayService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

class KotaniPayController {
  /**
   * Initiate mobile money deposit via Kotani Pay
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async initiateDeposit(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { phoneNumber, amount, currency } = req.body;

      // Validate currency is supported
      const supportedCurrencies = ['KES', 'UGX', 'TZS', 'GHS', 'NGN'];
      if (!supportedCurrencies.includes(currency)) {
        return res.status(400).json({
          success: false,
          error: `Currency ${currency} not supported. Supported currencies: ${supportedCurrencies.join(', ')}`
        });
      }

      // Initiate deposit
      const result = await transactionService.initiateKotaniPayDeposit(
        phoneNumber,
        parseFloat(amount),
        currency
      );

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'Deposit initiated successfully',
          data: {
            transactionId: result.transactionId,
            kotaniPayTransactionId: result.kotaniPayTransactionId,
            status: result.status,
            instructions: result.instructions,
            amount: result.amount,
            currency: result.currency
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      logger.error('Error initiating Kotani Pay deposit:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate deposit'
      });
    }
  }

  /**
   * Initiate mobile money withdrawal via Kotani Pay
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async initiateWithdrawal(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { phoneNumber, amount, targetCurrency } = req.body;

      // Validate currency is supported
      const supportedCurrencies = ['KES', 'UGX', 'TZS', 'GHS', 'NGN'];
      if (!supportedCurrencies.includes(targetCurrency)) {
        return res.status(400).json({
          success: false,
          error: `Currency ${targetCurrency} not supported. Supported currencies: ${supportedCurrencies.join(', ')}`
        });
      }

      // Initiate withdrawal
      const result = await transactionService.initiateKotaniPayWithdrawal(
        phoneNumber,
        parseFloat(amount),
        targetCurrency
      );

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'Withdrawal initiated successfully',
          data: {
            transactionId: result.transactionId,
            kotaniPayTransactionId: result.kotaniPayTransactionId,
            status: result.status,
            amount: result.amount,
            currency: result.currency,
            burnTxHash: result.burnTxHash
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      logger.error('Error initiating Kotani Pay withdrawal:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate withdrawal'
      });
    }
  }

  /**
   * Get exchange rates
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getExchangeRates(req, res) {
    try {
      const { fromCurrency, toCurrency } = req.query;

      if (!fromCurrency || !toCurrency) {
        return res.status(400).json({
          success: false,
          error: 'Both fromCurrency and toCurrency are required'
        });
      }

      const result = await KotaniPayService.getExchangeRate(fromCurrency, toCurrency);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: {
            rate: result.rate,
            fromCurrency: result.fromCurrency,
            toCurrency: result.toCurrency,
            timestamp: new Date().toISOString()
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      logger.error('Error getting exchange rates:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get exchange rates'
      });
    }
  }

  /**
   * Get payment providers for a country
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getPaymentProviders(req, res) {
    try {
      const { country } = req.params;

      if (!country) {
        return res.status(400).json({
          success: false,
          error: 'Country code is required'
        });
      }

      const result = await KotaniPayService.getPaymentProviders(country);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: {
            country,
            providers: result.providers
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      logger.error('Error getting payment providers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get payment providers'
      });
    }
  }

  /**
   * Get transaction status from Kotani Pay
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getTransactionStatus(req, res) {
    try {
      const { transactionId } = req.params;
      const { type } = req.query; // 'deposit' or 'withdrawal'

      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: 'Transaction ID is required'
        });
      }

      let result;
      if (type === 'withdrawal') {
        result = await KotaniPayService.getMobileMoneyWithdrawalStatus(transactionId);
      } else {
        result = await KotaniPayService.getMobileMoneyDepositStatus(transactionId);
      }

      if (result.success) {
        res.status(200).json({
          success: true,
          data: {
            transactionId,
            status: result.status,
            amount: result.amount,
            currency: result.currency,
            type: type || 'deposit'
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      logger.error('Error getting transaction status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get transaction status'
      });
    }
  }

  /**
   * Create Kotani Pay customer
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async createCustomer(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { phoneNumber, firstName, lastName, email, country } = req.body;

      const result = await KotaniPayService.createMobileMoneyCustomer({
        phoneNumber,
        firstName,
        lastName,
        email,
        country
      });

      if (result.success) {
        res.status(201).json({
          success: true,
          message: 'Customer created successfully',
          data: {
            customerKey: result.customerKey,
            phoneNumber
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      logger.error('Error creating Kotani Pay customer:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create customer'
      });
    }
  }

  /**
   * Get customer by phone number
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getCustomerByPhone(req, res) {
    try {
      const { phoneNumber } = req.params;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is required'
        });
      }

      const result = await KotaniPayService.getMobileMoneyCustomerByPhone(phoneNumber);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: result.data
        });
      } else if (result.notFound) {
        res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      logger.error('Error getting Kotani Pay customer:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get customer'
      });
    }
  }
}

module.exports = KotaniPayController;
