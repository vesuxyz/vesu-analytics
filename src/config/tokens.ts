export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  deployBlock: number;
}

export const TOKENS: Token[] = [
  {
    symbol: "USDC",
    name: "USD Coin (Native CCIP)",
    address: "0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb",
    decimals: 6,
    deployBlock: 6000000,
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    address: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
    decimals: 6,
    deployBlock: 4000,
  },
  {
    symbol: "WBTC",
    name: "Wrapped BTC",
    address: "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
    decimals: 8,
    deployBlock: 4000,
  },
  {
    symbol: "solvBTC",
    name: "Solv BTC",
    address: "0x0593e034dda23eea82d2ba9a30960ed42cf4a01502cc2351dc9b9881f9931a68",
    decimals: 18,
    deployBlock: 7000000,
  },
  {
    symbol: "tBTC",
    name: "Threshold BTC",
    address: "0x04daa17763b286d1e59b97c283c0b8c949994c361e426a28f743c67bdfe9a32f",
    decimals: 18,
    deployBlock: 7000000,
  },
  {
    symbol: "LBTC",
    name: "Lombard BTC",
    address: "0x036834a40984312f7f7de8d31e3f6305b325389eaeea5b1c0664b2fb936461a4",
    decimals: 8,
    deployBlock: 7000000,
  },
  {
    symbol: "ETH",
    name: "Ether",
    address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    decimals: 18,
    deployBlock: 4000,
  },
  {
    symbol: "wstETH",
    name: "Wrapped stETH",
    address: "0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2",
    decimals: 18,
    deployBlock: 99000,
  },
  {
    symbol: "STRK",
    name: "Starknet Token",
    address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    decimals: 18,
    deployBlock: 599000,
  },
];
