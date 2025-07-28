-- Zybra SMS/USSD Database Schema
-- PostgreSQL Database Schema for Zybra SMS/USSD Transaction System

-- Create database (run this separately)
-- CREATE DATABASE zybra_sms;

-- Connect to the database
-- \c zybra_sms;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    balance DECIMAL(18, 8) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on phone_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('transfer', 'deposit', 'withdrawal', 'receive', 'morpho_investment', 'morpho_withdrawal', 'yellowcard_purchase', 'yellowcard_sale', 'pending_investment')),
    amount DECIMAL(18, 8) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'ZrUSD',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    tx_hash VARCHAR(66),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for transactions
CREATE INDEX IF NOT EXISTS idx_transactions_phone_number ON transactions(phone_number);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash);

-- USSD Sessions table
CREATE TABLE IF NOT EXISTS ussd_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(100) UNIQUE NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    current_menu VARCHAR(50) NOT NULL DEFAULT 'main',
    session_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for USSD sessions
CREATE INDEX IF NOT EXISTS idx_ussd_sessions_session_id ON ussd_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_ussd_sessions_phone_number ON ussd_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_ussd_sessions_updated_at ON ussd_sessions(updated_at);

-- SMS Logs table (for tracking SMS delivery and analytics)
CREATE TABLE IF NOT EXISTS sms_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) NOT NULL,
    message_type VARCHAR(50) NOT NULL,
    message_content TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed')),
    provider_message_id VARCHAR(100),
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for SMS logs
CREATE INDEX IF NOT EXISTS idx_sms_logs_phone_number ON sms_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON sms_logs(status);
CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON sms_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_sms_logs_provider_message_id ON sms_logs(provider_message_id);

-- OTP Verifications table
CREATE TABLE IF NOT EXISTS otp_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    purpose VARCHAR(50) NOT NULL DEFAULT 'verification',
    is_verified BOOLEAN DEFAULT false,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for OTP verifications
CREATE INDEX IF NOT EXISTS idx_otp_verifications_phone_number ON otp_verifications(phone_number);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_expires_at ON otp_verifications(expires_at);

-- Wallet Keys table (for storing encrypted private keys)
CREATE TABLE IF NOT EXISTS wallet_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    key_derivation_salt VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for wallet keys
CREATE INDEX IF NOT EXISTS idx_wallet_keys_phone_number ON wallet_keys(phone_number);

-- Morpho Investments table
CREATE TABLE IF NOT EXISTS morpho_investments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) NOT NULL,
    vault_address VARCHAR(42) NOT NULL,
    vault_name VARCHAR(100) NOT NULL,
    vault_symbol VARCHAR(20) NOT NULL,
    asset_symbol VARCHAR(20) NOT NULL,
    shares DECIMAL(18, 8) NOT NULL DEFAULT 0,
    assets DECIMAL(18, 8) NOT NULL DEFAULT 0,
    initial_investment DECIMAL(18, 8) NOT NULL,
    current_apy DECIMAL(8, 4) DEFAULT 0,
    investment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'partial')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for morpho investments
CREATE INDEX IF NOT EXISTS idx_morpho_investments_phone_number ON morpho_investments(phone_number);
CREATE INDEX IF NOT EXISTS idx_morpho_investments_vault_address ON morpho_investments(vault_address);
CREATE INDEX IF NOT EXISTS idx_morpho_investments_status ON morpho_investments(status);
CREATE INDEX IF NOT EXISTS idx_morpho_investments_investment_date ON morpho_investments(investment_date);

-- YellowCard Transactions table
CREATE TABLE IF NOT EXISTS yellowcard_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) NOT NULL,
    yellowcard_id VARCHAR(100) UNIQUE NOT NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('collection', 'payment')),
    fiat_amount DECIMAL(18, 2) NOT NULL,
    fiat_currency VARCHAR(10) NOT NULL,
    crypto_amount DECIMAL(18, 8),
    crypto_currency VARCHAR(10) NOT NULL,
    exchange_rate DECIMAL(18, 8),
    payment_method VARCHAR(50),
    country_code VARCHAR(5),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    yellowcard_status VARCHAR(50),
    webhook_data JSONB DEFAULT '{}',
    customer_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for yellowcard transactions
