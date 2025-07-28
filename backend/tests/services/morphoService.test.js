const MorphoService = require('../../src/services/morphoService');

// Mock the Morpho SDK modules
jest.mock('@morpho-org/blue-sdk-ethers', () => ({
  fetchVault: jest.fn(),
  fetchAccrualVault: jest.fn(),
  fetchVaultUser: jest.fn(),
  fetchToken: jest.fn(),
  fetchUser: jest.fn(),
  ChainId: {
    EthMainnet: 1
  },
  getChainAddresses: jest.fn(() => ({
    publicAllocator: '0x1234567890123456789012345678901234567890'
  }))
}));

// Mock ethers
jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn(() => ({
      getNetwork: jest.fn(() => Promise.resolve({ chainId: 1 }))
    })),
    Wallet: jest.fn(),
    Contract: jest.fn(),
    parseUnits: jest.fn((value, decimals) => BigInt(value) * BigInt(10 ** decimals)),
    formatUnits: jest.fn((value, decimals) => (Number(value) / (10 ** decimals)).toString())
  }
}));

// Mock database models
jest.mock('../../src/db/models', () => ({
  MorphoInvestment: {
    create: jest.fn(),
    updateStatus: jest.fn()
  }
}));

const { 
  fetchVault, 
  fetchAccrualVault,
  fetchVaultUser,
  fetchToken
} = require('@morpho-org/blue-sdk-ethers');

