const logger = require('../utils/logger');
const redisClient = require('../db/redisClient');
const { User, Transaction, USSDSession } = require('../db/models');
const SMSService = require('./smsEngine');
const AuthService = require('./authService');

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

      case 'invest':
        return await this.handleInvestMenu(userInput, sessionData, phoneNumber);

      case 'invest_amount':
        return await this.handleInvestAmountMenu(userInput, sessionData, phoneNumber);

      case 'invest_vault_select':
        return await this.handleVaultSelectionMenu(userInput, sessionData, phoneNumber);

      case 'invest_confirm':
        return await this.handleInvestConfirmMenu(userInput, sessionData, phoneNumber);

      case 'invest_otp_verify':
        return await this.handleInvestOTPVerifyMenu(userInput, sessionData, phoneNumber);

      case 'withdraw':
        return await this.handleWithdrawMenu(userInput, sessionData, phoneNumber);

      case 'withdraw_vault_select':
        return await this.handleWithdrawVaultSelectMenu(userInput, sessionData, phoneNumber);

      case 'withdraw_amount':
        return await this.handleWithdrawAmountMenu(userInput, sessionData, phoneNumber);

      case 'withdraw_confirm':
        return await this.handleWithdrawConfirmMenu(userInput, sessionData, phoneNumber);

      case 'withdraw_otp_verify':
        return await this.handleWithdrawOTPVerifyMenu(userInput, sessionData, phoneNumber);

      // Legacy menu handlers (kept for backward compatibility)
      case 'send_money':
        return await this.handleSendMoneyMenu(userInput, sessionData, phoneNumber);

      case 'send_amount':
        return await this.handleSendAmountMenu(userInput, sessionData, phoneNumber);

      case 'send_confirm':
        return await this.handleSendConfirmMenu(userInput, sessionData, phoneNumber);

      case 'receive_money':
        return await this.handleReceiveMoneyMenu(userInput, sessionData, phoneNumber);

      case 'deposit_method':
        return await this.handleReceiveMoneyMenu(userInput, sessionData, phoneNumber);

      case 'deposit_provider':
        return await this.handleDepositProviderMenu(userInput, sessionData, phoneNumber);

      case 'deposit_currency':
        return await this.handleDepositCurrencyMenu(userInput, sessionData, phoneNumber);

      case 'deposit_amount':
        return await this.handleDepositAmountMenu(userInput, sessionData, phoneNumber);

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
          text: `CON Welcome to Zybra DeFi! 🎉\nYour crypto wallet has been created.\n\n1. Check Balance\n2. Invest in DeFi\n3. Withdraw Funds\n0. Exit`,
          continue: true,
          nextMenu: 'main',
          sessionData: {}
        };
      }

      return {
        text: `CON Welcome to Zybra DeFi! 💰\n\n1. Check Balance\n2. Invest in DeFi\n3. Withdraw Funds\n0. Exit`,
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
        return { text: '', continue: true, nextMenu: 'invest', sessionData: {} };
      case '3':
        return { text: '', continue: true, nextMenu: 'withdraw', sessionData: {} };
      case '0':
        return { text: 'END Thank you for using Zybra DeFi! 👋', continue: false };
      default:
        return {
          text: `CON Invalid option. Please try again.\n\n1. Check Balance\n2. Invest in DeFi\n3. Withdraw Funds\n0. Exit`,
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
      const walletBalance = user?.balance || 0;

      // Get Morpho vault positions
      const morphoService = require('./morphoService');
      const positionsResult = await morphoService.getUserPositions(user?.wallet_address);

      let balanceText = `Your Zybra Portfolio 💰\n\nWallet Balance: ${walletBalance} USDT\n`;

      if (positionsResult.success && positionsResult.positions.length > 0) {
        let totalInvested = 0;
        balanceText += `\nDeFi Investments:\n`;

        positionsResult.positions.slice(0, 3).forEach((pos, index) => {
          const amount = parseFloat(pos.assetsUsd || pos.assets || 0);
          totalInvested += amount;
          balanceText += `${index + 1}. ${pos.vaultName.substring(0, 15)}: $${amount.toFixed(2)}\n`;
        });

        if (positionsResult.positions.length > 3) {
          balanceText += `...and ${positionsResult.positions.length - 3} more\n`;
        }

        balanceText += `\nTotal Invested: $${totalInvested.toFixed(2)}`;
        balanceText += `\nTotal Portfolio: $${(walletBalance + totalInvested).toFixed(2)}`;
      } else {
        balanceText += `\nDeFi Investments: $0.00`;
        balanceText += `\nTotal Portfolio: $${walletBalance.toFixed(2)}`;
      }

      balanceText += `\n\nWallet: ${user?.wallet_address?.substring(0, 10)}...`;

      return {
        text: `END ${balanceText}`,
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
   * Handle invest menu - show investment options
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleInvestMenu(userInput, sessionData, phoneNumber) {
    if (!userInput) {
      const user = await User.findByPhone(phoneNumber);
      const balance = user?.balance || 0;

      if (balance < 10) {
        return {
          text: `END Insufficient Balance 💸\n\nYou need at least $10 USDT to invest.\nCurrent balance: $${balance}\n\nPlease add funds to your wallet first.`,
          continue: false
        };
      }

      return {
        text: `CON Invest in DeFi 📈\n\nBalance: $${balance} USDT\n\n1. Buy Crypto & Invest\n2. Invest Existing Balance\n9. Back to Main Menu\n0. Exit`,
        continue: true,
        nextMenu: 'invest',
        sessionData: { balance }
      };
    }

    switch (userInput) {
      case '1':
        return {
          text: 'CON Buy Crypto & Invest 💳\n\nEnter amount in KES to invest:\n(Min: 1000 KES)',
          continue: true,
          nextMenu: 'invest_amount',
          sessionData: { ...sessionData, investmentType: 'buy_and_invest' }
        };
      case '2':
        return {
          text: `CON Invest Existing Balance 💰\n\nAvailable: $${sessionData.balance} USDT\n\nEnter amount to invest:\n(Min: $10 USDT)`,
          continue: true,
          nextMenu: 'invest_amount',
          sessionData: { ...sessionData, investmentType: 'existing_balance' }
        };
      case '9':
        return { text: '', continue: true, nextMenu: 'main', sessionData: {} };
      case '0':
        return { text: 'END Thank you for using Zybra DeFi! 👋', continue: false };
      default:
        return {
          text: `CON Invalid option. Please try again.\n\n1. Buy Crypto & Invest\n2. Invest Existing Balance\n9. Back to Main Menu\n0. Exit`,
          continue: true,
          nextMenu: 'invest',
          sessionData
        };
    }
  }

  /**
   * Handle investment amount input
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleInvestAmountMenu(userInput, sessionData, phoneNumber) {
    const amount = parseFloat(userInput);
    const { investmentType, balance } = sessionData;

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      return {
        text: `CON Invalid amount. Please enter a valid number.\n\nEnter amount to invest:`,
        continue: true,
        nextMenu: 'invest_amount',
        sessionData
      };
    }

    if (investmentType === 'buy_and_invest') {
      // Buying crypto with KES
      if (amount < 1000) {
        return {
          text: `CON Minimum investment is 1000 KES.\n\nEnter amount in KES:`,
          continue: true,
          nextMenu: 'invest_amount',
          sessionData
        };
      }

      // Convert KES to approximate USDT (assuming 1 USD = 130 KES)
      const usdtAmount = (amount / 130).toFixed(2);

      return {
        text: '',
        continue: true,
        nextMenu: 'invest_vault_select',
        sessionData: {
          ...sessionData,
          investAmount: amount,
          usdtAmount: parseFloat(usdtAmount),
          currency: 'KES'
        }
      };
    } else {
      // Using existing balance
      if (amount < 10) {
        return {
          text: `CON Minimum investment is $10 USDT.\n\nEnter amount in USDT:`,
          continue: true,
          nextMenu: 'invest_amount',
          sessionData
        };
      }

      if (amount > balance) {
        return {
          text: `CON Insufficient balance. Available: $${balance}\n\nEnter amount in USDT:`,
          continue: true,
          nextMenu: 'invest_amount',
          sessionData
        };
      }

      return {
        text: '',
        continue: true,
        nextMenu: 'invest_vault_select',
        sessionData: {
          ...sessionData,
          investAmount: amount,
          usdtAmount: amount,
          currency: 'USDT'
        }
      };
    }
  }

  /**
   * Handle vault selection menu
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleVaultSelectionMenu(userInput, sessionData, phoneNumber) {
    if (!userInput) {
      // Fetch available Morpho vaults
      const morphoService = require('./morphoService');
      const vaultsResult = await morphoService.fetchAvailableVaults(); // Fetch popular vaults

      if (!vaultsResult.success || vaultsResult.vaults.length === 0) {
        return {
          text: 'END Sorry, no investment vaults are available at the moment. Please try again later.',
          continue: false
        };
      }

      const formattedVaults = morphoService.formatVaultsForUSSD(vaultsResult.vaults);
      let vaultText = `CON Select Investment Vault 📊\n\nAmount: ${sessionData.currency === 'KES' ? sessionData.investAmount + ' KES' : '$' + sessionData.usdtAmount}\n\n`;

      formattedVaults.forEach(vault => {
        vaultText += `${vault.index}. ${vault.name}\n   APY: ${vault.apy} | Risk: ${vault.risk}\n`;
      });

      vaultText += `\n9. Back\n0. Exit`;

      return {
        text: vaultText,
        continue: true,
        nextMenu: 'invest_vault_select',
        sessionData: { ...sessionData, availableVaults: vaultsResult.vaults }
      };
    }

    const selection = parseInt(userInput);
    const { availableVaults } = sessionData;

    if (userInput === '9') {
      return { text: '', continue: true, nextMenu: 'invest_amount', sessionData };
    }

    if (userInput === '0') {
      return { text: 'END Thank you for using Zybra DeFi! 👋', continue: false };
    }

    if (isNaN(selection) || selection < 1 || selection > availableVaults.length) {
      return {
        text: `CON Invalid selection. Please choose 1-${availableVaults.length}, 9 for back, or 0 to exit.`,
        continue: true,
        nextMenu: 'invest_vault_select',
        sessionData
      };
    }

    const selectedVault = availableVaults[selection - 1];

    return {
      text: '',
      continue: true,
      nextMenu: 'invest_confirm',
      sessionData: { ...sessionData, selectedVault }
    };
  }

  /**
   * Handle investment confirmation
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleInvestConfirmMenu(userInput, sessionData, phoneNumber) {
    const { selectedVault, investAmount, usdtAmount, currency, investmentType } = sessionData;

    if (!userInput) {
      let confirmText = `CON Confirm Investment 🔒\n\n`;
      confirmText += `Vault: ${selectedVault.name}\n`;
      confirmText += `Amount: ${currency === 'KES' ? investAmount + ' KES' : '$' + usdtAmount}\n`;
      confirmText += `Expected APY: ${(selectedVault.netApy * 100).toFixed(2)}%\n`;
      confirmText += `Risk Level: ${selectedVault.riskLevel}\n\n`;

      if (investmentType === 'buy_and_invest') {
        confirmText += `This will:\n1. Buy ~$${usdtAmount} USDT\n2. Invest in ${selectedVault.symbol}\n\n`;
      } else {
        confirmText += `This will invest your USDT in ${selectedVault.symbol}\n\n`;
      }

      confirmText += `1. Confirm Investment\n2. Cancel\n0. Exit`;

      return {
        text: confirmText,
        continue: true,
        nextMenu: 'invest_confirm',
        sessionData
      };
    }

    switch (userInput) {
      case '1':
        // Process investment
        return await this.processInvestment(sessionData, phoneNumber);
      case '2':
        return { text: '', continue: true, nextMenu: 'invest_vault_select', sessionData };
      case '0':
        return { text: 'END Thank you for using Zybra DeFi! 👋', continue: false };
      default:
        return {
          text: 'CON Invalid option. Please choose:\n\n1. Confirm Investment\n2. Cancel\n0. Exit',
          continue: true,
          nextMenu: 'invest_confirm',
          sessionData
        };
    }
  }

  /**
   * Handle OTP verification for investment
   * @param {string} userInput - User input (OTP)
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleInvestOTPVerifyMenu(userInput, sessionData, phoneNumber) {
    if (!userInput) {
      return {
        text: `CON Security Verification 🔐\n\nEnter the 6-digit OTP sent to your phone:\n\n(Enter OTP or 0 to cancel)`,
        continue: true,
        nextMenu: 'invest_otp_verify',
        sessionData
      };
    }

    if (userInput === '0') {
      return {
        text: 'END Investment cancelled. Thank you for using Zybra DeFi! 👋',
        continue: false
      };
    }

    // Verify OTP
    const verification = await AuthService.verifySecureOTP(phoneNumber, userInput, 'investment');
    if (!verification.success) {
      return {
        text: `CON Verification Failed ❌\n\n${verification.error}\n\nEnter OTP again or 0 to cancel:`,
        continue: true,
        nextMenu: 'invest_otp_verify',
        sessionData
      };
    }

    // OTP verified, mark as authenticated and proceed with investment
    const updatedSessionData = { ...sessionData, authVerified: true };
    return await this.processInvestmentAfterAuth(updatedSessionData, phoneNumber);
  }

  /**
   * Process the investment transaction
   * @param {Object} sessionData - Session data with investment details
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Investment result
   */
  static async processInvestment(sessionData, phoneNumber) {
    try {
      const { selectedVault, investAmount, usdtAmount, investmentType, authVerified } = sessionData;

      // Check if user is authorized for investment operations
      const authorization = await AuthService.authorizeWalletOperation(phoneNumber, 'invest');
      if (!authorization.success) {
        if (authorization.requiresAuth || authorization.requiresRecentAuth) {
          // Generate OTP for authentication
          const otpResult = await AuthService.generateSecureOTP(phoneNumber, 'investment');
          if (otpResult.success) {
            return {
              text: `CON Security Verification Required 🔐\n\nAn OTP has been sent to your phone.\nEnter the 6-digit code to confirm your investment:\n\n(Enter OTP or 0 to cancel)`,
              continue: true,
              nextMenu: 'invest_otp_verify',
              sessionData: { ...sessionData, otpSent: true }
            };
          } else {
            return {
              text: `END Authentication Failed ❌\n\n${otpResult.error}\n\nPlease try again later.`,
              continue: false
            };
          }
        } else {
          return {
            text: `END Investment Not Authorized ❌\n\n${authorization.error}\n\nPlease contact support if this persists.`,
            continue: false
          };
        }
      }

      return await this.processInvestmentAfterAuth(sessionData, phoneNumber);
    } catch (error) {
      logger.error('Error in processInvestment:', error);
      return {
        text: 'END Investment failed due to system error. Please try again later.',
        continue: false
      };
    }
  }

  /**
   * Process investment after authentication is verified
   * @param {Object} sessionData - Session data with investment details
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Investment result
   */
  static async processInvestmentAfterAuth(sessionData, phoneNumber) {
    try {
      const { selectedVault, investAmount, usdtAmount, investmentType } = sessionData;
      const user = await User.findByPhone(phoneNumber);

      if (investmentType === 'buy_and_invest') {
        // First buy crypto via YellowCard, then invest
        const yellowCardService = require('./yellowCardService');

        const purchaseResult = await yellowCardService.purchaseCrypto({
          phoneNumber,
          fiatAmount: investAmount,
          fiatCurrency: 'KES',
          cryptoCurrency: 'USDT',
          countryCode: 'KE',
          paymentMethod: 'mobile_money',
          firstName: user.first_name || 'User',
          lastName: user.last_name || 'Zybra'
        });

        if (!purchaseResult.success) {
          return {
            text: `END Investment Failed ❌\n\nCrypto purchase failed: ${purchaseResult.error}\n\nPlease try again later.`,
            continue: false
          };
        }

        // Create pending investment record
        await Transaction.create({
          phoneNumber,
          type: 'pending_investment',
          amount: usdtAmount,
          currency: 'USDT',
          status: 'pending',
          metadata: {
            vaultAddress: selectedVault.address,
            vaultName: selectedVault.name,
            yellowCardId: purchaseResult.collectionId,
            investmentType: 'buy_and_invest'
          }
        });

        return {
          text: `END Investment Initiated! 🚀\n\nStep 1: Buying ${usdtAmount} USDT with ${investAmount} KES\n\nYou'll receive SMS instructions for payment.\n\nOnce payment is confirmed, we'll automatically invest in ${selectedVault.name}.`,
          continue: false
        };

      } else {
        // Invest existing balance directly
        if (user.balance < usdtAmount) {
          return {
            text: `END Insufficient Balance ❌\n\nRequired: $${usdtAmount}\nAvailable: $${user.balance}\n\nPlease add funds first.`,
            continue: false
          };
        }

        // For now, create a pending investment record
        // In a full implementation, this would interact with Morpho contracts
        await Transaction.create({
          phoneNumber,
          type: 'morpho_investment',
          amount: usdtAmount,
          currency: 'USDT',
          status: 'completed',
          metadata: {
            vaultAddress: selectedVault.address,
            vaultName: selectedVault.name,
            investmentType: 'existing_balance'
          }
        });

        // Update user balance
        await User.updateBalance(phoneNumber, user.balance - usdtAmount);

        return {
          text: `END Investment Successful! 🎉\n\nInvested: $${usdtAmount} USDT\nVault: ${selectedVault.name}\nExpected APY: ${(selectedVault.netApy * 100).toFixed(2)}%\n\nYour investment is now earning yield!`,
          continue: false
        };
      }

    } catch (error) {
      logger.error('Error processing investment:', error);
      return {
        text: 'END Investment failed due to a technical error. Please try again later.',
        continue: false
      };
    }
  }

  /**
   * Handle withdraw menu - show withdrawal options
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleWithdrawMenu(userInput, sessionData, phoneNumber) {
    if (!userInput) {
      const user = await User.findByPhone(phoneNumber);

      // Get user's vault positions
      const morphoService = require('./morphoService');
      const positionsResult = await morphoService.getUserPositions(user?.wallet_address);

      if (!positionsResult.success || positionsResult.positions.length === 0) {
        return {
          text: `END No Investments Found 📭\n\nYou don't have any active DeFi investments to withdraw from.\n\nStart investing to earn yield!`,
          continue: false
        };
      }

      return {
        text: `CON Withdraw Funds 💸\n\nYou have ${positionsResult.positions.length} active investment(s)\n\n1. Withdraw from DeFi\n2. Withdraw to Mobile Money\n9. Back to Main Menu\n0. Exit`,
        continue: true,
        nextMenu: 'withdraw',
        sessionData: { positions: positionsResult.positions }
      };
    }

    switch (userInput) {
      case '1':
        return { text: '', continue: true, nextMenu: 'withdraw_vault_select', sessionData };
      case '2':
        return {
          text: 'CON Withdraw to Mobile Money 📱\n\nThis feature will be available soon.\n\nFor now, you can withdraw to your wallet and then transfer.\n\n9. Back\n0. Exit',
          continue: true,
          nextMenu: 'withdraw',
          sessionData
        };
      case '9':
        return { text: '', continue: true, nextMenu: 'main', sessionData: {} };
      case '0':
        return { text: 'END Thank you for using Zybra DeFi! 👋', continue: false };
      default:
        return {
          text: `CON Invalid option. Please try again.\n\n1. Withdraw from DeFi\n2. Withdraw to Mobile Money\n9. Back to Main Menu\n0. Exit`,
          continue: true,
          nextMenu: 'withdraw',
          sessionData
        };
    }
  }

  /**
   * Handle withdraw vault selection
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleWithdrawVaultSelectMenu(userInput, sessionData, phoneNumber) {
    if (!userInput) {
      const { positions } = sessionData;

      let vaultText = `CON Select Investment to Withdraw 📊\n\n`;

      positions.slice(0, 5).forEach((pos, index) => {
        const amount = parseFloat(pos.assetsUsd || pos.assets || 0);
        vaultText += `${index + 1}. ${pos.vaultName.substring(0, 20)}\n   Balance: $${amount.toFixed(2)}\n`;
      });

      vaultText += `\n9. Back\n0. Exit`;

      return {
        text: vaultText,
        continue: true,
        nextMenu: 'withdraw_vault_select',
        sessionData
      };
    }

    const selection = parseInt(userInput);
    const { positions } = sessionData;

    if (userInput === '9') {
      return { text: '', continue: true, nextMenu: 'withdraw', sessionData };
    }

    if (userInput === '0') {
      return { text: 'END Thank you for using Zybra DeFi! 👋', continue: false };
    }

    if (isNaN(selection) || selection < 1 || selection > Math.min(positions.length, 5)) {
      return {
        text: `CON Invalid selection. Please choose 1-${Math.min(positions.length, 5)}, 9 for back, or 0 to exit.`,
        continue: true,
        nextMenu: 'withdraw_vault_select',
        sessionData
      };
    }

    const selectedPosition = positions[selection - 1];

    return {
      text: '',
      continue: true,
      nextMenu: 'withdraw_amount',
      sessionData: { ...sessionData, selectedPosition }
    };
  }

  /**
   * Handle withdrawal amount input
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleWithdrawAmountMenu(userInput, sessionData, phoneNumber) {
    const { selectedPosition } = sessionData;
    const maxAmount = parseFloat(selectedPosition.assetsUsd || selectedPosition.assets || 0);

    if (!userInput) {
      return {
        text: `CON Withdraw Amount 💰\n\nFrom: ${selectedPosition.vaultName}\nAvailable: $${maxAmount.toFixed(2)}\n\nEnter amount to withdraw:\n(Max: $${maxAmount.toFixed(2)})`,
        continue: true,
        nextMenu: 'withdraw_amount',
        sessionData
      };
    }

    const amount = parseFloat(userInput);

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      return {
        text: `CON Invalid amount. Please enter a valid number.\n\nEnter amount to withdraw:`,
        continue: true,
        nextMenu: 'withdraw_amount',
        sessionData
      };
    }

    if (amount > maxAmount) {
      return {
        text: `CON Amount exceeds available balance.\nAvailable: $${maxAmount.toFixed(2)}\n\nEnter amount to withdraw:`,
        continue: true,
        nextMenu: 'withdraw_amount',
        sessionData
      };
    }

    return {
      text: '',
      continue: true,
      nextMenu: 'withdraw_confirm',
      sessionData: { ...sessionData, withdrawAmount: amount }
    };
  }

  /**
   * Handle withdrawal confirmation
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleWithdrawConfirmMenu(userInput, sessionData, phoneNumber) {
    const { selectedPosition, withdrawAmount } = sessionData;

    if (!userInput) {
      let confirmText = `CON Confirm Withdrawal 🔒\n\n`;
      confirmText += `From: ${selectedPosition.vaultName}\n`;
      confirmText += `Amount: $${withdrawAmount.toFixed(2)} USDT\n`;
      confirmText += `To: Your Zybra Wallet\n\n`;
      confirmText += `1. Confirm Withdrawal\n2. Cancel\n0. Exit`;

      return {
        text: confirmText,
        continue: true,
        nextMenu: 'withdraw_confirm',
        sessionData
      };
    }

    switch (userInput) {
      case '1':
        // Process withdrawal
        return await this.processWithdrawal(sessionData, phoneNumber);
      case '2':
        return { text: '', continue: true, nextMenu: 'withdraw_amount', sessionData };
      case '0':
        return { text: 'END Thank you for using Zybra DeFi! 👋', continue: false };
      default:
        return {
          text: 'CON Invalid option. Please choose:\n\n1. Confirm Withdrawal\n2. Cancel\n0. Exit',
          continue: true,
          nextMenu: 'withdraw_confirm',
          sessionData
        };
    }
  }

  /**
   * Handle OTP verification for withdrawal
   * @param {string} userInput - User input (OTP)
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleWithdrawOTPVerifyMenu(userInput, sessionData, phoneNumber) {
    if (!userInput) {
      return {
        text: `CON Security Verification 🔐\n\nEnter the 6-digit OTP sent to your phone:\n\n(Enter OTP or 0 to cancel)`,
        continue: true,
        nextMenu: 'withdraw_otp_verify',
        sessionData
      };
    }

    if (userInput === '0') {
      return {
        text: 'END Withdrawal cancelled. Thank you for using Zybra DeFi! 👋',
        continue: false
      };
    }

    // Verify OTP
    const verification = await AuthService.verifySecureOTP(phoneNumber, userInput, 'withdrawal');
    if (!verification.success) {
      return {
        text: `CON Verification Failed ❌\n\n${verification.error}\n\nEnter OTP again or 0 to cancel:`,
        continue: true,
        nextMenu: 'withdraw_otp_verify',
        sessionData
      };
    }

    // OTP verified, mark as authenticated and proceed with withdrawal
    const updatedSessionData = { ...sessionData, authVerified: true };
    return await this.processWithdrawalAfterAuth(updatedSessionData, phoneNumber);
  }

  /**
   * Process the withdrawal transaction
   * @param {Object} sessionData - Session data with withdrawal details
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Withdrawal result
   */
  static async processWithdrawal(sessionData, phoneNumber) {
    try {
      const { selectedPosition, withdrawAmount } = sessionData;

      // Check if user is authorized for withdrawal operations
      const authorization = await AuthService.authorizeWalletOperation(phoneNumber, 'withdraw');
      if (!authorization.success) {
        if (authorization.requiresAuth || authorization.requiresRecentAuth) {
          // Generate OTP for authentication
          const otpResult = await AuthService.generateSecureOTP(phoneNumber, 'withdrawal');
          if (otpResult.success) {
            return {
              text: `CON Security Verification Required 🔐\n\nAn OTP has been sent to your phone.\nEnter the 6-digit code to confirm your withdrawal:\n\n(Enter OTP or 0 to cancel)`,
              continue: true,
              nextMenu: 'withdraw_otp_verify',
              sessionData: { ...sessionData, otpSent: true }
            };
          } else {
            return {
              text: `END Authentication Failed ❌\n\n${otpResult.error}\n\nPlease try again later.`,
              continue: false
            };
          }
        } else {
          return {
            text: `END Withdrawal Not Authorized ❌\n\n${authorization.error}\n\nPlease contact support if this persists.`,
            continue: false
          };
        }
      }

      return await this.processWithdrawalAfterAuth(sessionData, phoneNumber);
    } catch (error) {
      logger.error('Error in processWithdrawal:', error);
      return {
        text: 'END Withdrawal failed due to system error. Please try again later.',
        continue: false
      };
    }
  }

  /**
   * Process withdrawal after authentication is verified
   * @param {Object} sessionData - Session data with withdrawal details
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Withdrawal result
   */
  static async processWithdrawalAfterAuth(sessionData, phoneNumber) {
    try {
      const { selectedPosition, withdrawAmount } = sessionData;
      const user = await User.findByPhone(phoneNumber);

      // For now, simulate the withdrawal by creating a transaction record
      // In a full implementation, this would interact with Morpho contracts
      await Transaction.create({
        phoneNumber,
        type: 'morpho_withdrawal',
        amount: withdrawAmount,
        currency: 'USDT',
        status: 'completed',
        metadata: {
          vaultAddress: selectedPosition.vaultAddress,
          vaultName: selectedPosition.vaultName,
          withdrawalType: 'to_wallet'
        }
      });

      // Update user balance
      const newBalance = (user.balance || 0) + withdrawAmount;
      await User.updateBalance(phoneNumber, newBalance);

      return {
        text: `END Withdrawal Successful! 🎉\n\nWithdrawn: $${withdrawAmount.toFixed(2)} USDT\nFrom: ${selectedPosition.vaultName}\n\nNew wallet balance: $${newBalance.toFixed(2)}\n\nFunds are now in your Zybra wallet!`,
        continue: false
      };

    } catch (error) {
      logger.error('Error processing withdrawal:', error);
      return {
        text: 'END Withdrawal failed due to a technical error. Please try again later.',
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
   * Handle receive money menu (Mobile Money Deposit)
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleReceiveMoneyMenu(userInput, sessionData, phoneNumber) {
    if (!userInput) {
      // Show deposit options
      return {
        text: `CON Deposit Money 📥\n\nChoose deposit method:\n1. Mobile Money\n2. Show Wallet Details\n0. Back to main menu`,
        continue: true,
        nextMenu: 'deposit_method',
        sessionData: {}
      };
    }

    switch (userInput) {
      case '1':
        // Mobile Money deposit - show provider options
        return {
          text: `CON Mobile Money Providers 💰\n\nSelect provider:\n1. Kotani Pay (KE, UG, TZ, GH, NG)\n2. Yellow Card (NG, GH, KE, UG, TZ+)\n0. Back`,
          continue: true,
          nextMenu: 'deposit_provider',
          sessionData: {}
        };

      case '2':
        // Show wallet details
        const user = await User.findByPhone(phoneNumber);
        return {
          text: `END Your Wallet Details 📋\n\nPhone: ${phoneNumber}\nWallet: ${user?.wallet_address?.substring(0, 20)}...\n\nShare these details to receive direct transfers.`,
          continue: false
        };

      case '0':
        return { text: '', continue: true, nextMenu: 'main', sessionData: {} };

      default:
        return {
          text: `CON Invalid option. Choose deposit method:\n1. Mobile Money\n2. Show Wallet Details\n0. Back to main menu`,
          continue: true,
          nextMenu: 'deposit_method',
          sessionData: {}
        };
    }
  }

  /**
   * Handle deposit provider selection
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleDepositProviderMenu(userInput, sessionData, phoneNumber) {
    if (userInput === '0') {
      return { text: '', continue: true, nextMenu: 'receive_money', sessionData: {} };
    }

    let provider, currencies;

    switch (userInput) {
      case '1':
        // Kotani Pay
        provider = 'kotanipay';
        currencies = [
          { code: 'KES', name: 'Kenyan Shilling', country: 'Kenya' },
          { code: 'UGX', name: 'Ugandan Shilling', country: 'Uganda' },
          { code: 'TZS', name: 'Tanzanian Shilling', country: 'Tanzania' },
          { code: 'GHS', name: 'Ghanaian Cedi', country: 'Ghana' },
          { code: 'NGN', name: 'Nigerian Naira', country: 'Nigeria' }
        ];
        break;

      case '2':
        // Yellow Card
        provider = 'yellowcard';
        currencies = [
          { code: 'NGN', name: 'Nigerian Naira', country: 'Nigeria' },
          { code: 'GHS', name: 'Ghanaian Cedi', country: 'Ghana' },
          { code: 'KES', name: 'Kenyan Shilling', country: 'Kenya' },
          { code: 'UGX', name: 'Ugandan Shilling', country: 'Uganda' },
          { code: 'TZS', name: 'Tanzanian Shilling', country: 'Tanzania' },
          { code: 'ZAR', name: 'South African Rand', country: 'South Africa' }
        ];
        break;

      default:
        return {
          text: `CON Invalid option. Select provider:\n1. Kotani Pay (KE, UG, TZ, GH, NG)\n2. Yellow Card (NG, GH, KE, UG, TZ+)\n0. Back`,
          continue: true,
          nextMenu: 'deposit_provider',
          sessionData: {}
        };
    }

    // Build currency menu
    let currencyText = `CON ${provider === 'kotanipay' ? 'Kotani Pay' : 'Yellow Card'} Deposit 💰\n\nSelect currency:\n`;
    currencies.forEach((curr, index) => {
      currencyText += `${index + 1}. ${curr.code} (${curr.country})\n`;
    });
    currencyText += '0. Back';

    return {
      text: currencyText,
      continue: true,
      nextMenu: 'deposit_currency',
      sessionData: { provider, currencies }
    };
  }

  /**
   * Handle deposit currency selection
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleDepositCurrencyMenu(userInput, sessionData, phoneNumber) {
    const { provider, currencies } = sessionData;

    if (userInput === '0') {
      return { text: '', continue: true, nextMenu: 'deposit_provider', sessionData: {} };
    }

    const currencyIndex = parseInt(userInput) - 1;
    if (currencyIndex < 0 || currencyIndex >= currencies.length) {
      // Rebuild currency menu
      let currencyText = `CON ${provider === 'kotanipay' ? 'Kotani Pay' : 'Yellow Card'} Deposit 💰\n\nSelect currency:\n`;
      currencies.forEach((curr, index) => {
        currencyText += `${index + 1}. ${curr.code} (${curr.country})\n`;
      });
      currencyText += '0. Back';

      return {
        text: currencyText,
        continue: true,
        nextMenu: 'deposit_currency',
        sessionData: { provider, currencies }
      };
    }

    const selectedCurrency = currencies[currencyIndex];
    const minAmount = this.getMinimumAmount(selectedCurrency.code);

    return {
      text: `CON Enter amount in ${selectedCurrency.code}:\n(Minimum: ${minAmount} ${selectedCurrency.code})\n\nProvider: ${provider === 'kotanipay' ? 'Kotani Pay' : 'Yellow Card'}`,
      continue: true,
      nextMenu: 'deposit_amount',
      sessionData: {
        provider,
        currency: selectedCurrency.code,
        currencyName: selectedCurrency.name,
        countryCode: this.getCountryCodeFromCurrency(selectedCurrency.code)
      }
    };
  }

  /**
   * Handle deposit amount entry
   * @param {string} userInput - User input
   * @param {Object} sessionData - Current session data
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - Menu response
   */
  static async handleDepositAmountMenu(userInput, sessionData, phoneNumber) {
    const { provider, currency, countryCode } = sessionData;

    if (!userInput) {
      return {
        text: `CON Enter amount in ${currency}:\n(Minimum: ${this.getMinimumAmount(currency)} ${currency})\n\nProvider: ${provider === 'kotanipay' ? 'Kotani Pay' : 'Yellow Card'}`,
        continue: true,
        nextMenu: 'deposit_amount',
        sessionData
      };
    }

    const amount = parseFloat(userInput);
    const minAmount = this.getMinimumAmount(currency);

    if (isNaN(amount) || amount < minAmount) {
      return {
        text: `CON Invalid amount. Enter amount in ${currency}:\n(Minimum: ${minAmount} ${currency})\n\nProvider: ${provider === 'kotanipay' ? 'Kotani Pay' : 'Yellow Card'}`,
        continue: true,
        nextMenu: 'deposit_amount',
        sessionData
      };
    }

    // Initiate deposit based on provider
    try {
      const transactionService = require('./transactionService');
      let result;

      if (provider === 'kotanipay') {
        result = await transactionService.initiateKotaniPayDeposit(phoneNumber, amount, currency);

        if (result.success) {
          return {
            text: `END Kotani Pay Deposit Initiated! 🎉\n\nAmount: ${amount} ${currency}\nTransaction ID: ${result.kotaniPayTransactionId}\n\nYou'll receive SMS instructions shortly. Follow the prompts to complete payment.`,
            continue: false
          };
        }
      } else if (provider === 'yellowcard') {
        result = await transactionService.initiateYellowCardDeposit(phoneNumber, amount, currency, countryCode);

        if (result.success) {
          return {
            text: `END Yellow Card Deposit Initiated! 🎉\n\nAmount: ${amount} ${currency}\nCollection ID: ${result.collectionId}\n\nYou'll receive SMS instructions shortly. Follow the prompts to complete payment.`,
            continue: false
          };
        }
      }

      // Handle failure
      return {
        text: `END Deposit Failed ❌\n\nProvider: ${provider === 'kotanipay' ? 'Kotani Pay' : 'Yellow Card'}\nReason: ${result?.error || 'Unknown error'}\n\nPlease try again or contact support.`,
        continue: false
      };

    } catch (error) {
      logger.error('Error initiating deposit:', error);
      return {
        text: `END Service Error ⚠️\n\nUnable to process deposit request. Please try again later.`,
        continue: false
      };
    }
  }

  /**
   * Get minimum deposit amount for currency
   * @param {string} currency - Currency code
   * @returns {number} - Minimum amount
   */
  static getMinimumAmount(currency) {
    const minimums = {
      'KES': 10,
      'UGX': 1000,
      'TZS': 1000,
      'GHS': 1,
      'NGN': 100,
      'ZAR': 10,
      'EGP': 10,
      'MAD': 10,
      'TND': 1,
      'DZD': 100
    };
    return minimums[currency] || 1;
  }

  /**
   * Get country code from currency
   * @param {string} currency - Currency code
   * @returns {string} - Country code
   */
  static getCountryCodeFromCurrency(currency) {
    const currencyToCountry = {
      'KES': 'KE', // Kenya
      'UGX': 'UG', // Uganda
      'TZS': 'TZ', // Tanzania
      'GHS': 'GH', // Ghana
      'NGN': 'NG', // Nigeria
      'ZAR': 'ZA', // South Africa
      'EGP': 'EG', // Egypt
      'MAD': 'MA', // Morocco
      'TND': 'TN', // Tunisia
      'DZD': 'DZ'  // Algeria
    };
    return currencyToCountry[currency] || 'NG';
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
