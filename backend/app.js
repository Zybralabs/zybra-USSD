const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const dotenv = require('dotenv');

// Import routes
const smsRoutes = require('./src/routes/smsRoutes');
const ussdRoutes = require('./src/routes/ussdRoutes');
const webhookRoutes = require('./src/routes/webhookRoutes');
const transactionRoutes = require('./src/routes/transactionRoutes');
const kotaniPayRoutes = require('./src/routes/kotaniPayRoutes');
const yellowCardRoutes = require('./src/routes/yellowCardRoutes');

// Import middleware
const errorHandler = require('./src/middleware/errorHandler');
const authMiddleware = require('./src/middleware/authMiddleware');
const { handleValidationError } = require('./src/middleware/validation');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Zybra SMS/USSD Service'
  });
});

// API routes
app.use('/api/sms', smsRoutes);
app.use('/api/ussd', ussdRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/transactions', authMiddleware, transactionRoutes);
app.use('/api/kotanipay', kotaniPayRoutes);
app.use('/api/yellowcard', yellowCardRoutes);

// Validation error handling middleware
app.use(handleValidationError);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Zybra SMS/USSD Service running on port ${PORT}`);
  console.log(`📱 SMS endpoint: http://localhost:${PORT}/api/sms`);
  console.log(`📞 USSD endpoint: http://localhost:${PORT}/api/ussd`);
  console.log(`🔗 Webhooks endpoint: http://localhost:${PORT}/api/webhooks`);
  console.log(`💰 Kotani Pay endpoint: http://localhost:${PORT}/api/kotanipay`);
  console.log(`💳 Yellow Card endpoint: http://localhost:${PORT}/api/yellowcard`);
});

module.exports = app;
