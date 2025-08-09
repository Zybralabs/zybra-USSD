const logger = require('../utils/logger');
const redisClient = require('../db/redisClient');
const { User, Transaction, USSDSession } = require('../db/models');
const SMSService = require('./smsEngine');

class USSDService {
  /**
   * Process USSD request from Africa's Talking
   * @param {Object} ussdData - USSD request data
   * @returns {Promise<string>} - USSD response text
   */
  static async processUSSDRequest(ussdData) {
    try {
      const { sessionId, phoneNumber, text, serviceCode } = ussdData;
      
      logger.info(`USSD Request - Session: ${sessionId}, Phone: ${phoneNumber}, Text: "${text}"`);

      // Normalize phone number
      const normalizedPhone = phoneNumber.replace(/^\+/, '');

      // Get or create session
      let session = await USSDSession.findBySessionId(sessionId);
      if (!session) {
        session = await USSDSession.create({
          sessionId,
          phoneNumber: normalizedPhone,
          currentMenu: 'main',
          sessionData: {}
        });
      }

      // Parse user input
      const userInput = text.split('*').pop() || '';
      const inputHistory = text.split('*').filter(input => input !== '');

      // Route to appropriate menu handler
      const response = await this.routeToMenu(session, userInput, inputHistory, normalizedPhone);
      
      // Update session if continuing
      if (response.continue) {
        await USSDSession.update(sessionId, {
          currentMenu: response.nextMenu,
          sessionData: response.sessionData
        });
      } else {
        // End session
        await USSDSession.delete(sessionId);
      }

      return response.text;
    } catch (error) {
      logger.error('Error processing USSD request:', error);
      return 'END Service temporarily unavailable. Please try again later.';
    }
  }

