import { getAddress, zeroAddress } from "viem";

/**
 * Pons v1 is the currently deployed launch protocol.
 *
 * The v2 docs explicitly state that its launch factory and remaining launch
 * stack are not deployed yet. These v1 values are public protocol constants,
 * not deployment-specific secrets, so they intentionally live in source.
 */
export const ponsV1 = {
  protocolVersion: "v1",
  chainId: 4663,
  publicRpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  explorerUrl: "https://robinhoodchain.blockscout.com",
  factory: getAddress("0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB"),
  factoryStartBlock: 8_991_118n,
  locker: getAddress("0x736D76699C26D0d966744cAe304C000d471f7F35"),
  v3Factory: getAddress("0x1f7d7550B1b028f7571E69A784071F0205FD2EfA"),
  positionManager: getAddress(
    "0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3",
  ),
  swapRouter: getAddress("0xCaf681a66D020601342297493863E78C959E5cb2"),
  quoterV2: getAddress("0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7"),
  weth: getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"),
  nativePairToken: zeroAddress,
  poolFee: 10_000,
  launchFeeEth: "0.0005",
} as const;
