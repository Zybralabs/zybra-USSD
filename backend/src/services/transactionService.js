const logger = require('../utils/logger');
const { Transaction, User } = require('../db/models');
const walletService = require('./walletService');
const SMSService = require('./smsEngine');
const { convertMWKtoUSDC } = require('./fxEngine');

class TransactionService {
  /**
   * Process a transfer between users
   * @param {string} fromPhone - Sender's phone number
   * @param {string} toPhone - Recipient's phone number
   * @param {number} amount - Amount to transfer
   * @param {string} currency - Currency (ZrUSD, MWK, etc.)
   * @returns {Promise<Object>} - Transaction result
   */
  async processTransfer(fromPhone, toPhone, amount, currency = 'ZrUSD') {
    let transaction = null;
    
    try {
      // Create pending transaction
      transaction = await Transaction.create({
        phoneNumber: fromPhone,
        type: 'transfer',
        amount,
        currency,
        status: 'pending',
        metadata: {
          recipient: toPhone,
          fee: 0.1
        }
      });

      // Validate users exist
      const fromUser = await User.findByPhone(fromPhone);
      const toUser = await User.findByPhone(toPhone);

      if (!fromUser) {
        throw new Error('Sender account not found');
      }
      if (!toUser) {
        throw new Error('Recipient account not found');
      }

      // Check balance
      const currentBalance = parseFloat(fromUser.balance || 0);
      const totalAmount = amount + 0.1; // Including fee

      if (currentBalance < totalAmount) {
        throw new Error(`Insufficient balance. Available: ${currentBalance}, Required: ${totalAmount}`);
      }

      // Convert currency if needed
      let transferAmount = amount;
      if (currency !== 'ZrUSD') {
        transferAmount = await this.convertToZrUSD(amount, currency);
      }

      // Process blockchain transfer
      const blockchainResult = await walletService.transferZrUSD(
        fromPhone,
        toPhone,
        transferAmount.toString()
      );

      if (!blockchainResult.success) {
        throw new Error('Blockchain transfer failed');
      }

      // Update transaction status
      await Transaction.updateStatus(transaction.id, 'completed', blockchainResult.txHash);

      // Create recipient transaction record
      await Transaction.create({
        phoneNumber: toPhone,
        type: 'receive',
        amount: transferAmount,
        currency: 'ZrUSD',
        status: 'completed',
        txHash: blockchainResult.txHash,
        metadata: {
          sender: fromPhone
        }
      });

      // Send SMS notifications
      await SMSService.sendTransactionConfirmation(fromPhone, {
        type: 'transfer',
        amount: transferAmount,
        currency: 'ZrUSD',
        status: 'completed',
        txHash: blockchainResult.txHash
      });

      await SMSService.sendTransactionConfirmation(toPhone, {
        type: 'receive',
        amount: transferAmount,
        currency: 'ZrUSD',
        status: 'completed',
        txHash: blockchainResult.txHash
      });

      logger.info(`Transfer completed: ${fromPhone} -> ${toPhone}, Amount: ${transferAmount} ZrUSD`);

      return {
        success: true,
        transactionId: transaction.id,
        txHash: blockchainResult.txHash,
        amount: transferAmount,
        fee: 0.1,
        newBalance: blockchainResult.fromBalance
      };

    } catch (error) {
      logger.error('Transfer failed:', error);

      // Update transaction status to failed
      if (transaction) {
        await Transaction.updateStatus(transaction.id, 'failed');
        
        // Send failure notification
        await SMSService.sendTransactionConfirmation(fromPhone, {
          type: 'transfer',
          amount,
          currency,
          status: 'failed',
          txHash: null
        });
      }

      return {
        success: false,
        error: error.message,
        transactionId: transaction?.id
      };
    }
  }

