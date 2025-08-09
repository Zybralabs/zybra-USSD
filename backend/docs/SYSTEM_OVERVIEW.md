# Zybra USSD DeFi System - Complete Overview

## System Architecture

The Zybra USSD DeFi system is a comprehensive mobile-first DeFi platform that enables users to invest in decentralized finance protocols through simple USSD menus. The system integrates multiple services to provide a seamless experience from fiat to crypto to DeFi investments.

### Core Components

1. **USSD Interface** - Simple 3-option menu accessible via feature phones
2. **Shadow Wallets** - Phone number-based Ethereum wallets for each user
3. **YellowCard Integration** - Fiat-to-crypto conversion for African markets
4. **Morpho Protocol Integration** - DeFi lending and investment vaults
5. **Enhanced Authentication** - Multi-layer security system
6. **Database Layer** - PostgreSQL with Redis caching

## User Journey

### 1. Registration & Wallet Creation
```
User dials *123# → Phone number validation → Shadow wallet created → Welcome message
```

### 2. Investment Flow
```
*123# → 2. Invest → Select vault → Enter amount → Choose payment method → 
Authentication (OTP) → YellowCard purchase → Morpho deposit → Confirmation
```

### 3. Withdrawal Flow
```
*123# → 3. Withdraw → Select position → Enter amount → Authentication (OTP) → 
Morpho withdrawal → YellowCard sale → Mobile money payout
```

## Technical Stack

### Backend Services
- **Node.js/Express** - API server and USSD handler
- **PostgreSQL** - Primary database for users, transactions, investments
- **Redis** - Session management, caching, rate limiting
- **ethers.js** - Ethereum blockchain interactions

### External Integrations
- **Africa's Talking** - USSD and SMS services
- **YellowCard API** - Crypto purchase/sale with HMAC authentication
- **Morpho GraphQL API** - DeFi vault data and interactions
- **Ethereum Mainnet** - Smart contract interactions

### Security Features
- **Enhanced Authentication** - OTP-based verification system
- **Progressive Rate Limiting** - Abuse prevention
- **HMAC Signatures** - API request authentication
- **Session Management** - Secure token-based sessions
- **Cryptographic Security** - SHA-256 hashing for sensitive data

## Database Schema

### Core Tables
- `users` - User profiles and shadow wallet information
- `transactions` - All financial transactions and operations
- `ussd_sessions` - Active USSD session management
- `morpho_investments` - DeFi investment tracking
- `yellowcard_transactions` - Crypto purchase/sale records
- `user_portfolios` - Cached portfolio summaries

### Key Relationships
```sql
users (1) → (many) transactions
users (1) → (many) morpho_investments
users (1) → (many) yellowcard_transactions
morpho_investments (many) → (1) transactions
```

## API Endpoints

### Authentication
- `POST /api/auth/generate-otp` - Generate secure OTP
- `POST /api/auth/verify-otp` - Verify OTP and create session
- `POST /api/auth/authorize-wallet-operation` - Check operation authorization

### USSD
- `POST /api/ussd` - Main USSD endpoint for Africa's Talking
- `GET /api/ussd/health` - Health check

### Webhooks
- `POST /api/webhooks/yellowcard` - YellowCard transaction updates
- `POST /api/webhooks/morpho` - Morpho protocol events

### Transactions
- `GET /api/transactions/:phoneNumber` - User transaction history
- `POST /api/transactions/portfolio` - Portfolio summary

## Service Integrations

### YellowCard API
```javascript
// Purchase crypto
const result = await yellowCardService.purchaseCrypto({
  phoneNumber: '254712345678',
  fiatAmount: 1000,
  fiatCurrency: 'KES',
  cryptoCurrency: 'USDT',
  paymentMethod: 'mobile_money'
});
```

### Morpho Protocol
```javascript
// Deposit to vault
const result = await morphoService.depositToVault({
  userAddress: '0x123...',
  vaultAddress: '0x456...',
  amount: '100',
  privateKey: '0xprivate...'
});
```

### Enhanced Authentication
```javascript
// Generate OTP
const otp = await AuthService.generateSecureOTP('254712345678', 'investment');

// Verify and authorize
const auth = await AuthService.authorizeWalletOperation('254712345678', 'invest');
```

## USSD Menu Structure