CREATE INDEX IF NOT EXISTS idx_yellowcard_transactions_phone_number ON yellowcard_transactions(phone_number);
CREATE INDEX IF NOT EXISTS idx_yellowcard_transactions_yellowcard_id ON yellowcard_transactions(yellowcard_id);
CREATE INDEX IF NOT EXISTS idx_yellowcard_transactions_status ON yellowcard_transactions(status);
CREATE INDEX IF NOT EXISTS idx_yellowcard_transactions_type ON yellowcard_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_yellowcard_transactions_created_at ON yellowcard_transactions(created_at);

-- User Portfolio Summary table (for caching portfolio data)
CREATE TABLE IF NOT EXISTS user_portfolios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    wallet_balance DECIMAL(18, 8) DEFAULT 0,
    total_invested DECIMAL(18, 8) DEFAULT 0,
    total_portfolio_value DECIMAL(18, 8) DEFAULT 0,
    active_investments_count INTEGER DEFAULT 0,
    total_yield_earned DECIMAL(18, 8) DEFAULT 0,
    last_calculated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for user portfolios
CREATE INDEX IF NOT EXISTS idx_user_portfolios_phone_number ON user_portfolios(phone_number);
CREATE INDEX IF NOT EXISTS idx_user_portfolios_last_calculated ON user_portfolios(last_calculated);

-- System Configuration table
CREATE TABLE IF NOT EXISTS system_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default system configurations
INSERT INTO system_config (config_key, config_value, description) VALUES
('transaction_limits', '{"daily_limit": 10000, "single_transaction_limit": 5000, "currency": "ZrUSD"}', 'Transaction limits configuration'),
('sms_settings', '{"rate_limit_per_hour": 10, "otp_expiry_minutes": 5}', 'SMS service settings'),
('ussd_settings', '{"session_timeout_minutes": 5, "max_menu_depth": 10}', 'USSD service settings'),
('blockchain_settings', '{"confirmation_blocks": 3, "gas_price_gwei": 20}', 'Blockchain interaction settings'),
('morpho_settings', '{"min_investment_usd": 10, "max_vaults_display": 5, "apy_refresh_minutes": 60}', 'Morpho protocol integration settings'),
('yellowcard_settings', '{"min_purchase_kes": 1000, "supported_countries": ["KE", "NG", "UG", "TZ"], "webhook_timeout_seconds": 30}', 'YellowCard API integration settings'),
('investment_settings', '{"risk_tolerance": "medium", "auto_reinvest": false, "portfolio_rebalance_days": 30}', 'Investment and portfolio management settings')
ON CONFLICT (config_key) DO NOTHING;

-- Create triggers for updating updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ussd_sessions_updated_at BEFORE UPDATE ON ussd_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sms_logs_updated_at BEFORE UPDATE ON sms_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_morpho_investments_updated_at BEFORE UPDATE ON morpho_investments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_yellowcard_transactions_updated_at BEFORE UPDATE ON yellowcard_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_portfolios_updated_at BEFORE UPDATE ON user_portfolios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for common queries
CREATE OR REPLACE VIEW user_transaction_summary AS
SELECT
    u.phone_number,
    u.wallet_address,
    u.balance,
    COUNT(t.id) as total_transactions,
    COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_transactions,
    COUNT(CASE WHEN t.status = 'pending' THEN 1 END) as pending_transactions,
    COUNT(CASE WHEN t.status = 'failed' THEN 1 END) as failed_transactions,
    SUM(CASE WHEN t.type = 'transfer' AND t.status = 'completed' THEN t.amount ELSE 0 END) as total_sent,
    SUM(CASE WHEN t.type = 'receive' AND t.status = 'completed' THEN t.amount ELSE 0 END) as total_received,
    SUM(CASE WHEN t.type = 'morpho_investment' AND t.status = 'completed' THEN t.amount ELSE 0 END) as total_invested,
    SUM(CASE WHEN t.type = 'morpho_withdrawal' AND t.status = 'completed' THEN t.amount ELSE 0 END) as total_withdrawn,
    MAX(t.created_at) as last_transaction_date
