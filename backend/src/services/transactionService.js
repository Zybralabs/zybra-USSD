const logger = require('../utils/logger');
const { Transaction, User } = require('../db/models');
const walletService = require('./walletService');
const SMSService = require('./smsEngine');
const KotaniPayService = require('./kotaniPayService');
const YellowCardService = require('./yellowCardService');
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
          paymentReference: paymentData.reference,
          kotaniPayTransactionId: paymentData.transactionId,
          kotaniPayCustomerKey: paymentData.customerKey,
          kotaniPayWalletId: paymentData.walletId,
          yellowCardCollectionId: paymentData.yellowCardCollectionId,
          yellowCardCustomerId: paymentData.yellowCardCustomerId
        }
      });

      // Convert to USDC equivalent
      const usdcAmount = await this.convertToZrUSD(amount, currency);

      // Handle different payment providers
      let paymentVerified = false;

      if (paymentData.provider === 'kotanipay' || paymentData.provider === 'yellowcard') {
        // For Kotani Pay and Yellow Card, verification is handled by webhook
        // The webhook will call this method after payment verification
        paymentVerified = true;
      } else {
        // Verify payment with other mobile money providers
        paymentVerified = await this.verifyMobileMoneyPayment(paymentData);
      }

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
          withdrawalAccount: withdrawalData.account,
          paymentProvider: withdrawalData.provider,
          kotaniPayTransactionId: withdrawalData.kotaniPayTransactionId,
          kotaniPayCustomerKey: withdrawalData.kotaniPayCustomerKey,
          kotaniPayWalletId: withdrawalData.kotaniPayWalletId,
          yellowCardDisbursementId: withdrawalData.yellowCardDisbursementId,
          yellowCardCustomerId: withdrawalData.yellowCardCustomerId
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
   * Initiate Kotani Pay mobile money deposit
   * @param {string} phoneNumber - User's phone number
   * @param {number} amount - Amount to deposit
   * @param {string} currency - Source currency
   * @returns {Promise<Object>} - Deposit initiation result
   */
  async initiateKotaniPayDeposit(phoneNumber, amount, currency) {
    try {
      // Ensure user exists
      let user = await User.findByPhone(phoneNumber);
      if (!user) {
        const walletService = require('./walletService');
        user = await walletService.createUserWallet(phoneNumber);
      }

      // Get or create Kotani Pay customer
      let customerResult = await KotaniPayService.getMobileMoneyCustomerByPhone(phoneNumber);

      if (!customerResult.success || customerResult.notFound) {
        // Create new customer
        customerResult = await KotaniPayService.createMobileMoneyCustomer({
          phoneNumber,
          firstName: 'Zybra',
          lastName: 'User',
          country: this.getCountryFromPhone(phoneNumber)
        });

        if (!customerResult.success) {
          throw new Error(`Failed to create Kotani Pay customer: ${customerResult.error}`);
        }
      }

      // Get or create fiat wallet for the currency
      const walletResult = await KotaniPayService.getFiatWalletByCurrency(currency);
      let walletId;

      if (!walletResult.success) {
        // Create new fiat wallet
        const createWalletResult = await KotaniPayService.createFiatWallet(currency);
        if (!createWalletResult.success) {
          throw new Error(`Failed to create Kotani Pay wallet: ${createWalletResult.error}`);
        }
        walletId = createWalletResult.walletId;
      } else {
        walletId = walletResult.walletId;
      }

      // Initiate deposit
      const depositResult = await KotaniPayService.initiateMobileMoneyDeposit({
        phoneNumber,
        amount,
        currency,
        customerKey: customerResult.data.customer_key,
        walletId,
        callbackUrl: `${process.env.BASE_URL}/api/webhooks/kotanipay/deposit`
      });

      if (!depositResult.success) {
        throw new Error(`Failed to initiate Kotani Pay deposit: ${depositResult.error}`);
      }

      // Create pending transaction record
      const transaction = await Transaction.create({
        phoneNumber,
        type: 'deposit',
        amount,
        currency,
        status: 'pending',
        metadata: {
          paymentProvider: 'kotanipay',
          kotaniPayTransactionId: depositResult.transactionId,
          kotaniPayCustomerKey: customerResult.data.customer_key,
          kotaniPayWalletId: walletId
        }
      });

      logger.info(`Initiated Kotani Pay deposit for ${phoneNumber}: ${amount} ${currency}`);

      return {
        success: true,
        transactionId: transaction.id,
        kotaniPayTransactionId: depositResult.transactionId,
        status: depositResult.status,
        instructions: depositResult.instructions,
        amount,
        currency
      };

    } catch (error) {
      logger.error('Error initiating Kotani Pay deposit:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Initiate Kotani Pay mobile money withdrawal
   * @param {string} phoneNumber - User's phone number
   * @param {number} amount - Amount to withdraw in ZrUSD
   * @param {string} targetCurrency - Target currency
   * @returns {Promise<Object>} - Withdrawal initiation result
   */
  async initiateKotaniPayWithdrawal(phoneNumber, amount, targetCurrency) {
    try {
      // Check user balance
      const user = await User.findByPhone(phoneNumber);
      if (!user) {
        throw new Error('User not found');
      }

      const currentBalance = parseFloat(user.balance || 0);
      if (currentBalance < amount) {
        throw new Error(`Insufficient balance. Available: ${currentBalance}, Required: ${amount}`);
      }

      // Get Kotani Pay customer
      const customerResult = await KotaniPayService.getMobileMoneyCustomerByPhone(phoneNumber);
      if (!customerResult.success) {
        throw new Error(`Kotani Pay customer not found: ${customerResult.error}`);
      }

      // Get fiat wallet for target currency
      const walletResult = await KotaniPayService.getFiatWalletByCurrency(targetCurrency);
      if (!walletResult.success) {
        throw new Error(`Kotani Pay wallet not found for ${targetCurrency}: ${walletResult.error}`);
      }

      // Convert ZrUSD to target currency
      const targetAmount = await this.convertFromZrUSD(amount, targetCurrency);

      // Burn ZrUSD tokens first
      const burnResult = await walletService.burnZrUSD(phoneNumber, amount.toString());
      if (!burnResult.success) {
        throw new Error('Token burning failed');
      }

      // Initiate withdrawal
      const withdrawalResult = await KotaniPayService.initiateMobileMoneyWithdrawal({
        phoneNumber,
        amount: targetAmount,
        currency: targetCurrency,
        customerKey: customerResult.data.customer_key,
        walletId: walletResult.walletId,
        callbackUrl: `${process.env.BASE_URL}/api/webhooks/kotanipay/withdrawal`
      });

      if (!withdrawalResult.success) {
        // Re-mint tokens if withdrawal initiation failed
        await walletService.mintZrUSD(phoneNumber, amount.toString());
        throw new Error(`Failed to initiate Kotani Pay withdrawal: ${withdrawalResult.error}`);
      }

      // Create transaction record
      const transaction = await Transaction.create({
        phoneNumber,
        type: 'withdrawal',
        amount: targetAmount,
        currency: targetCurrency,
        status: 'pending',
        txHash: burnResult.txHash,
        metadata: {
          paymentProvider: 'kotanipay',
          kotaniPayTransactionId: withdrawalResult.transactionId,
          kotaniPayCustomerKey: customerResult.data.customer_key,
          kotaniPayWalletId: walletResult.walletId,
          originalAmount: amount,
          originalCurrency: 'ZrUSD'
        }
      });

      logger.info(`Initiated Kotani Pay withdrawal for ${phoneNumber}: ${targetAmount} ${targetCurrency}`);

      return {
        success: true,
        transactionId: transaction.id,
        kotaniPayTransactionId: withdrawalResult.transactionId,
        status: withdrawalResult.status,
        amount: targetAmount,
        currency: targetCurrency,
        burnTxHash: burnResult.txHash
      };

    } catch (error) {
      logger.error('Error initiating Kotani Pay withdrawal:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Initiate Yellow Card collection (deposit)
   * @param {string} phoneNumber - User's phone number
   * @param {number} amount - Amount to deposit
   * @param {string} currency - Source currency
   * @param {string} countryCode - Country code
   * @returns {Promise<Object>} - Deposit initiation result
   */
  async initiateYellowCardDeposit(phoneNumber, amount, currency, countryCode) {
    try {
      // Ensure user exists
      let user = await User.findByPhone(phoneNumber);
      if (!user) {
        const walletService = require('./walletService');
        user = await walletService.createUserWallet(phoneNumber);
      }

      // Get or create Yellow Card customer
      let customerResult = await YellowCardService.getCustomerByPhone(phoneNumber);

      if (!customerResult.success || customerResult.notFound) {
        // Create new customer
        customerResult = await YellowCardService.createCustomer({
          phoneNumber,
          firstName: 'Zybra',
          lastName: 'User',
          country: countryCode || this.getCountryFromPhone(phoneNumber)
        });

        if (!customerResult.success) {
          throw new Error(`Failed to create Yellow Card customer: ${customerResult.error}`);
        }
      }

      // Initiate collection
      const collectionResult = await YellowCardService.initiateCollection({
        customerId: customerResult.data.id,
        amount,
        currency,
        phoneNumber,
        callbackUrl: `${process.env.BASE_URL}/api/webhooks/yellowcard`,
        reference: `ZYBRA_DEP_${Date.now()}`
      });

      if (!collectionResult.success) {
        throw new Error(`Failed to initiate Yellow Card collection: ${collectionResult.error}`);
      }

      // Create pending transaction record
      const transaction = await Transaction.create({
        phoneNumber,
        type: 'deposit',
        amount,
        currency,
        status: 'pending',
        metadata: {
          paymentProvider: 'yellowcard',
          yellowCardCollectionId: collectionResult.collectionId,
          yellowCardCustomerId: customerResult.data.id
        }
      });

      logger.info(`Initiated Yellow Card collection for ${phoneNumber}: ${amount} ${currency}`);

      return {
        success: true,
        transactionId: transaction.id,
        collectionId: collectionResult.collectionId,
        status: collectionResult.status,
        paymentInstructions: collectionResult.paymentInstructions,
        amount,
        currency
      };

    } catch (error) {
      logger.error('Error initiating Yellow Card deposit:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Initiate Yellow Card disbursement (withdrawal)
   * @param {string} phoneNumber - User's phone number
   * @param {number} amount - Amount to withdraw in ZrUSD
   * @param {string} targetCurrency - Target currency
   * @param {string} countryCode - Country code
   * @returns {Promise<Object>} - Withdrawal initiation result
   */
  async initiateYellowCardWithdrawal(phoneNumber, amount, targetCurrency, countryCode) {
    try {
      // Check user balance
      const user = await User.findByPhone(phoneNumber);
      if (!user) {
        throw new Error('User not found');
      }

      const currentBalance = parseFloat(user.balance || 0);
      if (currentBalance < amount) {
        throw new Error(`Insufficient balance. Available: ${currentBalance}, Required: ${amount}`);
      }

      // Get Yellow Card customer
      const customerResult = await YellowCardService.getCustomerByPhone(phoneNumber);
      if (!customerResult.success) {
        throw new Error(`Yellow Card customer not found: ${customerResult.error}`);
      }

      // Convert ZrUSD to target currency
      const targetAmount = await this.convertFromZrUSD(amount, targetCurrency);

      // Burn ZrUSD tokens first
      const burnResult = await walletService.burnZrUSD(phoneNumber, amount.toString());
      if (!burnResult.success) {
        throw new Error('Token burning failed');
      }

      // Initiate disbursement
      const disbursementResult = await YellowCardService.initiateDisbursement({
        customerId: customerResult.data.id,
        amount: targetAmount,
        currency: targetCurrency,
        phoneNumber,
        callbackUrl: `${process.env.BASE_URL}/api/webhooks/yellowcard`,
        reference: `ZYBRA_WD_${Date.now()}`
      });

      if (!disbursementResult.success) {
        // Re-mint tokens if disbursement initiation failed
        await walletService.mintZrUSD(phoneNumber, amount.toString());
        throw new Error(`Failed to initiate Yellow Card disbursement: ${disbursementResult.error}`);
      }

      // Create transaction record
      const transaction = await Transaction.create({
        phoneNumber,
        type: 'withdrawal',
        amount: targetAmount,
        currency: targetCurrency,
        status: 'pending',
        txHash: burnResult.txHash,
        metadata: {
          paymentProvider: 'yellowcard',
          yellowCardDisbursementId: disbursementResult.disbursementId,
          yellowCardCustomerId: customerResult.data.id,
          originalAmount: amount,
          originalCurrency: 'ZrUSD'
        }
      });

      logger.info(`Initiated Yellow Card disbursement for ${phoneNumber}: ${targetAmount} ${targetCurrency}`);

      return {
        success: true,
        transactionId: transaction.id,
        disbursementId: disbursementResult.disbursementId,
        status: disbursementResult.status,
        amount: targetAmount,
        currency: targetCurrency,
        burnTxHash: burnResult.txHash
      };

    } catch (error) {
      logger.error('Error initiating Yellow Card withdrawal:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get country code from phone number
   * @param {string} phoneNumber - Phone number
   * @returns {string} - Country code
   */
  getCountryFromPhone(phoneNumber) {
    const countryMappings = {
      '254': 'KE', // Kenya
      '255': 'TZ', // Tanzania
      '256': 'UG', // Uganda
      '260': 'ZM', // Zambia
      '265': 'MW', // Malawi
      '233': 'GH', // Ghana
      '234': 'NG', // Nigeria
      '237': 'CM', // Cameroon
      '251': 'ET', // Ethiopia
      '252': 'SO', // Somalia
    };

    for (const [code, country] of Object.entries(countryMappings)) {
      if (phoneNumber.startsWith(code)) {
        return country;
      }
    }

    return 'NG'; // Default to Nigeria for Yellow Card
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
