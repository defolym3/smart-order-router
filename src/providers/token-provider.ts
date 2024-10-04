import { Interface } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';
import { parseBytes32String } from '@ethersproject/strings';
import { ChainId, Token } from '@defolym3/sdk-core';
import _ from 'lodash';

import { IERC20Metadata__factory } from '../types/v3/factories/IERC20Metadata__factory';
import { log, WRAPPED_NATIVE_CURRENCY } from '../util';

import { IMulticallProvider, Result } from './multicall-provider';
import { ProviderConfig } from './provider';

/**
 * Provider for getting token data.
 *
 * @export
 * @interface ITokenProvider
 */
export interface ITokenProvider {
  /**
   * Gets the token at each address. Any addresses that are not valid ERC-20 are ignored.
   *
   * @param addresses The token addresses to get.
   * @param [providerConfig] The provider config.
   * @returns A token accessor with methods for accessing the tokens.
   */
  getTokens(addresses: string[], providerConfig?: ProviderConfig): Promise<TokenAccessor>;
}

export type TokenAccessor = {
  getTokenByAddress(address: string): Token | undefined;
  getTokenBySymbol(symbol: string): Token | undefined;
  getAllTokens: () => Token[];
};

export const USDC_OPTIMISM = new Token(
  ChainId.OPTIMISM,
  '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
  6,
  'USDC',
  'USD//C'
);

// Base Tokens
export const USDC_BASE = new Token(
  ChainId.BASE,
  '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  6,
  'USDbC',
  'USD Base Coin'
);

export const DAI_BASE = new Token(
  ChainId.BASE,
  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  18,
  'DAI',
  'DAI Stablecoin'
);

// Base Goerli Tokens
export const USDC_BASE_SEPOLIA = new Token(
  ChainId.BASE_SEPOLIA,
  '0x7b4Adf64B0d60fF97D672E473420203D52562A84',
  6,
  'USDC',
  'USD Coin'
);

// Arbitrum

export const USDC_ARBITRUM = new Token(
  ChainId.ARBITRUM,
  '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
  6,
  'USDC',
  'USD//C'
);
export const USDT_ARBITRUM = new Token(
  ChainId.ARBITRUM,
  '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  6,
  'USDT',
  'Tether USD'
);
export const WBTC_ARBITRUM = new Token(
  ChainId.ARBITRUM,
  '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  8,
  'WBTC',
  'Wrapped BTC'
);
export const DAI_ARBITRUM = new Token(
  ChainId.ARBITRUM,
  '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  18,
  'DAI',
  'Dai Stablecoin'
);

export const ARB_ARBITRUM = new Token(
  ChainId.ARBITRUM,
  '0x912CE59144191C1204E64559FE8253a0e49E6548',
  18,
  'ARB',
  'Arbitrum'
);

// MODE

export const USDC_MODE = new Token(ChainId.MODE, '0xd988097fb8612cc24eeC14542bC03424c656005f', 6, 'USDC', 'USDC');
export const USDT_MODE = new Token(ChainId.MODE, '0xf0F161fDA2712DB8b566946122a5af183995e2eD', 6, 'USDT', 'Tether USD');
export const DAI_MODE = new Token(
  ChainId.MODE,
  '0xE7798f023fC62146e8Aa1b36Da45fb70855a77Ea',
  18,
  'DAI',
  'Dai Stablecoin'
);
export const WBTC_MODE = new Token(
  ChainId.MODE,
  '0xcDd475325D6F564d27247D1DddBb0DAc6fA0a5CF',
  8,
  'WBTC',
  'Wrapped BTC'
);

export class TokenProvider implements ITokenProvider {
  constructor(private chainId: ChainId, protected multicall2Provider: IMulticallProvider) {}