FROM users u
LEFT JOIN transactions t ON u.phone_number = t.phone_number
GROUP BY u.phone_number, u.wallet_address, u.balance;

-- Create view for daily transaction statistics
CREATE OR REPLACE VIEW daily_transaction_stats AS
SELECT
    DATE(created_at) as transaction_date,
    type as transaction_type,
    status,
    COUNT(*) as transaction_count,
    SUM(amount) as total_amount,
    AVG(amount) as average_amount
FROM transactions
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at), type, status
ORDER BY transaction_date DESC, transaction_type;

-- Create view for user portfolio overview
CREATE OR REPLACE VIEW user_portfolio_overview AS
SELECT
    u.phone_number,
    u.wallet_address,
    u.balance as wallet_balance,
    COALESCE(SUM(mi.assets), 0) as total_invested,
    COALESCE(COUNT(mi.id), 0) as active_investments,
    (u.balance + COALESCE(SUM(mi.assets), 0)) as total_portfolio_value,
    COALESCE(AVG(mi.current_apy), 0) as average_apy,
    MAX(mi.last_updated) as last_investment_update
FROM users u
LEFT JOIN morpho_investments mi ON u.phone_number = mi.phone_number AND mi.status = 'active'
GROUP BY u.phone_number, u.wallet_address, u.balance;

-- Create view for investment performance tracking
CREATE OR REPLACE VIEW investment_performance AS
SELECT
    mi.phone_number,
    mi.vault_name,
    mi.vault_symbol,
    mi.asset_symbol,
    mi.initial_investment,
    mi.assets as current_value,
    (mi.assets - mi.initial_investment) as unrealized_gain_loss,
    ((mi.assets - mi.initial_investment) / mi.initial_investment * 100) as return_percentage,
    mi.current_apy,
    mi.investment_date,
    EXTRACT(DAYS FROM (NOW() - mi.investment_date)) as days_invested
FROM morpho_investments mi
WHERE mi.status = 'active'
ORDER BY mi.investment_date DESC;

-- Create view for YellowCard transaction summary
CREATE OR REPLACE VIEW yellowcard_summary AS
SELECT
    yt.phone_number,
    COUNT(*) as total_transactions,
    COUNT(CASE WHEN yt.status = 'completed' THEN 1 END) as completed_transactions,
    COUNT(CASE WHEN yt.status = 'pending' THEN 1 END) as pending_transactions,
    COUNT(CASE WHEN yt.status = 'failed' THEN 1 END) as failed_transactions,
    SUM(CASE WHEN yt.transaction_type = 'collection' AND yt.status = 'completed' THEN yt.fiat_amount ELSE 0 END) as total_purchased_fiat,
    SUM(CASE WHEN yt.transaction_type = 'collection' AND yt.status = 'completed' THEN yt.crypto_amount ELSE 0 END) as total_purchased_crypto,
    SUM(CASE WHEN yt.transaction_type = 'payment' AND yt.status = 'completed' THEN yt.fiat_amount ELSE 0 END) as total_sold_fiat,
    SUM(CASE WHEN yt.transaction_type = 'payment' AND yt.status = 'completed' THEN yt.crypto_amount ELSE 0 END) as total_sold_crypto,
    MAX(yt.created_at) as last_transaction_date
FROM yellowcard_transactions yt
GROUP BY yt.phone_number;

