<<<<<<< HEAD
# Zybra SMS/USSD DeFi Transaction System

A comprehensive SMS and USSD-based transaction system that enables users to interact with DeFi protocols through simple mobile interfaces. Built with Africa's Talking APIs, PostgreSQL, Redis, and Ethereum blockchain integration.

## 🚀 Features

### Core Functionality
- **SMS Integration**: Send/receive SMS for transaction notifications and commands
- **USSD Menu System**: Interactive USSD menus for balance checks, transfers, and account management
- **Blockchain Integration**: Direct interaction with ZrUSD smart contract on Ethereum
- **Mobile Money Integration**: Support for Airtel Money and other mobile payment providers
- **Multi-currency Support**: Handle MWK, KES, and other African currencies with automatic conversion

### Security & Reliability
- **Rate Limiting**: Protect against spam and abuse
- **OTP Verification**: Secure user authentication via SMS
- **Encrypted Key Storage**: Secure wallet private key management
- **Transaction Monitoring**: Real-time transaction status tracking
- **Error Handling**: Comprehensive error handling and user notifications

### Developer Experience
- **RESTful APIs**: Well-documented API endpoints
- **Docker Support**: Easy deployment with Docker Compose
- **Database Migrations**: Automated database schema management
- **Comprehensive Logging**: Detailed logging for debugging and monitoring
- **Health Checks**: Built-in health monitoring endpoints
=======
# Zybra USSD DeFi Platform

A mobile-first DeFi platform that enables users to invest in decentralized finance protocols through simple USSD menus, accessible on any mobile phone including feature phones.

## 🌟 Features

