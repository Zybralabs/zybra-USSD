const AfricasTalking = require('africastalking');
const logger = require('../utils/logger');

// Initialize Africa's Talking
const africastalking = AfricasTalking({
  apiKey: process.env.AFRICASTALKING_API_KEY,
  username: process.env.AFRICASTALKING_USERNAME,
});

const sms = africastalking.SMS;

class SMSService {
  /**
   * Send SMS message
   * @param {string} to - Phone number to send to
   * @param {string} message - Message content
   * @param {string} from - Sender ID (optional)
   * @returns {Promise<Object>} - SMS response
   */
  static async sendSMS(to, message, from = null) {
    try {
      const options = {
        to: Array.isArray(to) ? to : [to],
        message: message,
      };

      if (from) {
        options.from = from;
      }

      logger.info(`Sending SMS to ${to}: ${message.substring(0, 50)}...`);

      const response = await sms.send(options);

      logger.info('SMS sent successfully:', response);
      return {
        success: true,
        data: response,
        messageId: response.SMSMessageData?.Recipients?.[0]?.messageId
      };
    } catch (error) {
      logger.error('SMS sending failed:', error);
      throw new Error(`SMS sending failed: ${error.message}`);
    }
  }

  /**
   * Send transaction confirmation SMS
   * @param {string} phoneNumber - User's phone number
   * @param {Object} transaction - Transaction details
   * @returns {Promise<Object>} - SMS response
   */
  static async sendTransactionConfirmation(phoneNumber, transaction) {
    const { type, amount, currency, status, txHash } = transaction;

    let message;
    if (status === 'completed') {
      message = `✅ Transaction Confirmed!\n` +
                `Type: ${type.toUpperCase()}\n` +
                `Amount: ${amount} ${currency}\n` +
                `TX: ${txHash ? txHash.substring(0, 10) + '...' : 'Pending'}\n` +
                `Time: ${new Date().toLocaleString()}\n` +
                `Thank you for using Zybra!`;
    } else if (status === 'failed') {
      message = `❌ Transaction Failed!\n` +
                `Type: ${type.toUpperCase()}\n` +
                `Amount: ${amount} ${currency}\n` +
                `Please try again or contact support.\n` +
                `Zybra Support`;
    } else {
      message = `⏳ Transaction Pending...\n` +
                `Type: ${type.toUpperCase()}\n` +
                `Amount: ${amount} ${currency}\n` +
                `We'll notify you once confirmed.\n` +
                `Zybra`;
    }

    return await this.sendSMS(phoneNumber, message);
  }

  /**
   * Send balance notification SMS
   * @param {string} phoneNumber - User's phone number
   * @param {number} balance - Current balance
   * @param {string} currency - Currency symbol
   * @returns {Promise<Object>} - SMS response
   */
  static async sendBalanceNotification(phoneNumber, balance, currency = 'ZrUSD') {
    const message = `💰 Your Zybra Balance\n` +
                   `Balance: ${balance} ${currency}\n` +
                   `Time: ${new Date().toLocaleString()}\n` +
                   `Dial *384*96# for more options`;

    return await this.sendSMS(phoneNumber, message);
  }

  /**
   * Send welcome SMS to new users
   * @param {string} phoneNumber - User's phone number
   * @param {string} walletAddress - User's wallet address
   * @returns {Promise<Object>} - SMS response
   */
  static async sendWelcomeSMS(phoneNumber, walletAddress) {
    const message = `🎉 Welcome to Zybra!\n` +
                   `Your digital wallet is ready.\n` +
                   `Wallet: ${walletAddress.substring(0, 10)}...\n` +
                   `Dial *384*96# to get started\n` +
                   `Send HELP to get assistance`;

    return await this.sendSMS(phoneNumber, message);
  }