-- Create function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM ussd_sessions 
    WHERE updated_at < NOW() - INTERVAL '1 hour';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    DELETE FROM otp_verifications 
    WHERE expires_at < NOW();
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get user balance with transaction history
CREATE OR REPLACE FUNCTION get_user_balance_with_history(user_phone VARCHAR(20))
RETURNS TABLE (
    current_balance DECIMAL(18, 8),
    recent_transactions JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.balance,
        COALESCE(
            json_agg(
                json_build_object(
                    'id', t.id,
                    'type', t.type,
                    'amount', t.amount,
                    'currency', t.currency,
                    'status', t.status,
                    'created_at', t.created_at
                )
                ORDER BY t.created_at DESC
            ) FILTER (WHERE t.id IS NOT NULL),
            '[]'::json
        )::jsonb
    FROM users u
    LEFT JOIN (
        SELECT * FROM transactions
        WHERE phone_number = user_phone
        ORDER BY created_at DESC
        LIMIT 10
    ) t ON u.phone_number = t.phone_number
    WHERE u.phone_number = user_phone
    GROUP BY u.balance;
END;
$$ LANGUAGE plpgsql;

-- Create function to get user portfolio summary
CREATE OR REPLACE FUNCTION get_user_portfolio_summary(user_phone VARCHAR(20))
RETURNS TABLE (
    wallet_balance DECIMAL(18, 8),
    total_invested DECIMAL(18, 8),
    total_portfolio_value DECIMAL(18, 8),
    active_investments INTEGER,
    portfolio_data JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.balance,
        COALESCE(SUM(mi.assets), 0),
        u.balance + COALESCE(SUM(mi.assets), 0),
        COALESCE(COUNT(mi.id)::INTEGER, 0),
        COALESCE(
            json_agg(
                json_build_object(
                    'vault_name', mi.vault_name,
                    'vault_symbol', mi.vault_symbol,
                    'asset_symbol', mi.asset_symbol,
                    'shares', mi.shares,
                    'assets', mi.assets,
                    'initial_investment', mi.initial_investment,
                    'current_apy', mi.current_apy,
                    'investment_date', mi.investment_date,
                    'unrealized_gain', mi.assets - mi.initial_investment
                )
                ORDER BY mi.investment_date DESC
            ) FILTER (WHERE mi.id IS NOT NULL),
            '[]'::json
        )::jsonb
    FROM users u
    LEFT JOIN morpho_investments mi ON u.phone_number = mi.phone_number AND mi.status = 'active'
    WHERE u.phone_number = user_phone
    GROUP BY u.balance;
END;
$$ LANGUAGE plpgsql;

-- Create function to update portfolio cache
CREATE OR REPLACE FUNCTION update_user_portfolio_cache(user_phone VARCHAR(20))
RETURNS BOOLEAN AS $$
DECLARE
    portfolio_summary RECORD;
BEGIN
    -- Get current portfolio data
    SELECT * INTO portfolio_summary FROM get_user_portfolio_summary(user_phone);

    -- Update or insert portfolio cache
    INSERT INTO user_portfolios (
        phone_number,
        wallet_balance,
        total_invested,
        total_portfolio_value,
        active_investments_count,
        last_calculated
    ) VALUES (
        user_phone,
        portfolio_summary.wallet_balance,
        portfolio_summary.total_invested,
        portfolio_summary.total_portfolio_value,
        portfolio_summary.active_investments,
        NOW()
    )
    ON CONFLICT (phone_number) DO UPDATE SET
        wallet_balance = EXCLUDED.wallet_balance,
        total_invested = EXCLUDED.total_invested,
        total_portfolio_value = EXCLUDED.total_portfolio_value,
        active_investments_count = EXCLUDED.active_investments_count,
        last_calculated = EXCLUDED.last_calculated,
        updated_at = NOW();

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO zybra_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO zybra_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO zybra_user;

-- Create sample data for testing (optional)
-- INSERT INTO users (phone_number, wallet_address, balance) VALUES
-- ('254712345678', '0x1234567890123456789012345678901234567890', 100.00),
-- ('254787654321', '0x0987654321098765432109876543210987654321', 50.00);

COMMENT ON TABLE users IS 'Stores user account information including phone numbers and wallet addresses';
COMMENT ON TABLE transactions IS 'Records all financial transactions in the system including DeFi investments and YellowCard purchases';
COMMENT ON TABLE ussd_sessions IS 'Manages active USSD session state';
COMMENT ON TABLE sms_logs IS 'Logs all SMS communications for analytics and debugging';
COMMENT ON TABLE otp_verifications IS 'Manages OTP codes for user verification';
COMMENT ON TABLE wallet_keys IS 'Securely stores encrypted private keys for user wallets';
COMMENT ON TABLE morpho_investments IS 'Tracks user investments in Morpho protocol vaults';
COMMENT ON TABLE yellowcard_transactions IS 'Records YellowCard API transactions for crypto purchases and sales';
COMMENT ON TABLE user_portfolios IS 'Cached portfolio summaries for improved performance';
COMMENT ON TABLE system_config IS 'System-wide configuration settings';

-- End of schema
