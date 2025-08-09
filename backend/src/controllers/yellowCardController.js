const transactionService = require('../services/transactionService');
const YellowCardService = require('../services/yellowCardService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

class YellowCardController {
  /**
   * Initiate collection (deposit) via Yellow Card
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async initiateCollection(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { phoneNumber, amount, currency, countryCode } = req.body;

      // Validate currency is supported
      const supportedCurrencies = YellowCardService.getSupportedCurrencies().map(c => c.code);
      if (!supportedCurrencies.includes(currency)) {
        return res.status(400).json({
          success: false,
          error: `Currency ${currency} not supported. Supported currencies: ${supportedCurrencies.join(', ')}`
        });
      }

      // Initiate collection
      const result = await transactionService.initiateYellowCardDeposit(
        phoneNumber,
        parseFloat(amount),
        currency,
        countryCode
      );

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'Collection initiated successfully',
          data: {
            transactionId: result.transactionId,
            collectionId: result.collectionId,
            status: result.status,
            paymentInstructions: result.paymentInstructions,
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
      logger.error('Error initiating Yellow Card collection:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate collection'
      });
    }
  }

  /**
   * Initiate disbursement (withdrawal) via Yellow Card
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async initiateDisbursement(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { phoneNumber, amount, targetCurrency, countryCode } = req.body;

      // Validate currency is supported
      const supportedCurrencies = YellowCardService.getSupportedCurrencies().map(c => c.code);
      if (!supportedCurrencies.includes(targetCurrency)) {
        return res.status(400).json({
          success: false,
          error: `Currency ${targetCurrency} not supported. Supported currencies: ${supportedCurrencies.join(', ')}`
        });
      }

      // Initiate disbursement
      const result = await transactionService.initiateYellowCardWithdrawal(
        phoneNumber,
        parseFloat(amount),
        targetCurrency,
        countryCode
      );

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'Disbursement initiated successfully',
          data: {
            transactionId: result.transactionId,
            disbursementId: result.disbursementId,
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
      logger.error('Error initiating Yellow Card disbursement:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate disbursement'
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

      const result = await YellowCardService.getExchangeRate(fromCurrency, toCurrency);

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
   * Get supported countries
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getSupportedCountries(req, res) {
    try {
      const result = await YellowCardService.getSupportedCountries();

      if (result.success) {
        res.status(200).json({
          success: true,
          data: {
            countries: result.countries
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      logger.error('Error getting supported countries:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get supported countries'
      });
    }
  }

  /**
   * Get collection status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getCollectionStatus(req, res) {
    try {
      const { collectionId } = req.params;

      if (!collectionId) {
        return res.status(400).json({
          success: false,
          error: 'Collection ID is required'
        });
      }

      const result = await YellowCardService.getCollectionStatus(collectionId);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: {
            collectionId,
            status: result.status,
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
      logger.error('Error getting collection status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get collection status'
      });
    }
  }

  /**
   * Get disbursement status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getDisbursementStatus(req, res) {
    try {
      const { disbursementId } = req.params;

      if (!disbursementId) {
        return res.status(400).json({
          success: false,
          error: 'Disbursement ID is required'
        });
      }

      const result = await YellowCardService.getDisbursementStatus(disbursementId);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: {
            disbursementId,
            status: result.status,
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
      logger.error('Error getting disbursement status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get disbursement status'
      });
    }
  }

  /**
   * Create Yellow Card customer
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

      const result = await YellowCardService.createCustomer({
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
            customerId: result.customerId,
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
      logger.error('Error creating Yellow Card customer:', error);
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

      const result = await YellowCardService.getCustomerByPhone(phoneNumber);

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
      logger.error('Error getting Yellow Card customer:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get customer'
      });
    }
  }
}

module.exports = YellowCardController;