  /**
   * Process mobile money deposit (mint ZrUSD)
   * @param {string} phoneNumber - User's phone number
   * @param {number} amount - Amount to deposit
   * @param {string} currency - Source currency (MWK, KES, etc.)
   * @param {Object} paymentData - Payment provider data
   * @returns {Promise<Object>} - Transaction result
   */
  async processMobileMoneyDeposit(phoneNumber, amount, currency, paymentData) {
    let transaction = null;

    try {
      // Create pending transaction
      transaction = await Transaction.create({
        phoneNumber,
        type: 'deposit',
        amount,
        currency,
        status: 'pending',
        metadata: {
          paymentProvider: paymentData.provider,
          paymentReference: paymentData.reference
        }
      });

      // Convert to USDC equivalent
      const usdcAmount = await this.convertToZrUSD(amount, currency);

      // Verify payment with mobile money provider
      const paymentVerified = await this.verifyMobileMoneyPayment(paymentData);
      
      if (!paymentVerified) {
        throw new Error('Payment verification failed');
      }

      // Mint ZrUSD tokens
      const mintResult = await walletService.mintZrUSD(phoneNumber, usdcAmount.toString());

      if (!mintResult.success) {
        throw new Error('Token minting failed');
      }

      // Update transaction status
      await Transaction.updateStatus(transaction.id, 'completed', mintResult.txHash);

      // Send confirmation SMS
      await SMSService.sendTransactionConfirmation(phoneNumber, {
        type: 'deposit',
        amount: usdcAmount,
        currency: 'ZrUSD',
        status: 'completed',
        txHash: mintResult.txHash
      });

      logger.info(`Deposit completed: ${phoneNumber}, Amount: ${usdcAmount} ZrUSD`);

      return {
        success: true,
        transactionId: transaction.id,
        txHash: mintResult.txHash,
        amount: usdcAmount,
        newBalance: mintResult.newBalance
      };

    } catch (error) {
      logger.error('Deposit failed:', error);

      if (transaction) {
        await Transaction.updateStatus(transaction.id, 'failed');
        
        await SMSService.sendTransactionConfirmation(phoneNumber, {
          type: 'deposit',
          amount,
          currency,
          status: 'failed',
          txHash: null
        });
      }

      return {
        success: false,
        error: error.message,
        transactionId: transaction?.id
      };
    }
  }

  /**
   * Process mobile money withdrawal (burn ZrUSD)
   * @param {string} phoneNumber - User's phone number
   * @param {number} amount - Amount to withdraw in ZrUSD
   * @param {string} targetCurrency - Target currency (MWK, KES, etc.)
   * @param {Object} withdrawalData - Withdrawal details
   * @returns {Promise<Object>} - Transaction result
   */
  async processMobileMoneyWithdrawal(phoneNumber, amount, targetCurrency, withdrawalData) {
    let transaction = null;

    try {
      // Create pending transaction
      transaction = await Transaction.create({
        phoneNumber,
        type: 'withdrawal',
        amount,
        currency: 'ZrUSD',
        status: 'pending',
        metadata: {
          targetCurrency,
          withdrawalMethod: withdrawalData.method,
          withdrawalAccount: withdrawalData.account
        }
      });

      // Check user balance
      const user = await User.findByPhone(phoneNumber);
      const currentBalance = parseFloat(user.balance || 0);

      if (currentBalance < amount) {
        throw new Error(`Insufficient balance. Available: ${currentBalance}, Required: ${amount}`);
      }

      // Burn ZrUSD tokens
      const burnResult = await walletService.burnZrUSD(phoneNumber, amount.toString());

      if (!burnResult.success) {
        throw new Error('Token burning failed');
      }

      // Convert to target currency
      const targetAmount = await this.convertFromZrUSD(amount, targetCurrency);

      // Process mobile money payout
      const payoutResult = await this.processMobileMoneyPayout(
        phoneNumber,
        targetAmount,
        targetCurrency,
        withdrawalData
      );

      if (!payoutResult.success) {
        // If payout fails, we need to re-mint the tokens
        await walletService.mintZrUSD(phoneNumber, amount.toString());
        throw new Error('Mobile money payout failed');
      }

      // Update transaction status
      await Transaction.updateStatus(transaction.id, 'completed', burnResult.txHash);

      // Send confirmation SMS
      await SMSService.sendTransactionConfirmation(phoneNumber, {
        type: 'withdrawal',
        amount: targetAmount,
        currency: targetCurrency,
        status: 'completed',
        txHash: burnResult.txHash
      });

      logger.info(`Withdrawal completed: ${phoneNumber}, Amount: ${targetAmount} ${targetCurrency}`);

      return {
        success: true,
        transactionId: transaction.id,
        txHash: burnResult.txHash,
        amount: targetAmount,
        currency: targetCurrency,
        newBalance: burnResult.newBalance
      };

    } catch (error) {
      logger.error('Withdrawal failed:', error);

      if (transaction) {
        await Transaction.updateStatus(transaction.id, 'failed');
        
        await SMSService.sendTransactionConfirmation(phoneNumber, {
          type: 'withdrawal',
          amount,
          currency: 'ZrUSD',
          status: 'failed',
          txHash: null
        });
      }

      return {
        success: false,
        error: error.message,
        transactionId: transaction?.id
      };
    }
  }

