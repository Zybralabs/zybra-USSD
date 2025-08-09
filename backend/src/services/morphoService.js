const { ethers } = require('ethers');
const {
  fetchVault,
  fetchAccrualVault,
  fetchVaultUser,
  fetchToken,
  fetchUser,
  ChainId,
  getChainAddresses
} = require('@morpho-org/blue-sdk-ethers');
const { MorphoInvestment } = require('../db/models');
const logger = require('../utils/logger');

class MorphoService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    this.chainId = ChainId.EthMainnet; // Ethereum mainnet
    this.chainAddresses = getChainAddresses(this.chainId);

    // Popular Morpho vault addresses (these should be configurable)
    this.popularVaults = [
      '0x38989BBA00BDF8181F4082995b3DEAe96163aC5D', // Steakhouse USDC
      '0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB', // Steakhouse ETH
      '0x186514400e52270cef3D80e1c6F8d10A75d47344', // Re7 WETH
      '0x8eB67A509616cd6A7c1B3c8C21D48FF57df3d458', // Gauntlet USDC Prime
      '0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658', // Gauntlet WETH Prime
    ];

    // ERC-4626 Vault ABI for direct contract interactions
    this.vaultABI = [
      'function deposit(uint256 assets, address receiver) external returns (uint256 shares)',
      'function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares)',
      'function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets)',
      'function balanceOf(address account) external view returns (uint256)',
      'function totalAssets() external view returns (uint256)',
      'function totalSupply() external view returns (uint256)',
      'function convertToShares(uint256 assets) external view returns (uint256)',
      'function convertToAssets(uint256 shares) external view returns (uint256)',
      'function previewDeposit(uint256 assets) external view returns (uint256)',
      'function previewWithdraw(uint256 assets) external view returns (uint256)',
      'function previewRedeem(uint256 shares) external view returns (uint256)',
      'function asset() external view returns (address)',
      'function symbol() external view returns (string)',
      'function name() external view returns (string)',
      'function decimals() external view returns (uint8)'
    ];
  }

  /**
   * Get available Morpho vaults using the official SDK
   * @param {Array} vaultAddresses - Optional array of specific vault addresses to fetch
   * @returns {Promise<Object>} - Available vaults with their details
   */
  async fetchAvailableVaults(vaultAddresses = null) {
    try {
      const vaultsToFetch = vaultAddresses || this.popularVaults;
      const runner = { provider: this.provider };

      logger.info(`Fetching ${vaultsToFetch.length} Morpho vaults using SDK`);

      // Fetch all vaults in parallel
      const vaultPromises = vaultsToFetch.map(async (address) => {
        try {
          const vault = await fetchAccrualVault(address, runner, { chainId: this.chainId });
          const assetToken = await fetchToken(vault.asset, runner, { chainId: this.chainId });

          return {
            address: vault.address,
            name: vault.name,
            symbol: vault.symbol,
            asset: {
              address: vault.asset,
              symbol: assetToken.symbol,
              name: assetToken.name,
              decimals: assetToken.decimals
            },
            totalAssets: vault.totalAssets,
            totalSupply: vault.totalSupply,
            lastTotalAssets: vault.lastTotalAssets,
            fee: vault.fee,
            curator: vault.curator,
            owner: vault.owner,
            supplyQueue: vault.supplyQueue,
            withdrawQueue: vault.withdrawQueue,
            // Calculate APY from allocations if available
            estimatedApy: this.calculateEstimatedApy(vault),
            riskLevel: this.calculateRiskLevel(vault)
          };
        } catch (error) {
          logger.error(`Error fetching vault ${address}:`, error.message);
          return null;
        }
      });

      const vaults = (await Promise.all(vaultPromises)).filter(vault => vault !== null);

      return {
        success: true,
        vaults: vaults.map(vault => this.formatVaultForUSSD(vault))
      };

    } catch (error) {
      logger.error('Error fetching Morpho vaults:', error);
      return {
        success: false,
        error: 'Failed to fetch available vaults'
      };
    }
  }

  /**
   * Get specific vault details using the official SDK
   * @param {string} vaultAddress - Vault contract address
   * @returns {Promise<Object>} - Vault details
   */
  async getVaultDetails(vaultAddress) {
    try {
      const runner = { provider: this.provider };

      logger.info(`Fetching vault details for ${vaultAddress}`);

      const vault = await fetchAccrualVault(vaultAddress, runner, { chainId: this.chainId });
      const assetToken = await fetchToken(vault.asset, runner, { chainId: this.chainId });

      return {
        success: true,
        vault: {
          address: vault.address,
          name: vault.name,
          symbol: vault.symbol,
          asset: {
            address: vault.asset,
            symbol: assetToken.symbol,
            name: assetToken.name,
            decimals: assetToken.decimals
          },
          totalAssets: vault.totalAssets,
          totalSupply: vault.totalSupply,
          lastTotalAssets: vault.lastTotalAssets,
          fee: vault.fee,
          curator: vault.curator,
          owner: vault.owner,
          guardian: vault.guardian,
          feeRecipient: vault.feeRecipient,
          supplyQueue: vault.supplyQueue,
          withdrawQueue: vault.withdrawQueue,
          allocations: vault.allocations || [],
          estimatedApy: this.calculateEstimatedApy(vault),
          riskLevel: this.calculateRiskLevel(vault),
          // Additional vault metrics
          utilization: this.calculateUtilization(vault),
          tvlUsd: this.estimateTvlUsd(vault, assetToken)
        }
      };

    } catch (error) {
      logger.error(`Error getting vault details for ${vaultAddress}:`, error);
      return {
        success: false,
        error: 'Failed to fetch vault details'
      };
    }
  }

  /**
   * Get specific vault details
   * @param {string} vaultAddress - Vault contract address
   * @param {number} chainId - Chain ID
   * @returns {Promise<Object>} - Vault details
   */
  async getVaultDetails(vaultAddress, chainId = 1) {
    try {
      const query = `
        query GetVaultDetails($address: String!, $chainId: Int!) {
          vaultByAddress(address: $address, chainId: $chainId) {
            address
            symbol
            name
            asset {
              address
              symbol
              decimals
            }
            metadata {
              description
              curators {
                name
                image
                url
              }
            }
            state {
              totalAssets
              totalAssetsUsd
              totalSupply
              apy
              netApy
              sharePrice
              sharePriceUsd
              allocation {
                market {
                  uniqueKey
                  loanAsset {
                    symbol
                  }
                  collateralAsset {
                    symbol
                  }
                  state {
                    supplyApy
                    utilization
                  }
                }
                supplyAssets
                supplyAssetsUsd
                supplyCap
              }
            }
            warnings {
              type
              level
            }
          }
        }
      `;

      const result = await this.makeGraphQLRequest(query, { 
        address: vaultAddress, 
        chainId 
      });
      
      if (result.success && result.data.vaultByAddress) {
        const vault = result.data.vaultByAddress;
        
        return {
          success: true,
          vault: {
            address: vault.address,
            name: vault.name,
            symbol: vault.symbol,
            description: vault.metadata?.description || `${vault.name} Vault`,
            apy: vault.state.apy,
            netApy: vault.state.netApy,
            totalDeposits: vault.state.totalAssetsUsd,
            assetSymbol: vault.asset.symbol,
            assetAddress: vault.asset.address,
            sharePrice: vault.state.sharePrice,
            curators: vault.metadata?.curators || [],
            allocations: vault.state.allocation,
            warnings: vault.warnings || [],
            riskLevel: this.calculateRiskLevel(vault)
          }
        };
      }
      
      return {
        success: false,
        error: 'Vault not found'
      };
    } catch (error) {
      logger.error('Error getting vault details:', error);
      return {
        success: false,
        error: 'Failed to fetch vault details'
      };
    }
  }

  /**
   * Get user's vault positions using the official SDK
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<Object>} - User's vault positions
   */
  async getUserPositions(userAddress) {
    try {
      const runner = { provider: this.provider };

      logger.info(`Fetching user positions for ${userAddress}`);

      // Fetch user data across all popular vaults
      const positionPromises = this.popularVaults.map(async (vaultAddress) => {
        try {
          const vaultUser = await fetchVaultUser(vaultAddress, userAddress, runner, { chainId: this.chainId });

          // Only return positions with non-zero balance
          if (vaultUser.shares > 0n) {
            const vault = await fetchVault(vaultAddress, runner, { chainId: this.chainId });
            const assetToken = await fetchToken(vault.asset, runner, { chainId: this.chainId });

            return {
              vaultAddress: vault.address,
              vaultName: vault.name,
              vaultSymbol: vault.symbol,
              assetSymbol: assetToken.symbol,
              shares: vaultUser.shares.toString(),
              assets: vaultUser.assets.toString(),
              // Convert to human readable format
              sharesFormatted: ethers.formatUnits(vaultUser.shares, assetToken.decimals),
              assetsFormatted: ethers.formatUnits(vaultUser.assets, assetToken.decimals),
              estimatedApy: this.calculateEstimatedApy(vault)
            };
          }
          return null;
        } catch (error) {
          logger.error(`Error fetching position for vault ${vaultAddress}:`, error.message);
          return null;
        }
      });

      const positions = (await Promise.all(positionPromises)).filter(pos => pos !== null);

      return {
        success: true,
        positions
      };

    } catch (error) {
      logger.error('Error getting user vault positions:', error);
      return {
        success: false,
        error: 'Failed to fetch user positions'
      };
    }
  }

  /**
   * Calculate estimated APY from vault allocations
   * @param {Object} vault - Vault data from SDK
   * @returns {number} - Estimated APY as decimal (e.g., 0.08 for 8%)
   */
  calculateEstimatedApy(vault) {
    // This is a simplified calculation
    // In reality, you'd need to fetch market data and calculate weighted average
    // For now, return a reasonable estimate based on vault type
    if (vault.allocations && vault.allocations.length > 0) {
      // Use allocation data if available
      return 0.08; // 8% default estimate
    }

    // Fallback estimates based on vault characteristics
    if (vault.name.toLowerCase().includes('usdc')) return 0.075; // 7.5%
    if (vault.name.toLowerCase().includes('eth')) return 0.085; // 8.5%
    if (vault.name.toLowerCase().includes('weth')) return 0.085; // 8.5%

    return 0.08; // 8% default
  }

  /**
   * Calculate risk level based on vault characteristics
   * @param {Object} vault - Vault data from SDK
   * @returns {string} - Risk level (LOW, MEDIUM, HIGH)
   */
  calculateRiskLevel(vault) {
    const estimatedApy = this.calculateEstimatedApy(vault);
    const totalAssets = Number(vault.totalAssets || 0);

    // Risk assessment based on APY and TVL
    if (estimatedApy > 0.15) return 'HIGH'; // >15% APY is high risk
    if (estimatedApy > 0.10) return 'MEDIUM'; // 10-15% APY is medium risk
    if (totalAssets < 1000000) return 'MEDIUM'; // Low TVL is medium risk

    return 'LOW'; // Conservative vaults are low risk
  }

  /**
   * Calculate vault utilization rate
   * @param {Object} vault - Vault data from SDK
   * @returns {number} - Utilization rate as decimal
   */
  calculateUtilization(vault) {
    if (!vault.totalAssets || !vault.lastTotalAssets) return 0;

    const totalAssets = Number(vault.totalAssets);
    const lastTotalAssets = Number(vault.lastTotalAssets);

    if (lastTotalAssets === 0) return 0;

    return Math.min(totalAssets / lastTotalAssets, 1.0);
  }

  /**
   * Estimate TVL in USD (simplified calculation)
   * @param {Object} vault - Vault data from SDK
   * @param {Object} assetToken - Asset token data
   * @returns {number} - Estimated TVL in USD
   */
  estimateTvlUsd(vault, assetToken) {
    // This is a simplified calculation
    // In production, you'd fetch real-time prices from an oracle or price feed
    const totalAssets = Number(vault.totalAssets || 0);
    const decimals = assetToken.decimals;

    // Convert to human readable amount
    const humanReadableAmount = totalAssets / Math.pow(10, decimals);

    // Rough USD estimates (should be replaced with real price feeds)
    const priceEstimates = {
      'USDC': 1.0,
      'USDT': 1.0,
      'DAI': 1.0,
      'WETH': 3000.0,
      'ETH': 3000.0
    };

    const estimatedPrice = priceEstimates[assetToken.symbol] || 1.0;
    return humanReadableAmount * estimatedPrice;
  }

  /**
   * Format vault data for USSD display
   * @param {Object} vault - Vault data from SDK
   * @returns {Object} - Formatted vault for USSD
   */
  formatVaultForUSSD(vault) {
    const apy = this.calculateEstimatedApy(vault);
    const tvlUsd = this.estimateTvlUsd(vault, vault.asset);

    return {
      address: vault.address,
      name: vault.name.length > 25 ? vault.name.substring(0, 22) + '...' : vault.name,
      symbol: vault.symbol,
      assetSymbol: vault.asset.symbol,
      apy: `${(apy * 100).toFixed(2)}%`,
      apyDecimal: apy,
      tvl: tvlUsd > 1000000 ? `$${(tvlUsd / 1000000).toFixed(1)}M` : `$${(tvlUsd / 1000).toFixed(0)}K`,
      tvlUsd: tvlUsd,
      riskLevel: vault.riskLevel,
      curator: vault.curator,
      fee: vault.fee ? `${(Number(vault.fee) / 100).toFixed(2)}%` : '0%'
    };
  }

  /**
   * Deposit assets into a Morpho vault
   * @param {Object} depositData - Deposit parameters
   * @param {string} depositData.userAddress - User's wallet address
   * @param {string} depositData.vaultAddress - Vault contract address
   * @param {string} depositData.amount - Amount to deposit (in human readable units)
   * @param {string} depositData.privateKey - User's private key for signing
   * @returns {Promise<Object>} - Deposit transaction result
   */
  async depositToVault(depositData) {
    try {
      const { userAddress, vaultAddress, amount, privateKey } = depositData;

      // Validate required fields
      if (!userAddress || !vaultAddress || !amount || !privateKey) {
        return {
          success: false,
          error: 'Missing required fields: userAddress, vaultAddress, amount, privateKey'
        };
      }

      // Validate minimum amount
      if (parseFloat(amount) < 1) {
        return {
          success: false,
          error: 'Minimum deposit amount is 1 USDT'
        };
      }

      // Create wallet instance
      const wallet = new ethers.Wallet(privateKey, this.provider);
      const vaultContract = new ethers.Contract(vaultAddress, this.vaultABI, wallet);

      // Get vault asset details
      const assetAddress = await vaultContract.asset();
      const assetDecimals = await vaultContract.decimals();

      // Convert amount to proper decimals
      const depositAmount = ethers.parseUnits(amount.toString(), assetDecimals);

      // Preview the deposit to get expected shares
      const expectedShares = await vaultContract.previewDeposit(depositAmount);

      // Check if user has approved the vault to spend their tokens
      const ERC20_ABI = [
        'function allowance(address owner, address spender) external view returns (uint256)',
        'function approve(address spender, uint256 amount) external returns (bool)',
        'function balanceOf(address account) external view returns (uint256)'
      ];

      const assetContract = new ethers.Contract(assetAddress, ERC20_ABI, wallet);
      const currentAllowance = await assetContract.allowance(userAddress, vaultAddress);
      const userBalance = await assetContract.balanceOf(userAddress);

      // Check if user has sufficient balance
      if (userBalance < depositAmount) {
        return {
          success: false,
          error: 'Insufficient balance for deposit'
        };
      }

      // Approve if necessary
      if (currentAllowance < depositAmount) {
        logger.info(`Approving vault ${vaultAddress} to spend ${amount} tokens`);
        const approveTx = await assetContract.approve(vaultAddress, depositAmount);
        await approveTx.wait();
      }

      // Execute deposit
      logger.info(`Depositing ${amount} to vault ${vaultAddress}`);
      const depositTx = await vaultContract.deposit(depositAmount, userAddress);
      const receipt = await depositTx.wait();

      // Record investment in database
      await MorphoInvestment.create({
        user_phone: depositData.phoneNumber || 'unknown',
        vault_address: vaultAddress,
        amount_deposited: amount,
        shares_received: ethers.formatUnits(expectedShares, assetDecimals),
        transaction_hash: receipt.hash,
        status: 'completed',
        created_at: new Date()
      });

      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        depositAmount: amount,
        sharesReceived: ethers.formatUnits(expectedShares, assetDecimals),
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (error) {
      logger.error('Error depositing to Morpho vault:', error);
      return {
        success: false,
        error: error.message || 'Failed to deposit to vault'
      };
    }
  }

  /**
   * Withdraw assets from a Morpho vault
   * @param {Object} withdrawData - Withdrawal parameters
   * @param {string} withdrawData.userAddress - User's wallet address
   * @param {string} withdrawData.vaultAddress - Vault contract address
   * @param {string} withdrawData.shares - Number of shares to redeem (in human readable units)
   * @param {string} withdrawData.privateKey - User's private key for signing
   * @returns {Promise<Object>} - Withdrawal transaction result
   */
  async withdrawFromVault(withdrawData) {
    try {
      const { userAddress, vaultAddress, shares, privateKey } = withdrawData;

      // Validate required fields
      if (!userAddress || !vaultAddress || !shares || !privateKey) {
        return {
          success: false,
          error: 'Missing required fields: userAddress, vaultAddress, shares, privateKey'
        };
      }

      // Validate minimum shares
      if (parseFloat(shares) < 1) {
        return {
          success: false,
          error: 'Minimum withdrawal is 1 share'
        };
      }

      // Create wallet instance
      const wallet = new ethers.Wallet(privateKey, this.provider);
      const vaultContract = new ethers.Contract(vaultAddress, this.vaultABI, wallet);

      const decimals = await vaultContract.decimals();
      const redeemShares = ethers.parseUnits(shares.toString(), decimals);

      // Check user's share balance
      const userShares = await vaultContract.balanceOf(userAddress);

      if (userShares < redeemShares) {
        return {
          success: false,
          error: 'Insufficient shares for redemption'
        };
      }

      // Preview redemption to get expected assets
      const expectedAssets = await vaultContract.previewRedeem(redeemShares);

      // Execute redemption
      logger.info(`Redeeming ${shares} shares from vault ${vaultAddress}`);
      const redeemTx = await vaultContract.redeem(redeemShares, userAddress, userAddress);
      const receipt = await redeemTx.wait();

      // Update investment status in database
      await MorphoInvestment.updateStatus(
        withdrawData.phoneNumber || 'unknown',
        vaultAddress,
        'withdrawn'
      );

      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        sharesRedeemed: shares,
        assetsReceived: ethers.formatUnits(expectedAssets, decimals),
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (error) {
      logger.error('Error withdrawing from Morpho vault:', error);
      return {
        success: false,
        error: error.message || 'Failed to withdraw from vault'
      };
    }
  }

  /**
   * Get vault balance for a user using SDK
   * @param {string} vaultAddress - Vault contract address
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<Object>} - User's vault balance
   */
  async getVaultBalance(vaultAddress, userAddress) {
    try {
      const runner = { provider: this.provider };

      // Fetch user's vault position using SDK
      const vaultUser = await fetchVaultUser(vaultAddress, userAddress, runner, { chainId: this.chainId });
      const vault = await fetchVault(vaultAddress, runner, { chainId: this.chainId });
      const assetToken = await fetchToken(vault.asset, runner, { chainId: this.chainId });

      return {
        success: true,
        balance: {
          shares: ethers.formatUnits(vaultUser.shares, assetToken.decimals),
          assets: ethers.formatUnits(vaultUser.assets, assetToken.decimals),
          sharesRaw: vaultUser.shares.toString(),
          assetsRaw: vaultUser.assets.toString(),
          vaultSymbol: vault.symbol,
          assetSymbol: assetToken.symbol
        }
      };

    } catch (error) {
      logger.error('Error getting vault balance:', error);
      return {
        success: false,
        error: 'Failed to get vault balance'
      };
    }
  }

  /**
   * Format vaults for USSD display
   * @param {Array} vaults - Array of vault objects
   * @param {number} maxDisplay - Maximum number of vaults to display
   * @returns {Array} - Formatted vaults for USSD
   */
  formatVaultsForUSSD(vaults, maxDisplay = 5) {
    return vaults.slice(0, maxDisplay).map((vault, index) => ({
      index: index + 1,
      name: vault.name.length > 25 ? vault.name.substring(0, 22) + '...' : vault.name,
      apy: vault.apy,
      risk: vault.riskLevel,
      address: vault.address,
      asset: vault.assetSymbol,
      tvl: vault.tvl,
      fee: vault.fee
    }));
  }

  /**
   * Risk assessment for vault investments
   * @param {Object} vaultData - Vault data for risk assessment
   * @returns {Object} - Risk assessment result
   */
  assessRisk(vaultData) {
    const { apy, tvl, utilization, fee } = vaultData;

    let score = 0;
    const factors = [];

    // APY risk factor
    if (apy > 20) {
      score += 40;
      factors.push('Very high APY');
    } else if (apy > 15) {
      score += 25;
      factors.push('High APY');
    } else if (apy > 10) {
      score += 15;
      factors.push('Moderate APY');
    } else {
      score += 5;
      factors.push('Conservative APY');
    }

    // TVL risk factor
    if (tvl < 1000000) {
      score += 30;
      factors.push('Low TVL');
    } else if (tvl < 10000000) {
      score += 15;
      factors.push('Medium TVL');
    } else {
      score += 5;
      factors.push('High TVL');
    }

    // Utilization risk factor
    if (utilization > 95) {
      score += 20;
      factors.push('Very high utilization');
    } else if (utilization > 85) {
      score += 10;
      factors.push('High utilization');
    } else {
      score += 5;
      factors.push('Normal utilization');
    }

    // Fee risk factor
    if (fee > 15) {
      score += 10;
      factors.push('High fees');
    }

    // Determine risk level
    let level;
    if (score >= 70) {
      level = 'High';
    } else if (score >= 30) {
      level = 'Medium';
    } else {
      level = 'Low';
    }

    return {
      level,
      score,
      factors
    };
  }
}

module.exports = new MorphoService();
