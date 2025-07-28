-- Migration: Add DeFi Support (Morpho + YellowCard)
-- Version: 001
-- Description: Adds tables and functionality for Morpho investments and YellowCard integration

-- Update transactions table to support new transaction types
ALTER TABLE transactions 
DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE transactions 
ADD CONSTRAINT transactions_type_check 
CHECK (type IN ('transfer', 'deposit', 'withdrawal', 'receive', 'morpho_investment', 'morpho_withdrawal', 'yellowcard_purchase', 'yellowcard_sale', 'pending_investment'));

-- Create Morpho Investments table
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

-- Create YellowCard Transactions table
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

-- Create User Portfolio Summary table
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

-- Add triggers for new tables
CREATE TRIGGER update_morpho_investments_updated_at BEFORE UPDATE ON morpho_investments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_yellowcard_transactions_updated_at BEFORE UPDATE ON yellowcard_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_portfolios_updated_at BEFORE UPDATE ON user_portfolios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add new system configurations
INSERT INTO system_config (config_key, config_value, description) VALUES
('morpho_settings', '{"min_investment_usd": 10, "max_vaults_display": 5, "apy_refresh_minutes": 60}', 'Morpho protocol integration settings'),
('yellowcard_settings', '{"min_purchase_kes": 1000, "supported_countries": ["KE", "NG", "UG", "TZ"], "webhook_timeout_seconds": 30}', 'YellowCard API integration settings'),
('investment_settings', '{"risk_tolerance": "medium", "auto_reinvest": false, "portfolio_rebalance_days": 30}', 'Investment and portfolio management settings')
ON CONFLICT (config_key) DO NOTHING;

-- Update existing views
DROP VIEW IF EXISTS user_transaction_summary;
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

-- Create new views for portfolio management
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

-- Add table comments
COMMENT ON TABLE morpho_investments IS 'Tracks user investments in Morpho protocol vaults';
COMMENT ON TABLE yellowcard_transactions IS 'Records YellowCard API transactions for crypto purchases and sales';
COMMENT ON TABLE user_portfolios IS 'Cached portfolio summaries for improved performance';

-- Migration completed successfully