  /**
   * Convert amount to ZrUSD
   * @param {number} amount - Amount to convert
   * @param {string} fromCurrency - Source currency
   * @returns {Promise<number>} - Amount in ZrUSD
   */
  async convertToZrUSD(amount, fromCurrency) {
    if (fromCurrency === 'ZrUSD') {
      return amount;
    }

    // Use existing FX engine for MWK
    if (fromCurrency === 'MWK') {
      return await convertMWKtoUSDC(amount);
    }

    // Add other currency conversions as needed
    throw new Error(`Currency conversion not supported: ${fromCurrency}`);
  }

  /**
   * Convert amount from ZrUSD
   * @param {number} amount - Amount in ZrUSD
   * @param {string} toCurrency - Target currency
   * @returns {Promise<number>} - Amount in target currency
   */
  async convertFromZrUSD(amount, toCurrency) {
    if (toCurrency === 'ZrUSD') {
      return amount;
    }

    // Reverse conversion for MWK
    if (toCurrency === 'MWK') {
      const mwkToUsdRate = 1733.36; // Should fetch from Chainlink
      return amount * mwkToUsdRate;
    }

    throw new Error(`Currency conversion not supported: ${toCurrency}`);
  }

  /**
   * Verify mobile money payment
   * @param {Object} paymentData - Payment data to verify
   * @returns {Promise<boolean>} - Verification result
   */
  async verifyMobileMoneyPayment(paymentData) {
    // This would integrate with actual mobile money APIs
    // For now, return true for demo purposes
    logger.info('Verifying mobile money payment:', paymentData);
    return true;
  }

  /**
   * Process mobile money payout
   * @param {string} phoneNumber - User's phone number
   * @param {number} amount - Amount to payout
   * @param {string} currency - Currency
   * @param {Object} withdrawalData - Withdrawal details
   * @returns {Promise<Object>} - Payout result
   */
  async processMobileMoneyPayout(phoneNumber, amount, currency, withdrawalData) {
    // This would integrate with actual mobile money APIs
    // For now, return success for demo purposes
    logger.info('Processing mobile money payout:', { phoneNumber, amount, currency, withdrawalData });
    
    return {
      success: true,
      payoutReference: 'PAYOUT_' + Date.now(),
      amount,
      currency
    };
  }

  /**
   * Get transaction history for user
   * @param {string} phoneNumber - User's phone number
   * @param {number} limit - Number of transactions to return
   * @returns {Promise<Array>} - Transaction history
   */
  async getTransactionHistory(phoneNumber, limit = 10) {
    try {
      return await Transaction.findByPhone(phoneNumber, limit);
    } catch (error) {
      logger.error('Error getting transaction history:', error);
      throw error;
    }
  }

  /**
   * Get transaction by ID
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} - Transaction details
   */
  async getTransaction(transactionId) {
    try {
      return await Transaction.findById(transactionId);
    } catch (error) {
      logger.error('Error getting transaction:', error);
      throw error;
    }
  }
}

module.exports = new TransactionService();
