const { Pool } = require('pg');
const logger = require('../utils/logger');

// Database connection pool
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'zybra_sms',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
  logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error('PostgreSQL connection error:', err);
});

// User model
class User {
  static async create(userData) {
    const { phoneNumber, walletAddress, createdAt = new Date() } = userData;
    const query = `
      INSERT INTO users (phone_number, wallet_address, created_at, updated_at)
      VALUES ($1, $2, $3, $3)
      RETURNING *
    `;
    const values = [phoneNumber, walletAddress, createdAt];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  static async findByPhone(phoneNumber) {
    const query = 'SELECT * FROM users WHERE phone_number = $1';

    try {
      const result = await pool.query(query, [phoneNumber]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by phone:', error);
      throw error;
    }
  }

  static async findById(id) {
    const query = 'SELECT * FROM users WHERE id = $1';

    try {
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by ID:', error);
      throw error;
    }
  }

  static async updateBalance(phoneNumber, balance) {
    const query = `
      UPDATE users
      SET balance = $1, updated_at = NOW()
      WHERE phone_number = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [balance, phoneNumber]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating user balance:', error);
      throw error;
    }
  }
}

// Transaction model
class Transaction {
  static async create(transactionData) {
    const {
      phoneNumber,
      type,
      amount,
      currency,
      status = 'pending',
      txHash,
      metadata = {},
      createdAt = new Date()
    } = transactionData;

    const query = `
      INSERT INTO transactions (phone_number, type, amount, currency, status, tx_hash, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
      RETURNING *
    `;
    const values = [phoneNumber, type, amount, currency, status, txHash, JSON.stringify(metadata), createdAt];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating transaction:', error);
      throw error;
    }
  }

  static async findByPhone(phoneNumber, limit = 10) {
    const query = `
      SELECT * FROM transactions
      WHERE phone_number = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    try {
      const result = await pool.query(query, [phoneNumber, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error finding transactions by phone:', error);
      throw error;
    }
  }

  static async updateStatus(id, status, txHash = null) {
    const query = `
      UPDATE transactions
      SET status = $1, tx_hash = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [status, txHash, id]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating transaction status:', error);
      throw error;
    }
  }

  static async findById(id) {
    const query = 'SELECT * FROM transactions WHERE id = $1';

    try {
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding transaction by ID:', error);
      throw error;
    }
  }
}

// USSD Session model
class USSDSession {
  static async create(sessionData) {
    const {
      sessionId,
      phoneNumber,
      currentMenu = 'main',
      sessionData: data = {},
      createdAt = new Date()
    } = sessionData;

    const query = `
      INSERT INTO ussd_sessions (session_id, phone_number, current_menu, session_data, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5)
      RETURNING *
    `;
    const values = [sessionId, phoneNumber, currentMenu, JSON.stringify(data), createdAt];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating USSD session:', error);
      throw error;
    }
  }

  static async findBySessionId(sessionId) {
    const query = 'SELECT * FROM ussd_sessions WHERE session_id = $1';

    try {
      const result = await pool.query(query, [sessionId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding USSD session:', error);
      throw error;
    }
  }

  static async update(sessionId, updateData) {
    const { currentMenu, sessionData } = updateData;
    const query = `
      UPDATE ussd_sessions
      SET current_menu = $1, session_data = $2, updated_at = NOW()
      WHERE session_id = $3
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [currentMenu, JSON.stringify(sessionData), sessionId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating USSD session:', error);
      throw error;
    }
  }

  static async delete(sessionId) {
    const query = 'DELETE FROM ussd_sessions WHERE session_id = $1';

    try {
      await pool.query(query, [sessionId]);
      return true;
    } catch (error) {
      logger.error('Error deleting USSD session:', error);
      throw error;
    }
  }
}

<<<<<<< HEAD
=======
// Morpho Investment model
class MorphoInvestment {
  static async create(investmentData) {
    const {
      phoneNumber,
      vaultAddress,
      vaultName,
      vaultSymbol,
      assetSymbol,
      shares,
      assets,
      initialInvestment,
      currentApy,
      metadata = {},
      createdAt = new Date()
    } = investmentData;

    const query = `
      INSERT INTO morpho_investments (
        phone_number, vault_address, vault_name, vault_symbol, asset_symbol,
        shares, assets, initial_investment, current_apy, metadata,
        investment_date, last_updated, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $11, $11)
      RETURNING *
    `;
    const values = [
      phoneNumber, vaultAddress, vaultName, vaultSymbol, assetSymbol,
      shares, assets, initialInvestment, currentApy, JSON.stringify(metadata),
      createdAt
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating Morpho investment:', error);
      throw error;
    }
  }

  static async findByPhone(phoneNumber, status = 'active') {
    const query = `
      SELECT * FROM morpho_investments
      WHERE phone_number = $1 AND status = $2
      ORDER BY investment_date DESC
    `;

    try {
      const result = await pool.query(query, [phoneNumber, status]);
      return result.rows;
    } catch (error) {
      logger.error('Error finding Morpho investments by phone:', error);
      throw error;
    }
  }

  static async updatePosition(id, updateData) {
    const { shares, assets, currentApy } = updateData;
    const query = `
      UPDATE morpho_investments
      SET shares = $1, assets = $2, current_apy = $3, last_updated = NOW(), updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [shares, assets, currentApy, id]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating Morpho investment position:', error);
      throw error;
    }
  }

  static async updateStatus(id, status) {
    const query = `
      UPDATE morpho_investments
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [status, id]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating Morpho investment status:', error);
      throw error;
    }
  }

  static async findById(id) {
    const query = 'SELECT * FROM morpho_investments WHERE id = $1';

    try {
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding Morpho investment by ID:', error);
      throw error;
    }
  }

  static async getTotalInvested(phoneNumber) {
    const query = `
      SELECT COALESCE(SUM(assets), 0) as total_invested
      FROM morpho_investments
      WHERE phone_number = $1 AND status = 'active'
    `;

    try {
      const result = await pool.query(query, [phoneNumber]);
      return parseFloat(result.rows[0].total_invested) || 0;
    } catch (error) {
      logger.error('Error getting total invested amount:', error);
      throw error;
    }
  }
}

// YellowCard Transaction model
class YellowCardTransaction {
  static async create(transactionData) {
    const {
      phoneNumber,
      yellowcardId,
      transactionType,
      fiatAmount,
      fiatCurrency,
      cryptoAmount,
      cryptoCurrency,
      exchangeRate,
      paymentMethod,
      countryCode,
      status = 'pending',
      yellowcardStatus,
      webhookData = {},
      customerData = {},
      createdAt = new Date()
    } = transactionData;

    const query = `
      INSERT INTO yellowcard_transactions (
        phone_number, yellowcard_id, transaction_type, fiat_amount, fiat_currency,
        crypto_amount, crypto_currency, exchange_rate, payment_method, country_code,
        status, yellowcard_status, webhook_data, customer_data, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
      RETURNING *
    `;
    const values = [
      phoneNumber, yellowcardId, transactionType, fiatAmount, fiatCurrency,
      cryptoAmount, cryptoCurrency, exchangeRate, paymentMethod, countryCode,
      status, yellowcardStatus, JSON.stringify(webhookData), JSON.stringify(customerData), createdAt
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating YellowCard transaction:', error);
      throw error;
    }
  }

  static async findByYellowCardId(yellowcardId) {
    const query = 'SELECT * FROM yellowcard_transactions WHERE yellowcard_id = $1';

    try {
      const result = await pool.query(query, [yellowcardId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding YellowCard transaction by ID:', error);
      throw error;
    }
  }

  static async findByPhone(phoneNumber, limit = 10) {
    const query = `
      SELECT * FROM yellowcard_transactions
      WHERE phone_number = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    try {
      const result = await pool.query(query, [phoneNumber, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error finding YellowCard transactions by phone:', error);
      throw error;
    }
  }

  static async updateStatus(yellowcardId, status, yellowcardStatus = null, webhookData = null) {
    const query = `
      UPDATE yellowcard_transactions
      SET status = $1, yellowcard_status = $2, webhook_data = $3, updated_at = NOW()
      WHERE yellowcard_id = $4
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [
        status,
        yellowcardStatus,
        webhookData ? JSON.stringify(webhookData) : null,
        yellowcardId
      ]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating YellowCard transaction status:', error);
      throw error;
    }
  }
}

>>>>>>> e493750ee6533facd8eb627b1ad0498cb277d1f1
module.exports = {
  pool,
  User,
  Transaction,
<<<<<<< HEAD
  USSDSession
=======
  USSDSession,
  MorphoInvestment,
  YellowCardTransaction
>>>>>>> e493750ee6533facd8eb627b1ad0498cb277d1f1
};
