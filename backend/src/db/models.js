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

module.exports = {
  pool,
  User,
  Transaction,
  USSDSession
};
