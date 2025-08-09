# Controllers Documentation

This directory contains the controller classes that handle HTTP requests and responses for the Zybra SMS/USSD system. Controllers follow the MVC pattern and are responsible for:

- Handling HTTP requests and responses
- Input validation (using express-validator)
- Calling appropriate service methods
- Formatting responses
- Error handling

## Architecture Overview

```
Routes → Controllers → Services → Models/Database
```

- **Routes**: Define endpoints and middleware
- **Controllers**: Handle request/response logic
- **Services**: Contain business logic
- **Models**: Database interactions

## Controller Classes

### 1. SMSController (`smsController.js`)

Handles all SMS-related operations including sending, receiving, and processing SMS messages.

#### Methods:

- `handleIncomingSMS(req, res)` - Process incoming SMS from Africa's Talking
- `sendSMS(req, res)` - Send SMS manually
- `sendBalanceNotification(req, res)` - Send balance via SMS
- `sendOTP(req, res)` - Generate and send OTP
- `verifyOTP(req, res)` - Verify OTP code
- `sendTransactionConfirmation(req, res)` - Send transaction confirmation SMS
- `sendWelcomeSMS(req, res)` - Send welcome message to new users
- `handleDeliveryReport(req, res)` - Process SMS delivery reports
- `getSMSStats(req, res)` - Get SMS statistics

#### Example Usage:

```javascript
// Send SMS
POST /api/sms/send
{
  "phoneNumber": "254712345678",
  "message": "Hello from Zybra!",
  "from": "ZYBRA"
}

// Send OTP
POST /api/sms/otp
{
  "phoneNumber": "254712345678"
}
```

### 2. USSDController (`ussdController.js`)

Manages USSD session handling and menu interactions.

#### Methods:

- `handleUSSDRequest(req, res)` - Process USSD requests from Africa's Talking
- `handleSessionTimeout(req, res)` - Handle session timeouts
- `getActiveSessions(req, res)` - Get active USSD sessions
- `clearExpiredSessions(req, res)` - Clean up expired sessions
- `getUSSDStats(req, res)` - Get USSD usage statistics
- `testUSSDFlow(req, res)` - Test USSD menu flows
- `getSessionDetails(req, res)` - Get specific session details
- `endSession(req, res)` - Force end a session
- `getUserSessions(req, res)` - Get user's active sessions

#### Example Usage:

```javascript
// USSD Request (from Africa's Talking)
POST /api/ussd
{
  "sessionId": "ATUid_12345",
  "serviceCode": "*384*96#",
  "phoneNumber": "254712345678",
  "text": "1*2*100"
}

// Test USSD Flow
POST /api/ussd/test
{
  "phoneNumber": "254712345678",
  "menuPath": ["1", "2", "100", "1"]
}
```

### 3. TransactionController (`transactionController.js`)

Handles all transaction-related operations including transfers, deposits, and withdrawals.

#### Methods:

- `processTransfer(req, res)` - Process P2P transfers
- `processDeposit(req, res)` - Process mobile money deposits
- `processWithdrawal(req, res)` - Process withdrawals
- `getTransactionHistory(req, res)` - Get user transaction history
- `getTransactionDetails(req, res)` - Get specific transaction details
- `getTransactionStats(req, res)` - Get transaction statistics
- `retryTransaction(req, res)` - Retry failed transactions
- `cancelTransaction(req, res)` - Cancel pending transactions
- `getUserBalance(req, res)` - Get user balance

#### Example Usage:

```javascript
// Process Transfer
POST /api/transactions/transfer
{
  "fromPhone": "254712345678",
  "toPhone": "254787654321",
  "amount": 100,
  "currency": "ZrUSD"
}

// Get Transaction History
GET /api/transactions/history/254712345678?limit=10&offset=0
```

### 4. WebhookController (`webhookController.js`)

Processes webhooks from external services like mobile money providers and blockchain networks.

#### Methods:

- `handleAirtelWebhook(req, res)` - Process Airtel Money webhooks
- `handleYellowCardWebhook(req, res)` - Process Yellow Card webhooks
- `handleBlockchainWebhook(req, res)` - Process blockchain confirmations
- `handleAfricasTalkingDelivery(req, res)` - Process SMS delivery reports
- `handleTestWebhook(req, res)` - Generic test webhook handler
- `handleWebhookVerification(req, res)` - Webhook verification endpoint
- `getWebhookStats(req, res)` - Get webhook statistics

#### Example Usage:

```javascript
// Airtel Webhook (from Airtel Money)
POST /api/webhooks/airtel
{
  "transaction_id": "TXN123456",
  "transaction_status": "SUCCESS",
  "transaction_amount": "1000",
  "transaction_currency": "MWK",
  "msisdn": "265888123456",
  "reference_id": "REF123"
}
```

## Validation

All controllers use express-validator for input validation. Validation rules are defined in `middleware/validation.js` and applied to routes.

### Validation Features:

- **Phone Number Validation**: Ensures proper mobile phone format
- **Amount Validation**: Validates positive numbers with limits
- **Currency Validation**: Ensures supported currencies
- **Required Fields**: Validates required parameters
- **Data Types**: Ensures correct data types
- **Custom Validation**: Business logic validation

### Example Validation:

```javascript
// In validation.js
const transferValidation = [
  body('fromPhone').isMobilePhone().withMessage('Invalid from phone'),
  body('toPhone').isMobilePhone().withMessage('Invalid to phone'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive')
];

// In routes
router.post('/transfer', 
  validate(transferValidation),
  TransactionController.processTransfer
);
```

## Error Handling

Controllers implement consistent error handling:

### Error Response Format:

```javascript
{
  "success": false,
  "error": "Error message",
  "details": [...] // For validation errors
}
```

### Success Response Format:

```javascript
{
  "success": true,
  "message": "Operation completed",
  "data": {...}
}
```

## Best Practices

### 1. Controller Structure

```javascript
class ExampleController {
  static async methodName(req, res) {
    try {
      // 1. Validate input (handled by middleware)
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      // 2. Extract data from request
      const { param1, param2 } = req.body;

      // 3. Call service method
      const result = await SomeService.doSomething(param1, param2);

      // 4. Return response
      res.status(200).json({
        success: true,
        message: 'Operation successful',
        data: result
      });

    } catch (error) {
      logger.error('Error in methodName:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}
```

### 2. Validation Guidelines

- Always validate input parameters
- Use appropriate validation rules
- Provide clear error messages
- Sanitize input data
- Check business logic constraints

### 3. Response Guidelines

- Use consistent response format
- Include appropriate HTTP status codes
- Provide meaningful error messages
- Include relevant data in responses
- Log errors for debugging

### 4. Security Considerations

- Validate all inputs
- Sanitize data before processing
- Use rate limiting
- Implement proper authentication
- Log security events

## Testing Controllers

Controllers can be tested using supertest:

```javascript
const request = require('supertest');
const app = require('../app');

describe('SMS Controller', () => {
  test('should send SMS successfully', async () => {
    const response = await request(app)
      .post('/api/sms/send')
      .send({
        phoneNumber: '254712345678',
        message: 'Test message'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
```

## Adding New Controllers

1. Create new controller file in `controllers/` directory
2. Implement controller class with static methods
3. Add validation rules in `middleware/validation.js`
4. Create routes in `routes/` directory
5. Add tests for the controller
6. Update this documentation

## Dependencies

Controllers depend on:

- **express**: Web framework
- **express-validator**: Input validation
- **Services**: Business logic layer
- **Models**: Database layer
- **Middleware**: Authentication, rate limiting, etc.
- **Utils**: Logging, helpers, etc.

## File Structure

```
controllers/
├── README.md              # This documentation
├── smsController.js       # SMS operations
├── ussdController.js      # USSD operations
├── transactionController.js # Transaction operations
└── webhookController.js   # Webhook handling
```