  /**
   * Route to appropriate menu based on current state
   * @param {Object} session - Current session
   * @param {string} userInput - User's current input
   * @param {Array} inputHistory - History of user inputs
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async routeToMenu(session, userInput, inputHistory, phoneNumber) {
    const { currentMenu, session_data: sessionData = {} } = session;

    switch (currentMenu) {
      case 'main':
        return await this.handleMainMenu(userInput, phoneNumber);
      
      case 'balance':
        return await this.handleBalanceMenu(userInput, phoneNumber);
      
      case 'send_money':
        return await this.handleSendMoneyMenu(userInput, sessionData, phoneNumber);
      
      case 'send_amount':
        return await this.handleSendAmountMenu(userInput, sessionData, phoneNumber);
      
      case 'send_confirm':
        return await this.handleSendConfirmMenu(userInput, sessionData, phoneNumber);
      
      case 'receive_money':
        return await this.handleReceiveMoneyMenu(userInput, phoneNumber);
      
      case 'transaction_history':
        return await this.handleTransactionHistoryMenu(userInput, phoneNumber);
      
      case 'account_info':
        return await this.handleAccountInfoMenu(userInput, phoneNumber);
      
      case 'help':
        return await this.handleHelpMenu(userInput);
      
      default:
        return await this.handleMainMenu('', phoneNumber);
    }
  }

  /**
   * Handle main menu
   * @param {string} userInput - User input
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleMainMenu(userInput, phoneNumber) {
    if (!userInput) {
      // First time or returning to main menu
      const user = await User.findByPhone(phoneNumber);
      
      if (!user) {
        // New user - create account
        const walletService = require('./walletService');
        const newUser = await walletService.createUserWallet(phoneNumber);
        
        // Send welcome SMS
        await SMSService.sendWelcomeSMS(phoneNumber, newUser.walletAddress);
        
        return {
          text: `CON Welcome to Zybra! 🎉\nYour account has been created.\n\n1. Check Balance\n2. Send Money\n3. Receive Money\n4. Transaction History\n5. Account Info\n6. Help\n0. Exit`,
          continue: true,
          nextMenu: 'main',
          sessionData: {}
        };
      }

      return {
        text: `CON Welcome back to Zybra! 💰\n\n1. Check Balance\n2. Send Money\n3. Receive Money\n4. Transaction History\n5. Account Info\n6. Help\n0. Exit`,
        continue: true,
        nextMenu: 'main',
        sessionData: {}
      };
    }

    // Handle menu selection
    switch (userInput) {
      case '1':
        return { text: '', continue: true, nextMenu: 'balance', sessionData: {} };
      case '2':
        return { text: '', continue: true, nextMenu: 'send_money', sessionData: {} };
      case '3':
        return { text: '', continue: true, nextMenu: 'receive_money', sessionData: {} };
      case '4':
        return { text: '', continue: true, nextMenu: 'transaction_history', sessionData: {} };
      case '5':
        return { text: '', continue: true, nextMenu: 'account_info', sessionData: {} };
      case '6':
        return { text: '', continue: true, nextMenu: 'help', sessionData: {} };
      case '0':
        return { text: 'END Thank you for using Zybra! 👋', continue: false };
      default:
        return {
          text: `CON Invalid option. Please try again.\n\n1. Check Balance\n2. Send Money\n3. Receive Money\n4. Transaction History\n5. Account Info\n6. Help\n0. Exit`,
          continue: true,
          nextMenu: 'main',
          sessionData: {}
        };
    }
  }

  /**
   * Handle balance menu
   * @param {string} userInput - User input
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleBalanceMenu(userInput, phoneNumber) {
    try {
      const user = await User.findByPhone(phoneNumber);
      const balance = user?.balance || 0;
      
      return {
        text: `END Your Zybra Balance 💰\n\nBalance: ${balance} ZrUSD\nWallet: ${user?.wallet_address?.substring(0, 10)}...\n\nThank you for using Zybra!`,
        continue: false
      };
    } catch (error) {
      logger.error('Error getting balance:', error);
      return {
        text: 'END Unable to retrieve balance. Please try again later.',
        continue: false
      };
    }
  }

  /**
   * Handle send money menu
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleSendMoneyMenu(userInput, sessionData, phoneNumber) {
    if (!userInput) {
      return {
        text: 'CON Send Money 💸\n\nEnter recipient phone number:\n(e.g., 254712345678)',
        continue: true,
        nextMenu: 'send_amount',
        sessionData: {}
      };
    }

    // Validate phone number
    const recipientPhone = userInput.replace(/[\s\-\+]/g, '');
    if (!/^\d{10,15}$/.test(recipientPhone)) {
      return {
        text: 'CON Invalid phone number format.\n\nEnter recipient phone number:\n(e.g., 254712345678)',
        continue: true,
        nextMenu: 'send_amount',
        sessionData: {}
      };
    }

    // Check if recipient exists
    const recipient = await User.findByPhone(recipientPhone);
    if (!recipient) {
      return {
        text: `CON Recipient ${recipientPhone} is not registered with Zybra.\n\n1. Try another number\n2. Send invitation SMS\n0. Back to main menu`,
        continue: true,
        nextMenu: 'send_money',
        sessionData: { recipientPhone }
      };
    }

    return {
      text: 'CON Enter amount to send:\n(e.g., 100)',
      continue: true,
      nextMenu: 'send_amount',
      sessionData: { recipientPhone }
    };
  }

  /**
   * Handle send amount menu
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleSendAmountMenu(userInput, sessionData, phoneNumber) {
    const { recipientPhone } = sessionData;

    if (!userInput) {
      return {
        text: 'CON Enter amount to send:\n(e.g., 100)',
        continue: true,
        nextMenu: 'send_amount',
        sessionData
      };
    }

    const amount = parseFloat(userInput);
    if (isNaN(amount) || amount <= 0) {
      return {
        text: 'CON Invalid amount. Please enter a valid number:\n(e.g., 100)',
        continue: true,
        nextMenu: 'send_amount',
        sessionData
      };
    }

    // Check user balance
    const user = await User.findByPhone(phoneNumber);
    if (!user || user.balance < amount) {
      return {
        text: `END Insufficient balance.\nYour balance: ${user?.balance || 0} ZrUSD\nRequested: ${amount} ZrUSD`,
        continue: false
      };
    }

    return {
      text: `CON Confirm Transaction 📋\n\nSend: ${amount} ZrUSD\nTo: ${recipientPhone}\nFee: 0.1 ZrUSD\nTotal: ${amount + 0.1} ZrUSD\n\n1. Confirm\n2. Cancel`,
      continue: true,
      nextMenu: 'send_confirm',
      sessionData: { ...sessionData, amount }
    };
  }

  /**
   * Handle send confirmation menu
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleSendConfirmMenu(userInput, sessionData, phoneNumber) {
    const { recipientPhone, amount } = sessionData;

    if (userInput === '1') {
      try {
        // Process transaction
        const transactionService = require('./transactionService');
        const result = await transactionService.processTransfer(
          phoneNumber,
          recipientPhone,
          amount,
          'ZrUSD'
        );

        if (result.success) {
          return {
            text: `END Transaction Successful! ✅\n\nSent: ${amount} ZrUSD\nTo: ${recipientPhone}\nTX ID: ${result.transactionId}\n\nSMS confirmation sent.`,
            continue: false
          };
        } else {
          return {
            text: `END Transaction Failed ❌\n\nReason: ${result.error}\n\nPlease try again later.`,
            continue: false
          };
        }
      } catch (error) {
        logger.error('Transaction error:', error);
        return {
          text: 'END Transaction failed due to system error. Please try again later.',
          continue: false
        };
      }
    } else if (userInput === '2') {
      return {
        text: 'END Transaction cancelled.',
        continue: false
      };
    } else {
      return {
        text: `CON Invalid option.\n\nSend: ${amount} ZrUSD\nTo: ${recipientPhone}\n\n1. Confirm\n2. Cancel`,
        continue: true,
        nextMenu: 'send_confirm',
        sessionData
      };
    }
  }

  /**
   * Handle receive money menu
   * @param {string} userInput - User input
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleReceiveMoneyMenu(userInput, phoneNumber) {
    const user = await User.findByPhone(phoneNumber);

    return {
      text: `END Receive Money 📥\n\nYour Details:\nPhone: ${phoneNumber}\nWallet: ${user?.wallet_address?.substring(0, 20)}...\n\nShare these details to receive money.`,
      continue: false
    };
  }

  /**
   * Handle transaction history menu
   * @param {string} userInput - User input
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleTransactionHistoryMenu(userInput, phoneNumber) {
    try {
      const transactions = await Transaction.findByPhone(phoneNumber, 5);

      if (transactions.length === 0) {
        return {
          text: 'END No transactions found.\n\nStart using Zybra to see your transaction history here.',
          continue: false
        };
      }

      let historyText = 'END Recent Transactions 📊\n\n';
      transactions.forEach((tx, index) => {
        const date = new Date(tx.created_at).toLocaleDateString();
        const status = tx.status === 'completed' ? '✅' : tx.status === 'failed' ? '❌' : '⏳';
        historyText += `${index + 1}. ${tx.type.toUpperCase()} ${status}\n`;
        historyText += `   ${tx.amount} ${tx.currency}\n`;
        historyText += `   ${date}\n\n`;
      });

      return {
        text: historyText,
        continue: false
      };
    } catch (error) {
      logger.error('Error getting transaction history:', error);
      return {
        text: 'END Unable to retrieve transaction history. Please try again later.',
        continue: false
      };
    }
  }

  /**
   * Handle account info menu
   * @param {string} userInput - User input
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleAccountInfoMenu(userInput, phoneNumber) {
    try {
      const user = await User.findByPhone(phoneNumber);

      if (!user) {
        return {
          text: 'END Account not found. Please contact support.',
          continue: false
        };
      }

      const joinDate = new Date(user.created_at).toLocaleDateString();

      return {
        text: `END Account Information ℹ️\n\nPhone: ${phoneNumber}\nWallet: ${user.wallet_address?.substring(0, 20)}...\nBalance: ${user.balance || 0} ZrUSD\nJoined: ${joinDate}\n\nZybra Digital Wallet`,
        continue: false
      };
    } catch (error) {
      logger.error('Error getting account info:', error);
      return {
        text: 'END Unable to retrieve account information. Please try again later.',
        continue: false
      };
    }
  }

  /**
   * Handle help menu
   * @param {string} userInput - User input
   * @returns {Promise<Object>} - Menu response
   */
  static async handleHelpMenu(userInput) {
    return {
      text: `END Zybra Help 📱\n\nServices:\n• Check Balance\n• Send/Receive Money\n• Transaction History\n• Account Management\n\nSupport:\n• SMS: Send HELP to this number\n• Email: help@zybra.com\n• Web: www.zybra.com\n\nThank you for using Zybra!`,
      continue: false
    };
  }

  /**
   * Generate OTP for verification
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<string>} - Generated OTP
   */
  static async generateOTP(phoneNumber) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in Redis with 5-minute expiration
    await redisClient.setex(`otp:${phoneNumber}`, 300, otp);

    // Send OTP via SMS
    await SMSService.sendOTP(phoneNumber, otp);

    return otp;
  }

  /**
   * Verify OTP
   * @param {string} phoneNumber - User's phone number
   * @param {string} otp - OTP to verify
   * @returns {Promise<boolean>} - Verification result
   */
  static async verifyOTP(phoneNumber, otp) {
    try {
      const storedOTP = await redisClient.get(`otp:${phoneNumber}`);

      if (!storedOTP || storedOTP !== otp) {
        return false;
      }

      // Remove OTP after successful verification
      await redisClient.del(`otp:${phoneNumber}`);
      return true;
    } catch (error) {
      logger.error('Error verifying OTP:', error);
      return false;
    }
  }
}

module.exports = USSDService;