  /**
   * Send OTP for verification with enhanced security messaging
   * @param {string} phoneNumber - User's phone number
   * @param {string} otp - One-time password
   * @param {string} purpose - Purpose of OTP (authentication, transaction, etc.)
   * @returns {Promise<Object>} - SMS response
   */
  static async sendOTP(phoneNumber, otp, purpose = 'authentication') {
    const purposeMessages = {
      authentication: 'login to your account',
      transaction: 'confirm your transaction',
      investment: 'confirm your investment',
      withdrawal: 'confirm your withdrawal',
      wallet_access: 'access your wallet'
    };

    const purposeText = purposeMessages[purpose] || 'verify your identity';

    const message = `🔐 Zybra Security Code: ${otp}\n` +
                   `Use this code to ${purposeText}.\n` +
                   `Valid for 5 minutes only.\n` +
                   `Never share this code!\n` +
                   `If you didn't request this, contact support.`;

    try {
      const result = await this.sendSMS(phoneNumber, message);

      // Log OTP sending for security audit
      logger.info(`OTP sent for ${purpose}`, {
        phoneNumber: phoneNumber.replace(/(\d{3})\d{6}(\d{3})/, '$1****$2'),
        purpose,
        timestamp: new Date().toISOString()
      });

      return result;
    } catch (error) {
      logger.error('Error sending OTP SMS:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send error notification SMS
   * @param {string} phoneNumber - User's phone number
   * @param {string} errorMessage - Error message
   * @returns {Promise<Object>} - SMS response
   */
  static async sendErrorNotification(phoneNumber, errorMessage) {
    const message = `⚠️ Zybra Alert\n` +
                   `${errorMessage}\n` +
                   `If you need help, reply HELP\n` +
                   `Zybra Support`;

    return await this.sendSMS(phoneNumber, message);
  }

  /**
   * Process incoming SMS
   * @param {Object} smsData - Incoming SMS data from Africa's Talking
   * @returns {Promise<Object>} - Processing result
   */
  static async processIncomingSMS(smsData) {
    try {
      const { from, text, linkId, date } = smsData;

      logger.info(`Processing incoming SMS from ${from}: ${text}`);

      // Normalize phone number
      const phoneNumber = from.replace(/^\+/, '');

      // Process different SMS commands
      const command = text.trim().toUpperCase();

      switch (command) {
        case 'BALANCE':
        case 'BAL':
          return await this.handleBalanceRequest(phoneNumber);

        case 'HELP':
          return await this.handleHelpRequest(phoneNumber);

        case 'STOP':
          return await this.handleStopRequest(phoneNumber);

        default:
          // Check if it's an OTP or transaction confirmation
          if (/^\d{4,6}$/.test(command)) {
            return await this.handleOTPVerification(phoneNumber, command);
          }

          // Default help response
          return await this.handleUnknownCommand(phoneNumber, text);
      }
    } catch (error) {
      logger.error('Error processing incoming SMS:', error);
      throw error;
    }
  }

  /**
   * Handle balance request
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Response
   */
  static async handleBalanceRequest(phoneNumber) {
    try {
      const User = require('../db/models').User;
      const user = await User.findByPhone(phoneNumber);

      if (!user) {
        await this.sendSMS(phoneNumber,
          `Account not found. Dial *384*96# to create an account.`);
        return { success: false, message: 'User not found' };
      }

      await this.sendBalanceNotification(phoneNumber, user.balance || 0);
      return { success: true, message: 'Balance sent' };
    } catch (error) {
      logger.error('Error handling balance request:', error);
      await this.sendErrorNotification(phoneNumber, 'Unable to retrieve balance. Please try again.');
      throw error;
    }
  }

  /**
   * Handle help request
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Response
   */
  static async handleHelpRequest(phoneNumber) {
    const helpMessage = `📱 Zybra Help\n` +
                       `Commands:\n` +
                       `• BALANCE - Check balance\n` +
                       `• HELP - This message\n` +
                       `• STOP - Unsubscribe\n` +
                       `\nDial *384*96# for full menu\n` +
                       `Support: help@zybra.com`;

    await this.sendSMS(phoneNumber, helpMessage);
    return { success: true, message: 'Help sent' };
  }

  /**
   * Handle stop request
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Response
   */
  static async handleStopRequest(phoneNumber) {
    // TODO: Implement unsubscribe logic
    const message = `You have been unsubscribed from Zybra SMS notifications.\n` +
                   `You can still use USSD by dialing *384*96#\n` +
                   `To resubscribe, dial *384*96# and follow prompts.`;

    await this.sendSMS(phoneNumber, message);
    return { success: true, message: 'Unsubscribed' };
  }

  /**
   * Handle OTP verification
   * @param {string} phoneNumber - User's phone number
   * @param {string} otp - OTP code
   * @returns {Promise<Object>} - Response
   */
  static async handleOTPVerification(phoneNumber, otp) {
    try {
      const redisClient = require('../db/redisClient');
      const storedOTP = await redisClient.get(`otp:${phoneNumber}`);

      if (!storedOTP || storedOTP !== otp) {
        await this.sendSMS(phoneNumber, 'Invalid or expired verification code.');
        return { success: false, message: 'Invalid OTP' };
      }

      // OTP verified, remove from Redis
      await redisClient.del(`otp:${phoneNumber}`);

      await this.sendSMS(phoneNumber, '✅ Verification successful!');
      return { success: true, message: 'OTP verified' };
    } catch (error) {
      logger.error('Error handling OTP verification:', error);
      await this.sendErrorNotification(phoneNumber, 'Verification failed. Please try again.');
      throw error;
    }
  }

  /**
   * Handle unknown command
   * @param {string} phoneNumber - User's phone number
   * @param {string} text - Original text
   * @returns {Promise<Object>} - Response
   */
  static async handleUnknownCommand(phoneNumber, text) {
    const message = `Command not recognized: "${text}"\n` +
                   `Send HELP for available commands\n` +
                   `Or dial *384*96# for full menu`;

    await this.sendSMS(phoneNumber, message);
    return { success: false, message: 'Unknown command' };
  }
}

module.exports = SMSService;