  private async getTokenSymbol(
    addresses: string[],
    providerConfig?: ProviderConfig
  ): Promise<{
    result: {
      blockNumber: BigNumber;
      results: Result<[string]>[];
    };
    isBytes32: boolean;
  }> {
    let result;
    let isBytes32 = false;

    try {
      result = await this.multicall2Provider.callSameFunctionOnMultipleContracts<undefined, [string]>({
        addresses,
        contractInterface: IERC20Metadata__factory.createInterface(),
        functionName: 'symbol',
        providerConfig,
      });
    } catch (error) {
      log.error({ addresses }, `TokenProvider.getTokenSymbol[string] failed with error ${error}. Trying with bytes32.`);

      const bytes32Interface = new Interface([
        {
          inputs: [],
          name: 'symbol',
          outputs: [
            {
              internalType: 'bytes32',
              name: '',
              type: 'bytes32',
            },
          ],
          stateMutability: 'view',
          type: 'function',
        },
      ]);

      try {
        result = await this.multicall2Provider.callSameFunctionOnMultipleContracts<undefined, [string]>({
          addresses,
          contractInterface: bytes32Interface,
          functionName: 'symbol',
          providerConfig,
        });
        isBytes32 = true;
      } catch (error) {
        log.fatal({ addresses }, `TokenProvider.getTokenSymbol[bytes32] failed with error ${error}.`);

        throw new Error('[TokenProvider.getTokenSymbol] Impossible to fetch token symbol.');
      }
    }

    return { result, isBytes32 };
  }

  private async getTokenDecimals(addresses: string[], providerConfig?: ProviderConfig) {
    return this.multicall2Provider.callSameFunctionOnMultipleContracts<undefined, [number]>({
      addresses,
      contractInterface: IERC20Metadata__factory.createInterface(),
      functionName: 'decimals',
      providerConfig,
    });
  }

  public async getTokens(_addresses: string[], providerConfig?: ProviderConfig): Promise<TokenAccessor> {
    const addressToToken: { [address: string]: Token } = {};
    const symbolToToken: { [symbol: string]: Token } = {};

    const addresses = _(_addresses)
      .map((address) => address.toLowerCase())
      .uniq()
      .value();

    if (addresses.length > 0) {
      const [symbolsResult, decimalsResult] = await Promise.all([
        this.getTokenSymbol(addresses, providerConfig),
        this.getTokenDecimals(addresses, providerConfig),
      ]);

      const isBytes32 = symbolsResult.isBytes32;
      const { results: symbols } = symbolsResult.result;
      const { results: decimals } = decimalsResult;

      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i]!;

        const symbolResult = symbols[i];
        const decimalResult = decimals[i];

        if (!symbolResult?.success || !decimalResult?.success) {
          log.info(
            {
              symbolResult,
              decimalResult,
            },
            `Dropping token with address ${address} as symbol or decimal are invalid`
          );
          continue;
        }

        const symbol = isBytes32 ? parseBytes32String(symbolResult.result[0]!) : symbolResult.result[0]!;
        const decimal = decimalResult.result[0]!;

        addressToToken[address.toLowerCase()] = new Token(this.chainId, address, decimal, symbol);
        symbolToToken[symbol.toLowerCase()] = addressToToken[address.toLowerCase()]!;
      }

      log.info(
        `Got token symbol and decimals for ${Object.values(addressToToken).length} out of ${
          addresses.length
        } tokens on-chain ${providerConfig ? `as of: ${providerConfig?.blockNumber}` : ''}`
      );
    }

    return {
      getTokenByAddress: (address: string): Token | undefined => {
        return addressToToken[address.toLowerCase()];
      },
      getTokenBySymbol: (symbol: string): Token | undefined => {
        return symbolToToken[symbol.toLowerCase()];
      },
      getAllTokens: (): Token[] => {
        return Object.values(addressToToken);
      },
    };
  }
}

export const DAI_ON = (chainId: ChainId): Token => {
  switch (chainId) {
    case ChainId.BASE:
      return DAI_BASE;
    case ChainId.MODE:
      return DAI_MODE;
    default:
      throw new Error(`Chain id: ${chainId} not supported`);
  }
};

export const USDT_ON = (chainId: ChainId): Token => {
  switch (chainId) {
    case ChainId.MODE:
      return USDT_MODE;
    default:
      throw new Error(`Chain id: ${chainId} not supported`);
  }
};

export const USDC_ON = (chainId: ChainId): Token => {
  switch (chainId) {
    case ChainId.BASE:
      return USDC_BASE;
    case ChainId.BASE_SEPOLIA:
      return USDC_BASE_SEPOLIA;
    case ChainId.MODE:
      return USDC_MODE;
    default:
      throw new Error(`Chain id: ${chainId} not supported`);
  }
};

export const WNATIVE_ON = (chainId: ChainId): Token => {
  return WRAPPED_NATIVE_CURRENCY[chainId];
};
