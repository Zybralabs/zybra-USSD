const redis = require('redis');
const logger = require('../utils/logger');

// Create Redis client
const client = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      logger.error('Redis server connection refused');
      return new Error('Redis server connection refused');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      logger.error('Redis retry time exhausted');
      return new Error('Retry time exhausted');
    }
    if (options.attempt > 10) {
      logger.error('Redis connection attempts exceeded');
      return undefined;
    }
    // Reconnect after
    return Math.min(options.attempt * 100, 3000);
  }
});

// Redis event handlers
client.on('connect', () => {
  logger.info('Connected to Redis server');
});

client.on('error', (err) => {
  logger.error('Redis client error:', err);
});

client.on('ready', () => {
  logger.info('Redis client ready');
});

client.on('reconnecting', () => {
  logger.info('Redis client reconnecting');
});

// Helper functions for common operations
const redisHelpers = {
  // Set with expiration
  async setex(key, seconds, value) {
    try {
      return await client.setex(key, seconds, JSON.stringify(value));
    } catch (error) {
      logger.error('Redis setex error:', error);
      throw error;
    }
  },

  // Get and parse JSON
  async get(key) {
    try {
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis get error:', error);
      throw error;
    }
  },

  // Set without expiration
  async set(key, value) {
    try {
      return await client.set(key, JSON.stringify(value));
    } catch (error) {
      logger.error('Redis set error:', error);
      throw error;
    }
  },

  // Delete key
  async del(key) {
    try {
      return await client.del(key);
    } catch (error) {
      logger.error('Redis del error:', error);
      throw error;
    }
  },

  // Check if key exists
  async exists(key) {
    try {
      return await client.exists(key);
    } catch (error) {
      logger.error('Redis exists error:', error);
      throw error;
    }
  },

  // Increment counter
  async incr(key) {
    try {
      return await client.incr(key);
    } catch (error) {
      logger.error('Redis incr error:', error);
      throw error;
    }
  },

  // Set expiration
  async expire(key, seconds) {
    try {
      return await client.expire(key, seconds);
    } catch (error) {
      logger.error('Redis expire error:', error);
      throw error;
    }
  },

  // Get multiple keys
  async mget(keys) {
    try {
      const values = await client.mget(keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      logger.error('Redis mget error:', error);
      throw error;
    }
  },

  // Hash operations
  async hset(key, field, value) {
    try {
      return await client.hset(key, field, JSON.stringify(value));
    } catch (error) {
      logger.error('Redis hset error:', error);
      throw error;
    }
  },

  async hget(key, field) {
    try {
      const value = await client.hget(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis hget error:', error);
      throw error;
    }
  },

  async hgetall(key) {
    try {
      const hash = await client.hgetall(key);
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        result[field] = JSON.parse(value);
      }
      return result;
    } catch (error) {
      logger.error('Redis hgetall error:', error);
      throw error;
    }
  },

  // Multi/transaction support
  multi() {
    return client.multi();
  }
};

module.exports = {
  client,
  ...redisHelpers
};
