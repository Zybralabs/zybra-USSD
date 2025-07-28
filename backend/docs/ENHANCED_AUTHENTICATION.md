# Enhanced Authentication System

## Overview

The enhanced authentication system provides robust security for the Zybra USSD-based DeFi platform, ensuring that only authorized users can access their shadow wallets and perform sensitive operations like investments and withdrawals.

## Key Features

### 1. Enhanced Phone Number Validation
- Validates phone numbers against African country patterns
- Supports Kenya (254), Tanzania (255), Uganda (256), Nigeria (234), Ghana (233), Zambia (260), and Malawi (265)
- Normalizes phone numbers to consistent format
- Returns country information for localization

### 2. Secure OTP System
- Cryptographically secure OTP generation using `crypto.randomInt()`
- OTP hashing with SHA-256 for additional security
- Purpose-specific OTPs (authentication, transaction, investment, withdrawal)
- Rate limiting to prevent abuse (max 3 OTP requests per 15 minutes)
- Attempt limiting (max 3 verification attempts per OTP)
- Configurable expiry times (default 5 minutes)

### 3. Session Management
- Secure session tokens using 32-byte random hex strings
- Purpose-specific sessions (USSD, API, etc.)
- Configurable session expiry (default 30 minutes)
- Session validation and cleanup
- Phone number to session mapping for quick lookups

### 4. Wallet Operation Authorization
- Multi-level authorization checks for sensitive operations
- Recent authentication requirement for high-value operations (10 minutes)
- Operation-specific authorization (transfer, invest, withdraw, balance)
- User existence and wallet validation

### 5. Progressive Rate Limiting
- 5+ requests: 15-minute block
- 10+ requests: 1-hour block  
- 20+ requests: 24-hour block with support contact requirement
- Per-phone number tracking
- Automatic expiry and cleanup

## API Endpoints

### Generate OTP
```
POST /api/auth/generate-otp
Content-Type: application/json

{
  "phoneNumber": "254712345678",
  "purpose": "authentication",
  "expiryMinutes": 5
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresIn": 300
}
```

### Verify OTP
```
POST /api/auth/verify-otp
Content-Type: application/json

{
  "phoneNumber": "254712345678",
  "otp": "123456",
  "purpose": "authentication"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "sessionToken": "abc123...",
  "expiresIn": 1800
}
```

### Create Secure Session
```
POST /api/auth/create-session
Content-Type: application/json

{
  "phoneNumber": "254712345678",
  "purpose": "api",
  "expiryMinutes": 30
}
```

### Validate Session
```
POST /api/auth/validate-session
Content-Type: application/json

{
  "sessionToken": "abc123..."
}
```

### Authorize Wallet Operation
```
POST /api/auth/authorize-wallet-operation
Content-Type: application/json

{
  "phoneNumber": "254712345678",
  "operation": "invest"
}
```

## USSD Integration

### Investment Flow with Authentication
1. User selects investment option
2. User chooses vault and amount
3. System checks authorization
4. If authentication required:
   - OTP sent via SMS
   - User enters OTP in USSD menu
   - System verifies OTP
   - Investment proceeds if valid
5. Investment executed with authenticated session

### Withdrawal Flow with Authentication
1. User selects withdrawal option
2. User chooses position and amount
3. System checks authorization
4. If authentication required:
   - OTP sent via SMS
   - User enters OTP in USSD menu
   - System verifies OTP
   - Withdrawal proceeds if valid
5. Withdrawal executed with authenticated session

## Security Measures

### OTP Security
- Cryptographically secure random generation
- SHA-256 hashing with secret salt
- Purpose-specific validation
- Automatic cleanup after verification
- Rate limiting and attempt limiting

### Session Security
- 32-byte random session tokens
- Purpose-specific sessions
- Automatic expiry
- Server-side validation
- Secure cleanup on logout

### Rate Limiting
- Progressive delays for repeated requests
- Per-phone number tracking
- Automatic expiry and cleanup
- Support escalation for persistent issues

### Authorization Levels
- **Basic**: Phone number validation
- **Session**: Valid secure session required
- **Recent**: Recent authentication (within 10 minutes) for sensitive operations
- **OTP**: Fresh OTP verification for critical operations

## Configuration

### Environment Variables
```bash
# OTP Security
OTP_SECRET=your-secret-key-here

# Session Configuration
SESSION_EXPIRY_MINUTES=30
OTP_EXPIRY_MINUTES=5

# Rate Limiting
MAX_OTP_REQUESTS_PER_HOUR=3
MAX_FAILED_ATTEMPTS=3
```

### Redis Keys
- `otp:{phoneNumber}:{purpose}` - OTP data
- `otp_rate_limit:{phoneNumber}` - OTP request rate limiting
- `secure_session:{sessionToken}` - Session data
- `phone_session:{phoneNumber}:{purpose}` - Phone to session mapping
- `recent_auth:{phoneNumber}` - Recent authentication marker
- `enhanced_rate_limit:{phoneNumber}` - Enhanced rate limiting

## Error Handling

### Common Error Responses
- `400 Bad Request` - Invalid input or expired OTP
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Operation not authorized
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - System error

### Error Messages
- User-friendly messages for USSD interface
- Detailed error information for API responses
- Security audit logging for failed attempts
- Automatic cleanup of expired data

## Monitoring and Logging

### Security Events Logged
- OTP generation and verification attempts
- Session creation and validation
- Failed authentication attempts
- Rate limit violations
- Wallet operation authorizations

### Metrics to Monitor
- OTP success/failure rates
- Session creation and expiry patterns
- Rate limiting triggers
- Authentication latency
- Error rates by endpoint

## Best Practices

### For Developers
1. Always validate phone numbers using `AuthService.validatePhoneNumber()`
2. Use appropriate OTP purposes for different operations
3. Implement proper error handling for all authentication flows
4. Log security events for audit trails
5. Use session tokens for API authentication

### For Operations
1. Monitor rate limiting patterns for abuse detection
2. Set up alerts for high failure rates
3. Regularly review security logs
4. Implement proper backup and recovery for Redis data
5. Keep OTP secrets secure and rotate regularly

## Migration Guide

### From Basic to Enhanced Authentication
1. Update phone number validation calls
2. Replace simple OTP with secure OTP service
3. Implement session management
4. Add authorization checks to sensitive operations
5. Update USSD flows with authentication steps
6. Test all authentication flows thoroughly

### Database Updates
No database schema changes required - all authentication data stored in Redis for performance and automatic expiry.

## Testing

### Running Tests
```bash
# Run all authentication tests
npm test -- tests/services/authService.test.js

# Run specific test suite
npm test -- --testNamePattern="generateSecureOTP"

# Run with coverage
npm test -- --coverage tests/services/authService.test.js
```

### Test Coverage
- Phone number validation (all supported countries)
- OTP generation and verification (all purposes)
- Session management (creation, validation, expiry)
- Wallet operation authorization (all levels)
- Rate limiting (progressive delays)
- Error handling (all error scenarios)
- Security measures (HMAC, hashing, cleanup)

### Integration Testing
```bash
# Test complete authentication flow
curl -X POST http://localhost:3000/api/auth/generate-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "254712345678", "purpose": "investment"}'

curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "254712345678", "otp": "123456", "purpose": "investment"}'
```
