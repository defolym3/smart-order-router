import { ChainId, Token } from '@defolym3/sdk-core';
import { Pair } from '@defolym3/v2-sdk';
import _ from 'lodash';

import { WRAPPED_NATIVE_CURRENCY } from '../../util/chains';
import { log } from '../../util/log';
import {
  ARB_ARBITRUM,
  DAI_ARBITRUM,
  DAI_MODE,
  USDC_ARBITRUM,
  USDC_BASE,
  USDC_BASE_SEPOLIA,
  USDC_MODE,
  USDT_ARBITRUM,
  USDT_MODE,
  WBTC_ARBITRUM,
  WBTC_MODE,
} from '../token-provider';

import { IV2SubgraphProvider, V2SubgraphPool } from './subgraph-provider';

type ChainTokenList = {
  readonly [chainId in ChainId]: Token[];
};

const BASES_TO_CHECK_TRADES_AGAINST: ChainTokenList = {
  [ChainId.OPTIMISM]: [],
  [ChainId.BASE_SEPOLIA]: [USDC_BASE_SEPOLIA, WRAPPED_NATIVE_CURRENCY[ChainId.BASE_SEPOLIA]],
  [ChainId.BASE]: [USDC_BASE, WRAPPED_NATIVE_CURRENCY[ChainId.BASE]],
  [ChainId.SCROLL_SEPOLIA]: [],
  [ChainId.SCROLL]: [],
  [ChainId.ARBITRUM]: [
    WRAPPED_NATIVE_CURRENCY[ChainId.ARBITRUM],
    WBTC_ARBITRUM,
    DAI_ARBITRUM,
    USDC_ARBITRUM,
    USDT_ARBITRUM,
    ARB_ARBITRUM,
  ],
  [ChainId.MODE]: [WRAPPED_NATIVE_CURRENCY[ChainId.MODE], WBTC_MODE, DAI_MODE, USDC_MODE, USDT_MODE],
  [ChainId.MODE_TESTNET]: [WRAPPED_NATIVE_CURRENCY[ChainId.MODE_TESTNET]],
  [ChainId.FRAX_TESTNET]: [WRAPPED_NATIVE_CURRENCY[ChainId.FRAX_TESTNET]],
};

/**
 * Provider that does not get data from an external source and instead returns
 * a hardcoded list of Subgraph pools.
 *
 * Since the pools are hardcoded, the liquidity/price values are dummys and should not
 * be depended on.
 *
 * Useful for instances where other data sources are unavailable. E.g. subgraph not available.
 *
 * @export
 * @class StaticV2SubgraphProvider
 */
export class StaticV2SubgraphProvider implements IV2SubgraphProvider {
  constructor(private chainId: ChainId) {}

  public async getPools(tokenIn?: Token, tokenOut?: Token): Promise<V2SubgraphPool[]> {
    log.info('In static subgraph provider for V2');
    const bases = BASES_TO_CHECK_TRADES_AGAINST[this.chainId];

    const basePairs: [Token, Token][] = _.flatMap(bases, (base): [Token, Token][] =>
      bases.map((otherBase) => [base, otherBase])
    );

    if (tokenIn && tokenOut) {
      basePairs.push(
        [tokenIn, tokenOut],
        ...bases.map((base): [Token, Token] => [tokenIn, base]),
        ...bases.map((base): [Token, Token] => [tokenOut, base])
      );
    }

    const pairs: [Token, Token][] = _(basePairs)
      .filter((tokens): tokens is [Token, Token] => Boolean(tokens[0] && tokens[1]))
      .filter(([tokenA, tokenB]) => tokenA.address !== tokenB.address && !tokenA.equals(tokenB))
      .value();

    const poolAddressSet = new Set<string>();

    const subgraphPools: V2SubgraphPool[] = _(pairs)
      .map(([tokenA, tokenB]) => {
        const poolAddress = Pair.getAddress(tokenA, tokenB);

        if (poolAddressSet.has(poolAddress)) {
          return undefined;
        }
        poolAddressSet.add(poolAddress);

        const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];

        return {
          id: poolAddress,
          liquidity: '100',
          token0: {
            id: token0.address,
          },
          token1: {
            id: token1.address,
          },
          supply: 100,
          reserve: 100,
          reserveUSD: 100,
        };
      })
      .compact()
      .value();

    return subgraphPools;
  }
}
