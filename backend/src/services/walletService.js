const { ethers } = require('ethers');
const logger = require('../utils/logger');
const { User } = require('../db/models');

// ZrUSD Contract ABI (simplified)
const ZrUSD_ABI = [
  "function mint(address to, uint256 assets) external",
  "function burn(address from, uint256 assets) external",
  "function balanceOf(address account) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function totalSupply() external view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

class WalletService {
  constructor() {
    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(
      process.env.RPC_URL || 'http://localhost:8545'
    );
    
    // Master wallet for minting/burning
    this.masterWallet = new ethers.Wallet(
      process.env.MASTER_PRIVATE_KEY || '0x' + '0'.repeat(64),
      this.provider
    );
    
    // ZrUSD contract
    this.zrUSDContract = new ethers.Contract(
      process.env.ZRUSD_CONTRACT_ADDRESS || '0x' + '0'.repeat(40),
      ZrUSD_ABI,
      this.masterWallet
    );
  }

  /**
   * Create a new wallet for a user
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<Object>} - User object with wallet
   */
  async createUserWallet(phoneNumber) {
    try {
      // Check if user already exists
      let user = await User.findByPhone(phoneNumber);
      if (user) {
        return user;
      }

      // Generate new wallet
      const wallet = ethers.Wallet.createRandom();
      
      // Create user in database
      user = await User.create({
        phoneNumber,
        walletAddress: wallet.address,
        createdAt: new Date()
      });

      // Store encrypted private key (in production, use proper key management)
      await this.storePrivateKey(phoneNumber, wallet.privateKey);

      logger.info(`Created wallet for ${phoneNumber}: ${wallet.address}`);
      return user;
    } catch (error) {
      logger.error('Error creating user wallet:', error);
      throw error;
    }
  }

  /**
   * Get user's wallet
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<ethers.Wallet>} - User's wallet
   */
  async getUserWallet(phoneNumber) {
    try {
      const user = await User.findByPhone(phoneNumber);
      if (!user) {
        throw new Error('User not found');
      }

      const privateKey = await this.getPrivateKey(phoneNumber);
      return new ethers.Wallet(privateKey, this.provider);
    } catch (error) {
      logger.error('Error getting user wallet:', error);
      throw error;
    }
  }

  /**
   * Get ZrUSD balance for a user
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<string>} - Balance in ZrUSD
   */
  async getZrUSDBalance(phoneNumber) {
    try {
      const user = await User.findByPhone(phoneNumber);
      if (!user) {
        return '0';
      }

      const balance = await this.zrUSDContract.balanceOf(user.wallet_address);
      return ethers.formatEther(balance);
    } catch (error) {
      logger.error('Error getting ZrUSD balance:', error);
      return '0';
    }
  }

  /**
   * Mint ZrUSD tokens to user's wallet
   * @param {string} phoneNumber - User's phone number
   * @param {string} amount - Amount to mint
   * @returns {Promise<Object>} - Transaction result
   */
  async mintZrUSD(phoneNumber, amount) {
    try {
      const user = await User.findByPhone(phoneNumber);
      if (!user) {
        throw new Error('User not found');
      }

      const amountWei = ethers.parseEther(amount.toString());
      
      // Mint tokens using master wallet
      const tx = await this.zrUSDContract.mint(user.wallet_address, amountWei);
      await tx.wait();

      // Update user balance in database
      const newBalance = await this.getZrUSDBalance(phoneNumber);
      await User.updateBalance(phoneNumber, newBalance);

      logger.info(`Minted ${amount} ZrUSD to ${phoneNumber} (${user.wallet_address})`);
      
      return {
        success: true,
        txHash: tx.hash,
        amount,
        newBalance
      };
    } catch (error) {
      logger.error('Error minting ZrUSD:', error);
      throw error;
    }
  }

  /**
   * Burn ZrUSD tokens from user's wallet
   * @param {string} phoneNumber - User's phone number
   * @param {string} amount - Amount to burn
   * @returns {Promise<Object>} - Transaction result
   */
  async burnZrUSD(phoneNumber, amount) {
    try {
      const user = await User.findByPhone(phoneNumber);
      if (!user) {
        throw new Error('User not found');
      }

      const amountWei = ethers.parseEther(amount.toString());
      
      // Burn tokens using master wallet
      const tx = await this.zrUSDContract.burn(user.wallet_address, amountWei);
      await tx.wait();

      // Update user balance in database
      const newBalance = await this.getZrUSDBalance(phoneNumber);
      await User.updateBalance(phoneNumber, newBalance);

      logger.info(`Burned ${amount} ZrUSD from ${phoneNumber} (${user.wallet_address})`);
      
      return {
        success: true,
        txHash: tx.hash,
        amount,
        newBalance
      };
    } catch (error) {
      logger.error('Error burning ZrUSD:', error);
      throw error;
    }
  }

  /**
   * Transfer ZrUSD between users
   * @param {string} fromPhone - Sender's phone number
   * @param {string} toPhone - Recipient's phone number
   * @param {string} amount - Amount to transfer
   * @returns {Promise<Object>} - Transaction result
   */
  async transferZrUSD(fromPhone, toPhone, amount) {
    try {
      const fromUser = await User.findByPhone(fromPhone);
      const toUser = await User.findByPhone(toPhone);
      
      if (!fromUser || !toUser) {
        throw new Error('User not found');
      }

      // Get sender's wallet
      const senderWallet = await this.getUserWallet(fromPhone);
      const zrUSDWithSigner = this.zrUSDContract.connect(senderWallet);

      const amountWei = ethers.parseEther(amount.toString());
      
      // Transfer tokens
      const tx = await zrUSDWithSigner.transfer(toUser.wallet_address, amountWei);
      await tx.wait();

      // Update balances in database
      const fromBalance = await this.getZrUSDBalance(fromPhone);
      const toBalance = await this.getZrUSDBalance(toPhone);
      
      await User.updateBalance(fromPhone, fromBalance);
      await User.updateBalance(toPhone, toBalance);

      logger.info(`Transferred ${amount} ZrUSD from ${fromPhone} to ${toPhone}`);
      
      return {
        success: true,
        txHash: tx.hash,
        amount,
        fromBalance,
        toBalance
      };
    } catch (error) {
      logger.error('Error transferring ZrUSD:', error);
      throw error;
    }
  }

  /**
   * Store encrypted private key (simplified - use proper key management in production)
   * @param {string} phoneNumber - User's phone number
   * @param {string} privateKey - Private key to store
   */
  async storePrivateKey(phoneNumber, privateKey) {
    try {
      const redisClient = require('../db/redisClient');
      
      // In production, encrypt the private key before storing
      const encryptedKey = this.encryptPrivateKey(privateKey);
      await redisClient.set(`wallet:${phoneNumber}`, encryptedKey);
    } catch (error) {
      logger.error('Error storing private key:', error);
      throw error;
    }
  }

  /**
   * Get private key for user
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<string>} - Private key
   */
  async getPrivateKey(phoneNumber) {
    try {
      const redisClient = require('../db/redisClient');
      
      const encryptedKey = await redisClient.get(`wallet:${phoneNumber}`);
      if (!encryptedKey) {
        throw new Error('Private key not found');
      }

      return this.decryptPrivateKey(encryptedKey);
    } catch (error) {
      logger.error('Error getting private key:', error);
      throw error;
    }
  }

  /**
   * Encrypt private key (simplified - use proper encryption in production)
   * @param {string} privateKey - Private key to encrypt
   * @returns {string} - Encrypted private key
   */
  encryptPrivateKey(privateKey) {
    // In production, use proper encryption like AES-256
    // This is a simplified example
    const crypto = require('crypto');
    const cipher = crypto.createCipher('aes192', process.env.ENCRYPTION_KEY || 'default-key');
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  /**
   * Decrypt private key (simplified - use proper decryption in production)
   * @param {string} encryptedKey - Encrypted private key
   * @returns {string} - Decrypted private key
   */
  decryptPrivateKey(encryptedKey) {
    // In production, use proper decryption like AES-256
    // This is a simplified example
    const crypto = require('crypto');
    const decipher = crypto.createDecipher('aes192', process.env.ENCRYPTION_KEY || 'default-key');
    let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Get transaction receipt
   * @param {string} txHash - Transaction hash
   * @returns {Promise<Object>} - Transaction receipt
   */
  async getTransactionReceipt(txHash) {
    try {
      return await this.provider.getTransactionReceipt(txHash);
    } catch (error) {
      logger.error('Error getting transaction receipt:', error);
      throw error;
    }
  }
}

module.exports = new WalletService();
