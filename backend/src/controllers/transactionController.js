const transactionService = require('../services/transactionService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');

class TransactionController {
  /**
   * Process transfer between users
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async processTransfer(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { fromPhone, toPhone, amount, currency = 'ZrUSD' } = req.body;

      // Additional business logic validation
      if (fromPhone === toPhone) {
        return res.status(400).json({
          success: false,
          error: 'Cannot transfer to the same phone number'
        });
      }

      // Process transfer
      const result = await transactionService.processTransfer(
        fromPhone,
        toPhone,
        parseFloat(amount),
        currency
      );

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'Transfer completed successfully',
          data: result
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          transactionId: result.transactionId
        });
      }

    } catch (error) {
      logger.error('Error processing transfer:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process transfer'
      });
    }
  }

  /**
   * Process mobile money deposit
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async processDeposit(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { phoneNumber, amount, currency, paymentData } = req.body;

      // Validate payment data structure
      if (!paymentData.provider || !paymentData.reference) {
        return res.status(400).json({
          success: false,
          error: 'Payment data must include provider and reference'
        });
      }

      // Process deposit
      const result = await transactionService.processMobileMoneyDeposit(
        phoneNumber,
        parseFloat(amount),
        currency,
        paymentData
      );

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'Deposit completed successfully',
          data: result
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          transactionId: result.transactionId
        });
      }

    } catch (error) {
      logger.error('Error processing deposit:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process deposit'
      });
    }
  }

  /**
   * Process mobile money withdrawal
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async processWithdrawal(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { phoneNumber, amount, targetCurrency, withdrawalData } = req.body;

      // Validate withdrawal data structure
      if (!withdrawalData.method || !withdrawalData.account) {
        return res.status(400).json({
          success: false,
          error: 'Withdrawal data must include method and account'
        });
      }

      // Process withdrawal
      const result = await transactionService.processMobileMoneyWithdrawal(
        phoneNumber,
        parseFloat(amount),
        targetCurrency,
        withdrawalData
      );

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'Withdrawal completed successfully',
          data: result
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          transactionId: result.transactionId
        });
      }

    } catch (error) {
      logger.error('Error processing withdrawal:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process withdrawal'
      });
    }
  }

  /**
   * Get transaction history for user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getTransactionHistory(req, res) {
    try {
      const { phoneNumber } = req.params;
      const { limit = 10, offset = 0, type, status } = req.query;

      // Validate phone number
      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is required'
        });
      }

      // Validate limit and offset
      const limitNum = Math.min(parseInt(limit), 100); // Max 100 records
      const offsetNum = Math.max(parseInt(offset), 0);

      // Get transaction history with filters
      const transactions = await transactionService.getTransactionHistory(
        phoneNumber,
        limitNum,
        offsetNum,
        type,
        status
      );

      // Get total count for pagination
      const totalCount = await transactionService.getTransactionCount(
        phoneNumber,
        type,
        status
      );

      res.status(200).json({
        success: true,
        data: {
          phoneNumber,
          transactions,
          pagination: {
            limit: limitNum,
            offset: offsetNum,
            total: totalCount,
            hasMore: offsetNum + limitNum < totalCount
          }
        }
      });

    } catch (error) {
      logger.error('Error getting transaction history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get transaction history'
      });
    }
  }

  /**
   * Get specific transaction details
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getTransactionDetails(req, res) {
    try {
      const { transactionId } = req.params;

      // Validate transaction ID
      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: 'Transaction ID is required'
        });
      }

      // Get transaction
      const transaction = await transactionService.getTransaction(transactionId);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
      }

      res.status(200).json({
        success: true,
        data: transaction
      });

    } catch (error) {
      logger.error('Error getting transaction:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get transaction'
      });
    }
  }

  /**
   * Get transaction statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getTransactionStats(req, res) {
    try {
      const { period = '30d', phoneNumber } = req.query;

      // Validate period
      const validPeriods = ['1d', '7d', '30d', '90d'];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid period. Valid options: 1d, 7d, 30d, 90d'
        });
      }

      const stats = await transactionService.getTransactionStatistics(period, phoneNumber);

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Error getting transaction stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get transaction statistics'
      });
    }
  }

  /**
   * Retry failed transaction
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async retryTransaction(req, res) {
    try {
      const { transactionId } = req.params;

      // Get original transaction
      const transaction = await transactionService.getTransaction(transactionId);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
      }

      if (transaction.status !== 'failed') {
        return res.status(400).json({
          success: false,
          error: 'Only failed transactions can be retried'
        });
      }

      // Check retry limit
      const retryCount = transaction.metadata?.retryCount || 0;
      if (retryCount >= 3) {
        return res.status(400).json({
          success: false,
          error: 'Maximum retry attempts exceeded'
        });
      }

      // Retry based on transaction type
      let result;
      const metadata = JSON.parse(transaction.metadata || '{}');

      switch (transaction.type) {
        case 'transfer':
          result = await transactionService.processTransfer(
            transaction.phone_number,
            metadata.recipient,
            transaction.amount,
            transaction.currency
          );
          break;

        case 'deposit':
          result = await transactionService.processMobileMoneyDeposit(
            transaction.phone_number,
            transaction.amount,
            transaction.currency,
            metadata
          );
          break;

        case 'withdrawal':
          result = await transactionService.processMobileMoneyWithdrawal(
            transaction.phone_number,
            transaction.amount,
            metadata.targetCurrency,
            metadata
          );
          break;

        default:
          return res.status(400).json({
            success: false,
            error: 'Transaction type not supported for retry'
          });
      }

      res.status(200).json({
        success: true,
        message: 'Transaction retry initiated',
        data: result
      });

    } catch (error) {
      logger.error('Error retrying transaction:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retry transaction'
      });
    }
  }

  /**
   * Cancel pending transaction
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async cancelTransaction(req, res) {
    try {
      const { transactionId } = req.params;
      const { reason } = req.body;

      // Get transaction
      const transaction = await transactionService.getTransaction(transactionId);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
      }

      if (transaction.status !== 'pending') {
        return res.status(400).json({
          success: false,
          error: 'Only pending transactions can be cancelled'
        });
      }

      // Cancel transaction
      const result = await transactionService.cancelTransaction(
        transactionId,
        reason || 'Cancelled by user'
      );

      res.status(200).json({
        success: true,
        message: 'Transaction cancelled successfully',
        data: result
      });

    } catch (error) {
      logger.error('Error cancelling transaction:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel transaction'
      });
    }
  }

  /**
   * Get user balance
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getUserBalance(req, res) {
    try {
      const { phoneNumber } = req.params;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is required'
        });
      }

      const balance = await transactionService.getUserBalance(phoneNumber);

      res.status(200).json({
        success: true,
        data: {
          phoneNumber,
          balance: balance.balance,
          currency: 'ZrUSD',
          lastUpdated: balance.lastUpdated
        }
      });

    } catch (error) {
      logger.error('Error getting user balance:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user balance'
      });
    }
  }
}

module.exports = TransactionController;
