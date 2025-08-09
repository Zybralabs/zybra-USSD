const AfricasTalking = require('africastalking');

// Initialize Africa's Talking
const africastalking = AfricasTalking({
  apiKey: process.env.AFRICASTALKING_API_KEY || 'your_api_key',
  username: process.env.AFRICASTALKING_USERNAME || 'your_username',
});

const sms = africastalking.SMS;

/**
 * Simple SMS sender wrapper for Africa's Talking
 * This is a simplified version for quick SMS sending
 */
class SMSSender {
  /**
   * Send SMS message
   * @param {string|Array} to - Phone number(s) to send to
   * @param {string} message - Message content
   * @param {string} from - Sender ID (optional)
   * @returns {Promise<Object>} - SMS response
   */
  static async send(to, message, from = null) {
    try {
      const options = {
        to: Array.isArray(to) ? to : [to],
        message: message,
      };

      if (from) {
        options.from = from;
      }

      console.log(`📱 Sending SMS to ${to}: ${message.substring(0, 50)}...`);

      const response = await sms.send(options);

      console.log('✅ SMS sent successfully:', response);
      return {
        success: true,
        data: response,
        messageId: response.SMSMessageData?.Recipients?.[0]?.messageId
      };
    } catch (error) {
      console.error('❌ SMS sending failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send bulk SMS to multiple recipients
   * @param {Array} recipients - Array of phone numbers
   * @param {string} message - Message content
   * @param {string} from - Sender ID (optional)
   * @returns {Promise<Object>} - SMS response
   */
  static async sendBulk(recipients, message, from = null) {
    try {
      const options = {
        to: recipients,
        message: message,
      };

      if (from) {
        options.from = from;
      }

      console.log(`📱 Sending bulk SMS to ${recipients.length} recipients`);

      const response = await sms.send(options);

      console.log('✅ Bulk SMS sent successfully');
      return {
        success: true,
        data: response,
        recipientCount: recipients.length
      };
    } catch (error) {
      console.error('❌ Bulk SMS sending failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send transaction notification SMS
   * @param {string} phoneNumber - User's phone number
   * @param {Object} transaction - Transaction details
   * @returns {Promise<Object>} - SMS response
   */
  static async sendTransactionNotification(phoneNumber, transaction) {
    const { type, amount, currency, status } = transaction;

    let message;
    if (status === 'completed') {
      message = `✅ Transaction Confirmed!\n` +
                `${type.toUpperCase()}: ${amount} ${currency}\n` +
                `Time: ${new Date().toLocaleString()}\n` +
                `Zybra`;
    } else if (status === 'failed') {
      message = `❌ Transaction Failed!\n` +
                `${type.toUpperCase()}: ${amount} ${currency}\n` +
                `Please try again.\n` +
                `Zybra`;
    } else {
      message = `⏳ Transaction Pending...\n` +
                `${type.toUpperCase()}: ${amount} ${currency}\n` +
                `We'll notify you once confirmed.\n` +
                `Zybra`;
    }

    return await this.send(phoneNumber, message);
  }

  /**
   * Send balance notification SMS
   * @param {string} phoneNumber - User's phone number
   * @param {number} balance - Current balance
   * @returns {Promise<Object>} - SMS response
   */
  static async sendBalance(phoneNumber, balance) {
    const message = `💰 Your Zybra Balance: ${balance} ZrUSD\n` +
                   `Time: ${new Date().toLocaleString()}\n` +
                   `Dial *384*96# for more options`;

    return await this.send(phoneNumber, message);
  }
}

module.exports = SMSSender;
