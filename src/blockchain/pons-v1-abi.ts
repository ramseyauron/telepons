import { parseAbi } from "viem";

export const ponsV1FactoryAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address feeWallet; }",
  "struct LaunchConfig { address pairToken; uint256 graduationThreshold; int24 initialTick; uint256 supply; uint16 maxWalletBps; uint16 maxTxBps; uint32 restrictionBlocks; uint24 reservedFee; bool enabled; bool routerRequiresDeadline; }",
  "struct DexConfig { string name; address factory; address positionManager; address swapRouter; uint24 poolFee; int24 tickSpacing; bool enabled; }",
  "function launchEnabled() view returns (bool)",
  "function whitelistedLaunchers(address launcher) view returns (bool enabled)",
  "function launchFee() view returns (uint256)",
  "function launchConfigCount() view returns (uint256)",
  "function getLaunchConfig(uint256 id) view returns (LaunchConfig)",
  "function dexConfigCount() view returns (uint256)",
  "function getDexConfig(uint256 id) view returns (DexConfig)",
  "function launchToken(TokenParams params, uint256 launchConfigId, uint256 dexId, bytes32 salt) payable returns (address token)",
  "event TokenLaunched(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, address pool, uint256 dexId, uint256 launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256 initialBuyAmount)",
]);