### Core Functionality
- **USSD Interface** - Simple 3-option menu (*123#): Check Balance, Invest, Withdraw
- **Shadow Wallets** - Phone number-based Ethereum wallets for seamless onboarding
- **Fiat-to-DeFi** - Direct investment from mobile money to DeFi protocols
- **Multi-Protocol Support** - Morpho lending vaults with more protocols coming soon

### Security & Authentication
- **Enhanced Authentication** - Multi-layer OTP-based security system
- **Progressive Rate Limiting** - Abuse prevention with automatic escalation
- **Cryptographic Security** - SHA-256 hashing and HMAC signatures
- **Session Management** - Secure token-based sessions with automatic expiry

### Integrations
- **Africa's Talking** - USSD and SMS services for African markets
- **YellowCard API** - Crypto purchase/sale with local payment methods
- **Morpho Protocol** - DeFi lending and investment vaults
- **Ethereum Mainnet** - Direct smart contract interactions

### Developer Experience
- **Comprehensive Testing** - Unit, integration, and API test suites
- **Enhanced Documentation** - Complete system and API documentation
- **Docker Support** - Easy deployment with Docker Compose
- **Database Migrations** - Automated schema management with DeFi support
- **Health Monitoring** - Built-in health checks and observability
>>>>>>> e493750ee6533facd8eb627b1ad0498cb277d1f1

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Mobile Phone  │    │  Africa's Talking│    │  Zybra Backend  │
│                 │◄──►│                  │◄──►│                 │
│  SMS/USSD       │    │  SMS/USSD APIs   │    │  Express.js     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                       ┌─────────────────┐              │
                       │   PostgreSQL    │◄─────────────┤
                       │   Database      │              │
                       └─────────────────┘              │
                                                         │
                       ┌─────────────────┐              │
                       │     Redis       │◄─────────────┤
                       │     Cache       │              │
                       └─────────────────┘              │
                                                         │
                       ┌─────────────────┐              │
                       │   Ethereum      │◄─────────────┘
                       │   Blockchain    │
                       │   (ZrUSD)       │
                       └─────────────────┘
```

## 📱 User Flow Examples

### USSD Transaction Flow
1. User dials `*384*96#`
2. System displays main menu
3. User selects "Send Money" (option 2)
4. User enters recipient phone number
5. User enters amount
6. System shows confirmation screen
7. User confirms transaction
8. System processes blockchain transaction
9. Both users receive SMS confirmations

### SMS Command Flow
1. User sends "BALANCE" via SMS
2. System processes command
3. System queries blockchain for current balance
4. System sends balance information via SMS

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- Redis 6+
- Docker & Docker Compose (optional)

### Quick Start with Docker

1. **Clone the repository**
```bash
git clone https://github.com/zybra/sms-ussd-system.git
cd zybra-sms
```

2. **Configure environment variables**
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your configuration
```

3. **Start services with Docker Compose**
```bash
docker-compose up -d
```

4. **Initialize database**
```bash
docker-compose exec backend npm run db:migrate
```

### Manual Installation

1. **Install dependencies**
```bash
cd backend
npm install
```

2. **Set up PostgreSQL database**
```bash
createdb zybra_sms
psql zybra_sms < src/db/schema.sql
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start the application**
```bash
npm run dev
```

## ⚙️ Configuration

### Environment Variables

#### Africa's Talking Configuration
```env
AFRICASTALKING_USERNAME=your_username
AFRICASTALKING_API_KEY=your_api_key
AFRICASTALKING_SENDER_ID=ZYBRA
```

#### Database Configuration
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zybra_sms
DB_USER=postgres
DB_PASSWORD=password
```

#### Blockchain Configuration
```env
RPC_URL=http://localhost:8545
ZRUSD_CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
MASTER_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000000
```

### Africa's Talking Setup

1. **Create Account**: Sign up at [Africa's Talking](https://africastalking.com)
2. **Get API Credentials**: Navigate to your dashboard and copy your username and API key
3. **Configure Webhooks**: Set up webhook URLs for SMS and USSD callbacks:
   - SMS Callback: `https://yourdomain.com/api/sms/incoming`
   - USSD Callback: `https://yourdomain.com/api/ussd`
4. **Purchase USSD Code**: Buy a USSD short code (e.g., `*384*96#`)

## 📚 API Documentation

### SMS Endpoints

#### Send SMS
```http
POST /api/sms/send
Content-Type: application/json

{
  "phoneNumber": "254712345678",
  "message": "Hello from Zybra!",
  "from": "ZYBRA"
}
```

#### Process Incoming SMS
```http
POST /api/sms/incoming
Content-Type: application/json

{
  "from": "254712345678",
  "text": "BALANCE",
  "linkId": "12345",
  "date": "2023-10-01 12:00:00"
}
```

### USSD Endpoints

#### Handle USSD Request
```http
POST /api/ussd
Content-Type: application/x-www-form-urlencoded

sessionId=12345&serviceCode=*384*96#&phoneNumber=254712345678&text=1*2*100
```

### Transaction Endpoints

#### Process Transfer
```http
POST /api/transactions/transfer
Authorization: Bearer <token>
Content-Type: application/json

{
  "fromPhone": "254712345678",
  "toPhone": "254787654321",
  "amount": 100,
  "currency": "ZrUSD"
}
```

#### Get Transaction History
```http
GET /api/transactions/history/254712345678?limit=10
Authorization: Bearer <token>
```

## 🔧 Development

### Project Structure
```
zybra-sms/
├── backend/
│   ├── src/
│   │   ├── db/           # Database models and configuration
│   │   ├── middleware/   # Express middleware
│   │   ├── routes/       # API route handlers
│   │   ├── services/     # Business logic services
│   │   └── utils/        # Utility functions
│   ├── logs/             # Application logs
│   ├── app.js           # Main application entry point
│   └── package.json     # Dependencies and scripts
├── contracts/           # Smart contracts
├── messaging/          # SMS utilities
└── docker-compose.yml  # Docker services configuration
```

### Running Tests
```bash
cd backend
npm test                # Run all tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage
```

### Code Quality
```bash
npm run lint           # Check code style
npm run lint:fix       # Fix code style issues
npm run format         # Format code with Prettier
```

## 📊 Monitoring & Analytics

### Health Checks
- **Application Health**: `GET /health`
- **Database Health**: Included in health endpoint
- **Redis Health**: Included in health endpoint

### Metrics Endpoints
- **SMS Statistics**: `GET /api/sms/stats`
- **USSD Statistics**: `GET /api/ussd/stats`
- **Transaction Statistics**: `GET /api/transactions/stats/overview`

### Logging
- **Application Logs**: `backend/logs/combined.log`
- **Error Logs**: `backend/logs/error.log`
- **Access Logs**: Console output with Morgan

## 🚀 Deployment

### Production Deployment

1. **Prepare Environment**
```bash
# Set production environment variables
export NODE_ENV=production
export PORT=3000
# ... other production variables
```

2. **Build and Deploy**
```bash
# Using Docker
docker-compose -f docker-compose.prod.yml up -d

# Or manual deployment
npm run start
```

3. **Set up Reverse Proxy** (Nginx example)
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Scaling Considerations
- **Load Balancing**: Use multiple backend instances behind a load balancer
- **Database Scaling**: Consider read replicas for high-traffic scenarios
- **Redis Clustering**: Set up Redis cluster for session management
- **CDN**: Use CDN for static assets and API caching

## 🔐 Security

### Best Practices Implemented
- **Rate Limiting**: Prevents API abuse
- **Input Validation**: All inputs are validated and sanitized
- **Encrypted Storage**: Private keys are encrypted before storage
- **HTTPS Only**: All production traffic should use HTTPS
- **Environment Variables**: Sensitive data stored in environment variables
- **Database Security**: Parameterized queries prevent SQL injection

### Security Checklist
- [ ] Change default passwords and keys
- [ ] Enable HTTPS in production
- [ ] Set up proper firewall rules
- [ ] Regular security updates
- [ ] Monitor for suspicious activity
- [ ] Backup encryption keys securely

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow existing code style
- Add tests for new features
- Update documentation
- Ensure all tests pass
- Follow semantic versioning

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Getting Help
- **Documentation**: Check this README and inline code comments
- **Issues**: Create an issue on GitHub for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions and ideas

### Common Issues

#### SMS Not Sending
1. Check Africa's Talking credentials
2. Verify phone number format
3. Check account balance
4. Review API logs for errors

#### USSD Not Working
1. Verify USSD code is active
2. Check webhook URL configuration
3. Test with Africa's Talking simulator
4. Review session management logs

#### Database Connection Issues
1. Verify PostgreSQL is running
2. Check connection credentials
3. Ensure database exists
4. Review firewall settings

## 🗺️ Roadmap

### Phase 1 (Current)
- [x] Basic SMS/USSD functionality
- [x] ZrUSD smart contract integration
- [x] PostgreSQL database setup
- [x] Redis session management
- [x] Docker deployment

### Phase 2 (Next)
- [ ] Multi-language support
- [ ] Advanced analytics dashboard
- [ ] Mobile money provider integrations
- [ ] Enhanced security features
- [ ] Performance optimizations

### Phase 3 (Future)
- [ ] Multi-chain support
- [ ] Advanced DeFi integrations
- [ ] Machine learning fraud detection
- [ ] Mobile app companion
- [ ] API marketplace integration

---

**Built with ❤️ by the Zybra Team**

For more information, visit [zybra.com](https://zybra.com) or contact us at [hello@zybra.com](mailto:hello@zybra.com)