```
*123# - Zybra DeFi
├── 1. Check Balance
│   ├── Wallet Balance: $X.XX
│   ├── Active Investments: $Y.YY
│   └── Total Portfolio: $Z.ZZ
├── 2. Invest
│   ├── Select Investment Type
│   │   ├── 1. Buy & Invest (Fiat → Crypto → DeFi)
│   │   └── 2. Invest Existing (Wallet → DeFi)
│   ├── Select Vault
│   │   ├── 1. USDC Vault (8.5% APY)
│   │   ├── 2. USDT Vault (7.8% APY)
│   │   └── 3. DAI Vault (9.2% APY)
│   ├── Enter Amount
│   ├── Confirm Details
│   ├── Authentication (OTP)
│   └── Processing & Confirmation
└── 3. Withdraw
    ├── Select Position
    │   ├── 1. USDC Vault: $X.XX
    │   ├── 2. USDT Vault: $Y.YY
    │   └── 3. DAI Vault: $Z.ZZ
    ├── Enter Amount (or 0 for all)
    ├── Confirm Details
    ├── Authentication (OTP)
    └── Processing & Confirmation
```

## Security Model

### Authentication Levels
1. **Basic** - Phone number validation
2. **Session** - Valid secure session required
3. **Recent** - Recent authentication (10 minutes) for sensitive operations
4. **OTP** - Fresh OTP verification for critical operations

### Rate Limiting
- **5+ requests**: 15-minute block
- **10+ requests**: 1-hour block
- **20+ requests**: 24-hour block with support escalation

### Data Protection
- **OTP Hashing** - SHA-256 with secret salt
- **Session Tokens** - 32-byte cryptographically secure random strings
- **Private Key Storage** - Encrypted with user-specific keys
- **Audit Logging** - All security events logged with masked PII

## Monitoring & Observability

### Key Metrics
- **USSD Response Time** - Target: <2 seconds
- **Authentication Success Rate** - Target: >95%
- **Investment Success Rate** - Target: >98%
- **API Uptime** - Target: 99.9%

### Alerts
- High error rates (>5%)
- Authentication failures (>10/hour per user)
- Failed transactions (>2% of total)
- External API failures

### Logging
```javascript
// Security events
logger.security('OTP_GENERATED', { phoneNumber: 'masked', purpose: 'investment' });

// Business events
logger.business('INVESTMENT_COMPLETED', { amount: 100, vault: '0x123...' });

// System events
logger.system('EXTERNAL_API_ERROR', { service: 'yellowcard', error: 'timeout' });
```

## Deployment Architecture

### Production Environment
```
Load Balancer (Nginx)
├── API Server 1 (Node.js)
├── API Server 2 (Node.js)
└── API Server 3 (Node.js)

Database Layer
├── PostgreSQL Primary
├── PostgreSQL Replica (Read)
└── Redis Cluster

External Services
├── Africa's Talking (USSD/SMS)
├── YellowCard API (Crypto)
├── Morpho GraphQL (DeFi)
└── Ethereum RPC (Blockchain)
```

### Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/zybra
REDIS_URL=redis://host:6379

# External APIs
AFRICAS_TALKING_API_KEY=your-key
AFRICAS_TALKING_USERNAME=your-username
YELLOWCARD_API_KEY=your-key
YELLOWCARD_SECRET_KEY=your-secret
MORPHO_GRAPHQL_URL=https://api.morpho.org/graphql

# Blockchain
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your-key
PRIVATE_KEY_ENCRYPTION_SECRET=your-secret

# Security
OTP_SECRET=your-otp-secret
SESSION_SECRET=your-session-secret
```

## Testing Strategy

### Unit Tests
- Service layer functions
- Authentication flows
- Data validation
- Error handling

### Integration Tests
- USSD flow end-to-end
- External API interactions
- Database operations
- Authentication workflows

### Load Testing
- USSD concurrent users
- API endpoint performance
- Database query optimization
- Redis session handling

### Security Testing
- Authentication bypass attempts
- Rate limiting effectiveness
- OTP brute force protection
- Session hijacking prevention

## Maintenance & Operations

### Daily Tasks
- Monitor system health
- Review error logs
- Check external API status
- Verify transaction processing

### Weekly Tasks
- Database maintenance
- Redis cleanup
- Security audit review
- Performance optimization

### Monthly Tasks
- Security key rotation
- Dependency updates
- Capacity planning
- Disaster recovery testing

## Future Enhancements

### Planned Features
- Multi-language USSD support
- Additional DeFi protocols (Aave, Compound)
- Yield farming strategies
- Portfolio rebalancing
- Social features (referrals, groups)

### Technical Improvements
- GraphQL API for frontend
- Real-time notifications
- Advanced analytics
- Machine learning risk assessment
- Cross-chain support

## Support & Documentation

### User Support
- USSD help menu (*123*0#)
- SMS-based support
- Phone support hotline
- Community forums

### Developer Resources
- API documentation
- SDK for integrations
- Webhook examples
- Testing tools

### Compliance
- KYC/AML procedures
- Regulatory reporting
- Data privacy (GDPR/CCPA)
- Financial regulations compliance