describe('MorphoService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchAvailableVaults', () => {
    const mockVaultData = {
      address: '0x38989BBA00BDF8181F4082995b3DEAe96163aC5D',
      name: 'Steakhouse USDC',
      symbol: 'mUSDC',
      asset: '0xA0b86a33E6441E6C7D3E4C2C4C6C6C6C6C6C6C6C',
      totalAssets: BigInt('1000000000000'),
      totalSupply: BigInt('950000000000'),
      lastTotalAssets: BigInt('980000000000'),
      fee: BigInt('1000'),
      curator: '0x1234567890123456789012345678901234567890',
      owner: '0x1234567890123456789012345678901234567890',
      supplyQueue: ['0xmarket1', '0xmarket2'],
      withdrawQueue: ['0xmarket1'],
      allocations: []
    };

    const mockTokenData = {
      address: '0xA0b86a33E6441E6C7D3E4C2C4C6C6C6C6C6C6C6C',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6
    };

    it('should fetch available vaults successfully using SDK', async () => {
      fetchAccrualVault.mockResolvedValue(mockVaultData);
      fetchToken.mockResolvedValue(mockTokenData);

      const result = await MorphoService.fetchAvailableVaults();

      expect(result.success).toBe(true);
      expect(result.vaults).toHaveLength(5);
      expect(fetchAccrualVault).toHaveBeenCalledTimes(5);
      expect(fetchToken).toHaveBeenCalledTimes(5);
    });

    it('should handle SDK errors gracefully', async () => {
      fetchAccrualVault.mockRejectedValue(new Error('SDK error'));

      const result = await MorphoService.fetchAvailableVaults();

      expect(result.success).toBe(true);
      expect(result.vaults).toHaveLength(0);
    });
  });

  describe('getVaultDetails', () => {
    const mockVaultData = {
      address: '0x38989BBA00BDF8181F4082995b3DEAe96163aC5D',
      name: 'Steakhouse USDC',
      symbol: 'mUSDC',
      asset: '0xA0b86a33E6441E6C7D3E4C2C4C6C6C6C6C6C6C6C',
      totalAssets: BigInt('1000000000000'),
      totalSupply: BigInt('950000000000'),
      lastTotalAssets: BigInt('980000000000'),
      fee: BigInt('1000'),
      curator: '0x1234567890123456789012345678901234567890',
      owner: '0x1234567890123456789012345678901234567890',
      guardian: '0x1234567890123456789012345678901234567890',
      feeRecipient: '0x1234567890123456789012345678901234567890',
      supplyQueue: ['0xmarket1'],
      withdrawQueue: ['0xmarket1'],
      allocations: []
    };

    const mockTokenData = {
      address: '0xA0b86a33E6441E6C7D3E4C2C4C6C6C6C6C6C6C6C',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6
    };

    it('should get vault details successfully', async () => {
      fetchAccrualVault.mockResolvedValue(mockVaultData);
      fetchToken.mockResolvedValue(mockTokenData);

      const result = await MorphoService.getVaultDetails('0x38989BBA00BDF8181F4082995b3DEAe96163aC5D');

      expect(result.success).toBe(true);
      expect(result.vault).toMatchObject({
        address: '0x38989BBA00BDF8181F4082995b3DEAe96163aC5D',
        name: 'Steakhouse USDC',
        symbol: 'mUSDC'
      });
    });

    it('should handle vault not found', async () => {
      fetchAccrualVault.mockRejectedValue(new Error('Vault not found'));

      const result = await MorphoService.getVaultDetails('0xinvalid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to fetch vault details');
    });
  });

  describe('getUserPositions', () => {
    const mockVaultUserData = {
      shares: BigInt('1000000000'),
      assets: BigInt('1050000000')
    };

    const mockVaultData = {
      address: '0x38989BBA00BDF8181F4082995b3DEAe96163aC5D',
      name: 'Steakhouse USDC',
      symbol: 'mUSDC',
      asset: '0xA0b86a33E6441E6C7D3E4C2C4C6C6C6C6C6C6C6C'
    };

    const mockTokenData = {
      symbol: 'USDC',
      decimals: 6
    };

    it('should get user positions successfully', async () => {
      fetchVaultUser.mockResolvedValue(mockVaultUserData);
      fetchVault.mockResolvedValue(mockVaultData);
      fetchToken.mockResolvedValue(mockTokenData);

      const result = await MorphoService.getUserPositions('0xuser123');

      expect(result.success).toBe(true);
      expect(fetchVaultUser).toHaveBeenCalledTimes(5);
    });

    it('should handle user with no positions', async () => {
      fetchVaultUser.mockResolvedValue({ shares: BigInt('0'), assets: BigInt('0') });

      const result = await MorphoService.getUserPositions('0xuser123');

      expect(result.success).toBe(true);
      expect(result.positions).toHaveLength(0);
    });
  });

  describe('calculateEstimatedApy', () => {
    it('should calculate APY for USDC vault', () => {
      const vault = { name: 'USDC Vault', allocations: [] };
      const apy = MorphoService.calculateEstimatedApy(vault);
      expect(apy).toBe(0.075);
    });

    it('should calculate APY for ETH vault', () => {
      const vault = { name: 'ETH Vault', allocations: [] };
      const apy = MorphoService.calculateEstimatedApy(vault);
      expect(apy).toBe(0.085);
    });

    it('should return default APY for unknown vault', () => {
      const vault = { name: 'Unknown Vault', allocations: [] };
      const apy = MorphoService.calculateEstimatedApy(vault);
      expect(apy).toBe(0.08);
    });
  });

  describe('calculateRiskLevel', () => {
    it('should return LOW risk for conservative vault', () => {
      const vault = { totalAssets: BigInt('10000000000000') };
      MorphoService.calculateEstimatedApy = jest.fn(() => 0.05);
      
      const risk = MorphoService.calculateRiskLevel(vault);
      expect(risk).toBe('LOW');
    });

    it('should return HIGH risk for high APY vault', () => {
      const vault = { totalAssets: BigInt('10000000000000') };
      MorphoService.calculateEstimatedApy = jest.fn(() => 0.20);
      
      const risk = MorphoService.calculateRiskLevel(vault);
      expect(risk).toBe('HIGH');
    });

    it('should return MEDIUM risk for moderate vault', () => {
      const vault = { totalAssets: BigInt('500000000000') };
      MorphoService.calculateEstimatedApy = jest.fn(() => 0.08);
      
      const risk = MorphoService.calculateRiskLevel(vault);
      expect(risk).toBe('MEDIUM');
    });
  });

  describe('assessRisk', () => {
    it('should assess risk correctly for high-risk vault', () => {
      const vaultData = {
        apy: 25,
        tvl: 500000,
        utilization: 98,
        fee: 20
      };

      const risk = MorphoService.assessRisk(vaultData);
      
      expect(risk.level).toBe('High');
      expect(risk.score).toBeGreaterThan(70);
      expect(risk.factors).toContain('Very high APY');
      expect(risk.factors).toContain('Low TVL');
      expect(risk.factors).toContain('Very high utilization');
      expect(risk.factors).toContain('High fees');
    });

    it('should assess risk correctly for low-risk vault', () => {
      const vaultData = {
        apy: 5,
        tvl: 50000000,
        utilization: 70,
        fee: 5
      };

      const risk = MorphoService.assessRisk(vaultData);
      
      expect(risk.level).toBe('Low');
      expect(risk.score).toBeLessThan(30);
      expect(risk.factors).toContain('Conservative APY');
      expect(risk.factors).toContain('High TVL');
      expect(risk.factors).toContain('Normal utilization');
    });
  });
});
