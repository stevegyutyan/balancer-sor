// testing multi-hop
import { expect, assert } from 'chai';
import 'mocha';
const sor = require('../src');
const BigNumber = require('bignumber.js');
const { ethers, utils } = require('ethers');
const allPools = require('./allPools.json');
import { Pool } from '../src/direct/types';
import { BONE, calcOutGivenIn, calcInGivenOut } from '../src/bmath';

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F'; // DAI
const ANT = '0x960b236A07cf122663c4303350609A66A7B288C0';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const MKR = '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2';

BigNumber.config({
    EXPONENTIAL_AT: [-100, 100],
    ROUNDING_MODE: BigNumber.ROUND_HALF_EVEN,
    DECIMAL_PLACES: 18,
});

export function bnum(val: string | number): any {
    return new BigNumber(val.toString());
}

describe('Multihop Tests Mainnet Data', () => {
    it('getPools timer check', async () => {
        console.time('getPools');
        await sor.getPools();
        console.timeEnd('getPools');
    });

    it('Saved pool check', async () => {
        // Compares saved pools @25/05/20 to current Subgraph pools.
        //const sg = await sor.getPools();
        //expect(allPools).to.eql(sg)
        assert.equal(allPools.pools.length, 57, 'Should be 57 pools');
    });

    it('filterPoolsWithTokens - WETH/ANT Pools', async () => {
        const allPoolsReturned = allPools; // Replicated sor.getPools() call
        console.time('filterPoolsWithTokens');
        const directPools = sor.filterPoolsWithTokens(
            allPoolsReturned,
            WETH,
            ANT
        );
        console.timeEnd('filterPoolsWithTokens');
        assert.equal(
            Object.keys(directPools).length,
            0,
            'Should have 0 direct pools'
        );
    });

    it('filterPoolsWithTokens - WETH/DAI Pools', async () => {
        const allPoolsReturned = allPools; // Replicated sor.getPools() call
        console.time('filterPoolsWithTokens');
        let directPools = sor.filterPoolsWithTokens(
            allPoolsReturned,
            WETH,
            DAI
        );
        console.timeEnd('filterPoolsWithTokens');
        assert.equal(
            Object.keys(directPools).length,
            9,
            'Should have 9 direct pools'
        );
        directPools = sor.filterPoolsWithTokens(allPoolsReturned, DAI, WETH);
        assert.equal(
            Object.keys(directPools).length,
            9,
            'Should have 9 direct pools'
        );
    });

    it('Get multihop pools - WETH>DAI', async () => {
        const allPoolsReturned = allPools; // Replicated sor.getPools() call

        console.time('getMultihopPoolsWithTokens');
        let mostLiquidPoolsFirstHop, mostLiquidPoolsSecondHop, hopTokens;
        [
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens,
        ] = await sor.getMultihopPoolsWithTokens(WETH, DAI);
        console.timeEnd('getMultihopPoolsWithTokens');

        const directPools = await sor.filterPoolsWithTokens(
            allPoolsReturned,
            WETH,
            DAI
        );

        console.time('parsePoolData');
        let pools, pathData;
        [pools, pathData] = sor.parsePoolData(
            directPools,
            WETH,
            DAI,
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens
        );
        console.timeEnd('parsePoolData');

        assert.equal(
            mostLiquidPoolsFirstHop.length,
            4,
            'Should have 4 mostLiquidPoolsFirstHop'
        );
        assert.equal(
            mostLiquidPoolsSecondHop.length,
            4,
            'Should have 4 mostLiquidPoolsSecondHop'
        );
        assert.equal(hopTokens.length, 4, 'Should have 4 hopTokens');
        assert.equal(
            Object.keys(pools).length,
            15,
            'Should have 15 multi-hop pools'
        );
    });

    it('Full Multihop SOR, WETH>DAI, swapExactIn', async () => {
        const amountIn = new BigNumber(1).times(BONE);
        console.time('FullMultiHopExactIn');
        const allPoolsReturned = allPools; // Replicated sor.getPools() call
        const directPools = await sor.filterPoolsWithTokens(
            allPoolsReturned,
            WETH,
            DAI
        );

        let mostLiquidPoolsFirstHop, mostLiquidPoolsSecondHop, hopTokens;
        [
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens,
        ] = await sor.getMultihopPoolsWithTokens(WETH, DAI);

        let pools, pathData;
        [pools, pathData] = sor.parsePoolData(
            directPools,
            WETH.toLowerCase(), // TODO - Why is this required????
            DAI.toLowerCase(),
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens
        );

        console.time('smartOrderRouterMultiHop');
        const [sorSwaps, totalReturn] = sor.smartOrderRouterMultiHop(
            pools,
            pathData,
            'swapExactIn',
            amountIn,
            4,
            new BigNumber(0)
        );
        console.timeEnd('smartOrderRouterMultiHop');

        console.timeEnd('FullMultiHopExactIn');

        assert.equal(sorSwaps.length, 3, 'Should have 3 swaps.');
        // ADD SWAP CHECK
        assert.equal(
            utils.formatEther(totalReturn.toString()),
            '201.652150308445186064',
            'Total Out Should Match'
        );
    });

    it('Full Multihop SOR, WETH>DAI, swapExactOut', async () => {
        const amountOut = new BigNumber(1000).times(BONE);
        console.time('FullMultiHopExactOut');

        const allPoolsReturned = allPools; // Replicated sor.getPools() call
        const directPools = await sor.filterPoolsWithTokens(
            allPoolsReturned,
            WETH,
            DAI
        );

        let mostLiquidPoolsFirstHop, mostLiquidPoolsSecondHop, hopTokens;
        [
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens,
        ] = await sor.getMultihopPoolsWithTokens(WETH, DAI);

        let pools, pathData;
        [pools, pathData] = sor.parsePoolData(
            directPools,
            WETH.toLowerCase(), // TODO - Why is this required????
            DAI.toLowerCase(),
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens
        );

        const [sorSwaps, totalReturn] = sor.smartOrderRouterMultiHop(
            pools,
            pathData,
            'swapExactOut',
            amountOut,
            4,
            new BigNumber(0)
        );
        console.timeEnd('FullMultiHopExactOut');

        assert.equal(sorSwaps.length, 3, 'Should have 3 swaps.');
        // ADD SWAP CHECK
        assert.equal(
            utils.formatEther(totalReturn.toString()),
            '4.990459263211325501',
            'Total Out Should Match'
        );
    });

    it('Full Multihop SOR, WETH>ANT, swapExactIn', async () => {
        const amountIn = new BigNumber(1).times(BONE);
        console.time('FullMultiHopExactIn');
        const allPoolsReturned = allPools; // Replicated sor.getPools() call
        const directPools = await sor.filterPoolsWithTokens(
            allPoolsReturned,
            WETH,
            ANT
        );

        let mostLiquidPoolsFirstHop, mostLiquidPoolsSecondHop, hopTokens;
        [
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens,
        ] = await sor.getMultihopPoolsWithTokens(WETH, ANT);

        let pools, pathData;
        [pools, pathData] = sor.parsePoolData(
            directPools,
            WETH.toLowerCase(), // TODO - Why is this required????
            ANT.toLowerCase(),
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens
        );

        console.time('smartOrderRouterMultiHop');
        const [sorSwaps, totalReturn] = sor.smartOrderRouterMultiHop(
            pools,
            pathData,
            'swapExactIn',
            amountIn,
            4,
            new BigNumber(0)
        );
        console.timeEnd('smartOrderRouterMultiHop');

        console.timeEnd('FullMultiHopExactIn');

        assert.equal(
            Object.keys(directPools).length,
            0,
            'Should be no direct pools.'
        );
        assert.equal(sorSwaps.length, 0, 'Should have 0 swaps.');
        assert.equal(
            utils.formatEther(totalReturn.toString()),
            '0.0',
            'Total Out Should Match'
        );
    });

    it('Full Multihop SOR, WETH>ANT, swapExactOut', async () => {
        const amountOut = new BigNumber(1000).times(BONE);

        console.time('FullMultiHopExactOut');
        const allPoolsReturned = allPools; // Replicated sor.getPools() call
        const directPools = await sor.filterPoolsWithTokens(
            allPoolsReturned,
            WETH,
            ANT
        );

        let mostLiquidPoolsFirstHop, mostLiquidPoolsSecondHop, hopTokens;
        [
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens,
        ] = await sor.getMultihopPoolsWithTokens(WETH, ANT);

        let pools, pathData;
        [pools, pathData] = sor.parsePoolData(
            directPools,
            WETH.toLowerCase(), // TODO - Why is this required????
            ANT.toLowerCase(),
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens
        );

        console.time('smartOrderRouterMultiHop');
        const [sorSwaps, totalReturn] = sor.smartOrderRouterMultiHop(
            pools,
            pathData,
            'swapExactOut',
            amountOut,
            4,
            new BigNumber(0)
        );
        console.timeEnd('smartOrderRouterMultiHop');

        console.timeEnd('FullMultiHopExactOut');

        assert.equal(
            Object.keys(directPools).length,
            0,
            'Should be no direct pools.'
        );
        assert.equal(sorSwaps.length, 0, 'Should have 0 swaps.');
        assert.equal(
            utils.formatEther(totalReturn.toString()),
            '0.0',
            'Total Out Should Match'
        );
    });

    it('Full Multihop SOR, USDC>MKR, swapExactIn', async () => {
        const amountIn = new BigNumber('1000000'); // 1 USDC

        console.time('FullMultiHopExactIn');
        const allPoolsReturned = allPools; // Replicated sor.getPools() call
        const directPools = await sor.filterPoolsWithTokens(
            allPoolsReturned,
            USDC,
            MKR
        );

        let mostLiquidPoolsFirstHop, mostLiquidPoolsSecondHop, hopTokens;
        [
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens,
        ] = await sor.getMultihopPoolsWithTokens(USDC, MKR);

        let pools, pathData;
        [pools, pathData] = sor.parsePoolData(
            directPools,
            USDC.toLowerCase(), // TODO - Why is this required????
            MKR.toLowerCase(),
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens
        );

        console.time('smartOrderRouterMultiHop');
        const [sorSwaps, totalReturn] = sor.smartOrderRouterMultiHop(
            pools,
            pathData,
            'swapExactIn',
            amountIn,
            4,
            new BigNumber(0)
        );
        console.timeEnd('smartOrderRouterMultiHop');
        console.timeEnd('FullMultiHopExactIn');

        console.log(utils.formatEther(totalReturn.toString()));

        assert.equal(
            Object.keys(directPools).length,
            0,
            'Should be no direct pools.'
        );
        assert.equal(sorSwaps.length, 2, 'Should have 2 swaps.');
        assert.equal(
            utils.formatEther(totalReturn.toString()),
            '0.002912754779389279',
            'Total Out Should Match'
        );
    });

    it('Full Multihop SOR, USDC>MKR, swapExactOut', async () => {
        const amountOut = new BigNumber(10).times(BONE);

        console.time('FullMultiHopExactOut');
        const allPoolsReturned = allPools; // Replicated sor.getPools() call
        const directPools = await sor.filterPoolsWithTokens(
            allPoolsReturned,
            USDC,
            MKR
        );

        let mostLiquidPoolsFirstHop, mostLiquidPoolsSecondHop, hopTokens;
        [
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens,
        ] = await sor.getMultihopPoolsWithTokens(USDC, MKR);

        let pools, pathData;
        [pools, pathData] = sor.parsePoolData(
            directPools,
            USDC.toLowerCase(), // TODO - Why is this required????
            MKR.toLowerCase(),
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens
        );

        console.time('smartOrderRouterMultiHop');
        const [sorSwaps, totalReturn] = sor.smartOrderRouterMultiHop(
            pools,
            pathData,
            'swapExactOut',
            amountOut,
            4,
            new BigNumber(0)
        );
        console.timeEnd('smartOrderRouterMultiHop');
        console.timeEnd('FullMultiHopExactOut');

        console.log(utils.formatEther(totalReturn.toString()));

        assert.equal(
            Object.keys(directPools).length,
            0,
            'Should be no direct pools.'
        );
        assert.equal(sorSwaps.length, 2, 'Should have 2 swaps.');
        assert.equal(
            utils.formatEther(totalReturn.toString()),
            '0.000000003581475621',
            'Total Out Should Match'
        );
    });
});