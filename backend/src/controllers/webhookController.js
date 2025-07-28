const transactionService = require('../services/transactionService');
const SMSService = require('../services/smsEngine');
const logger = require('../utils/logger');
const crypto = require('crypto');

class WebhookController {
  /**
   * Verify webhook signature
   * @param {string} payload - Raw payload
   * @param {string} signature - Webhook signature
   * @param {string} secret - Webhook secret
   * @returns {boolean} - Verification result
   */
  static verifyWebhookSignature(payload, signature, secret) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Handle Airtel Money webhook
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handleAirtelWebhook(req, res) {
    try {
      const webhookData = req.body;
      logger.info('Airtel webhook received:', webhookData);

      // Verify webhook signature if secret is configured
      if (process.env.AIRTEL_WEBHOOK_SECRET) {
        const signature = req.headers['x-airtel-signature'];
        const isValid = this.verifyWebhookSignature(
          JSON.stringify(req.body),
          signature,
          process.env.AIRTEL_WEBHOOK_SECRET
        );

        if (!isValid) {
          logger.warn('Invalid Airtel webhook signature');
          return res.status(401).json({
            success: false,
            error: 'Invalid signature'
          });
        }
      }

      const { 
        transaction_id,
        transaction_status,
        transaction_amount,
        transaction_currency,
        msisdn,
        reference_id
      } = webhookData;

      // Validate webhook data
      if (!transaction_id || !transaction_status || !msisdn) {
        return res.status(400).json({
          success: false,
          error: 'Invalid webhook data'
        });
      }

      // Process based on transaction status
      if (transaction_status === 'SUCCESS') {
        // Process successful payment
        const result = await transactionService.processMobileMoneyDeposit(
          msisdn,
          parseFloat(transaction_amount),
          transaction_currency,
          {
            provider: 'airtel',
            reference: reference_id,
            transactionId: transaction_id
          }
        );

        if (result.success) {
          logger.info(`Airtel deposit processed successfully for ${msisdn}`);
        } else {
          logger.error(`Airtel deposit failed for ${msisdn}:`, result.error);
        }
      } else {
        // Handle failed payment
        logger.warn(`Airtel payment failed for ${msisdn}: ${transaction_status}`);
        
        // Send failure notification
        await SMSService.sendErrorNotification(
          msisdn,
          `Payment failed: ${transaction_status}. Please try again.`
        );
      }

      // Always respond with success to acknowledge webhook
      res.status(200).json({
        success: true,
        message: 'Webhook processed'
      });

    } catch (error) {
      logger.error('Error processing Airtel webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process webhook'
      });
    }
  }

  /**
   * Handle Yellow Card webhook
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handleYellowCardWebhook(req, res) {
    try {
      const webhookData = req.body;
      logger.info('Yellow Card webhook received:', webhookData);

      // Verify webhook signature if secret is configured
      if (process.env.YELLOWCARD_WEBHOOK_SECRET) {
        const signature = req.headers['x-yellowcard-signature'] || req.headers['x-yc-signature'];
        const yellowCardService = require('../services/yellowCardService');
        const isValid = yellowCardService.validateWebhookSignature(
          JSON.stringify(req.body),
          signature,
          process.env.YELLOWCARD_WEBHOOK_SECRET
        );

        if (!isValid) {
          logger.warn('Invalid Yellow Card webhook signature');
          return res.status(401).json({
            success: false,
            error: 'Invalid signature'
          });
        }
      }

      const {
        event_type,
        data: {
          id,
          status,
          amount,
          currency,
          customer_phone,
          reference
        }
      } = webhookData;

      // Validate webhook data
      if (!event_type || !id || !customer_phone) {
        return res.status(400).json({
          success: false,
          error: 'Invalid webhook data'
        });
      }

      // Process based on event type
      switch (event_type) {
        case 'collection.completed':
          // Process successful collection (crypto purchase)
          const { Transaction, User } = require('../db/models');
          const walletService = require('../services/walletService');

          // Find user by phone number
          const user = await User.findByPhone(customer_phone);
          if (!user) {
            logger.error(`User not found for YellowCard collection: ${customer_phone}`);
            break;
          }

          // Create transaction record
          const transaction = await Transaction.create({
            phoneNumber: customer_phone,
            type: 'yellowcard_purchase',
            amount: parseFloat(amount),
            currency: currency,
            status: 'completed',
            metadata: {
              provider: 'yellowcard',
              collectionId: id,
              reference: reference,
              eventType: event_type
            }
          });

          // Mint equivalent USDT/stable coins to user's wallet
          const mintResult = await walletService.mintZrUSD(customer_phone, amount.toString());

          if (mintResult.success) {
            logger.info(`YellowCard crypto purchase completed for ${customer_phone}: ${amount} ${currency}`);

            // Send SMS confirmation
            const SMSService = require('../services/smsEngine');
            await SMSService.sendTransactionConfirmation(customer_phone, {
              type: 'crypto_purchase',
              amount: amount,
              currency: currency,
              status: 'completed',
              provider: 'YellowCard'
            });
          } else {
            logger.error(`Failed to mint tokens for YellowCard purchase: ${customer_phone}`);
            await Transaction.updateStatus(transaction.id, 'failed');
          }
          break;

        case 'collection.failed':
          // Handle failed collection
          logger.warn(`Yellow Card collection failed for ${customer_phone}`);

          // Update any pending transaction
          const { Transaction: TransactionModel } = require('../db/models');
          const pendingTx = await TransactionModel.findPendingByReference(id);
          if (pendingTx) {
            await TransactionModel.updateStatus(pendingTx.id, 'failed');
          }

          const SMSService = require('../services/smsEngine');
          await SMSService.sendErrorNotification(
            customer_phone,
            'Crypto purchase failed. Please try again or contact support.'
          );
          break;

        case 'disbursement.completed':
          // Handle successful disbursement (withdrawal)
          logger.info(`Yellow Card disbursement completed for ${customer_phone}`);
          await SMSService.sendTransactionConfirmation(customer_phone, {
            type: 'withdrawal',
            amount: parseFloat(amount),
            currency,
            status: 'completed',
            txHash: id
          });
          break;

        case 'disbursement.failed':
          // Handle failed disbursement
          logger.warn(`Yellow Card disbursement failed for ${customer_phone}`);
          await SMSService.sendErrorNotification(
            customer_phone,
            'Withdrawal failed. Please contact support.'
          );
          break;

        default:
          logger.warn(`Unknown Yellow Card event type: ${event_type}`);
      }

      res.status(200).json({
        success: true,
        message: 'Webhook processed'
      });

    } catch (error) {
      logger.error('Error processing Yellow Card webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process webhook'
      });
    }
  }

  /**
   * Handle blockchain transaction confirmations
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handleBlockchainWebhook(req, res) {
    try {
      const { txHash, status, blockNumber, confirmations } = req.body;
      
      logger.info('Blockchain webhook received:', { txHash, status, blockNumber, confirmations });

      // Validate required fields
      if (!txHash || !status) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: txHash, status'
        });
      }

      // Update transaction status in database
      const { Transaction } = require('../db/models');
      
      // Find transaction by hash
      const query = 'SELECT * FROM transactions WHERE tx_hash = $1';
      const { pool } = require('../db/models');
      const result = await pool.query(query, [txHash]);
      
      if (result.rows.length > 0) {
        const transaction = result.rows[0];
        
        // Update status based on blockchain confirmation
        let newStatus;
        if (status === 'confirmed' && confirmations >= 3) {
          newStatus = 'completed';
        } else if (status === 'failed') {
          newStatus = 'failed';
        } else {
          newStatus = 'pending'; // Still waiting for confirmations
        }
        
        await Transaction.updateStatus(transaction.id, newStatus, txHash);
        
        // Send notification to user only for final status
        if (newStatus === 'completed' || newStatus === 'failed') {
          await SMSService.sendTransactionConfirmation(transaction.phone_number, {
            type: transaction.type,
            amount: transaction.amount,
            currency: transaction.currency,
            status: newStatus,
            txHash: txHash
          });
        }
        
        logger.info(`Transaction ${transaction.id} updated to ${newStatus}`);
      } else {
        logger.warn(`Transaction not found for hash: ${txHash}`);
      }

      res.status(200).json({
        success: true,
        message: 'Blockchain webhook processed'
      });

    } catch (error) {
      logger.error('Error processing blockchain webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process blockchain webhook'
      });
    }
  }

  /**
   * Handle Africa's Talking delivery reports
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handleAfricasTalkingDelivery(req, res) {
    try {
      const { id, status, phoneNumber, failureReason, retryCount } = req.body;
      
      logger.info('Africa\'s Talking delivery report:', { 
        id, 
        status, 
        phoneNumber, 
        failureReason, 
        retryCount 
      });

      // Store delivery status in database for analytics
      const { pool } = require('../db/models');
      
      await pool.query(`
        INSERT INTO sms_logs (provider_message_id, phone_number, status, failure_reason, message_type)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (provider_message_id) 
        DO UPDATE SET status = $3, failure_reason = $4, updated_at = NOW()
      `, [id, phoneNumber, status.toLowerCase(), failureReason, 'delivery_report']);
      
      // If delivery failed and it's important, could trigger retry logic
      if (status === 'Failed' && retryCount < 3) {
        logger.warn(`SMS delivery failed for ${phoneNumber}, reason: ${failureReason}`);
        // Could implement retry logic here
      }

      res.status(200).json({
        success: true,
        message: 'Delivery report processed'
      });

    } catch (error) {
      logger.error('Error processing delivery report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process delivery report'
      });
    }
  }

  /**
   * Generic webhook handler for testing
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handleTestWebhook(req, res) {
    try {
      logger.info('Test webhook received:', req.body);
      
      res.status(200).json({
        success: true,
        message: 'Test webhook received',
        data: req.body,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Error processing test webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process test webhook'
      });
    }
  }

  /**
   * Webhook verification endpoint
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static handleWebhookVerification(req, res) {
    try {
      const { challenge } = req.query;
      
      if (challenge) {
        // Echo back the challenge for webhook verification
        res.status(200).send(challenge);
      } else {
        res.status(200).json({
          success: true,
          message: 'Webhook endpoint is active',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error('Error handling webhook verification:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to handle webhook verification'
      });
    }
  }

  /**
   * Get webhook statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async getWebhookStats(req, res) {
    try {
      const { pool } = require('../db/models');
      
      // Get webhook statistics from logs
      const statsQuery = `
        SELECT 
          COUNT(*) as total_webhooks,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as webhooks_24h,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as webhooks_1h
        FROM sms_logs
        WHERE message_type = 'delivery_report'
        AND created_at > NOW() - INTERVAL '7 days'
      `;

      const result = await pool.query(statsQuery);
      const stats = result.rows[0];

      res.status(200).json({
        success: true,
        data: {
          totalWebhooks: parseInt(stats.total_webhooks || 0),
          webhooks24h: parseInt(stats.webhooks_24h || 0),
          webhooks1h: parseInt(stats.webhooks_1h || 0),
          lastUpdated: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Error getting webhook stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get webhook statistics'
      });
    }
  }
}

module.exports = WebhookController;
