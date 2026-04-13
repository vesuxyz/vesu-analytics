// Known address labels for Starknet mainnet.
// Keys are normalized: lowercase, no leading zeros after 0x.

const ADDRESS_LABELS: Record<string, string> = {
  // Ekubo
  "0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b": "Ekubo Core",
  "0x2e0af29598b407c8716b17f6d2795eca1b471413fa03fb145a5e33722184067": "Ekubo Positions",
  "0x199741822c2dc722f6f605204f35e56dbc23bceed54818168c4c49e4fb8737e": "Ekubo Router",
  "0x4505a9f06f2bd639b6601f37a4dc0908bb70e8e0e0c34b1220827d64f4fc066": "Ekubo Router V3",
  "0x3266fe47923e1500aec0fa973df8093b5850bbce8dcd0666d3f47298b4b806e": "Ekubo Router V2.0.1",
  "0x10c7eb57cbfeb18bde525912c1b6e9a7ebb4f692e0576af1ba7be8b3b9a70f6": "Ekubo Router V2",
  "0x1b6f560def289b32e2a7b0920909615531a4d9d5636ca509045843559dc23d5": "Ekubo Router V1",
  "0x43e4f09c32d13d43a880e85f69f7de93ceda62d6cf2581a582c6db635548fdc": "Ekubo TWAMM",
  "0x50ed6ab03aef492cd062e25facf40ceef63294c53d12b514226f8fb4753266e": "Ekubo Limit Orders",
  "0x7b696af58c967c1b14c9dde0ace001720635a660a8e90c565ea459345318b30": "Ekubo Positions NFT",
  "0xf2e9a400ba65b13255ef2792612b45d5a20a7a7cf211ffb3f485445022ef72": "Ekubo Revenue Buybacks",

  // Vesu
  "0xd8d6dfec4d33bfb6895de9f3852143a17c6f92fd2a21da3d6924d34870160": "Vesu Singleton",
  "0x4e06e04b8d624d039aa1c3ca8e0aa9e21dc1ccba1d88d0d650837159e0ee054": "Vesu Extension",
  "0x3976cac265a12609934089004df458ea29c776d77da423c96dc761d09d24124": "Vesu Re7 USDC Core",
  "0x451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5": "Vesu Prime",
  "0x2eef0c13b10b487ea5916b54c0a7f98ec43fb3048f60fdeedaf5b08f6f88aaf": "Vesu Re7 USDC Prime",
  "0x3a8416bf20d036df5b1cf3447630a2e1cb04685f6b0c3a70ed7fb1473548ecf": "Vesu Re7 xBTC",
  "0x73702fce24aba36da1eac539bd4bae62d4d6a76747b7cdd3e016da754d7a135": "Vesu Re7 USDC Stable Core",
  "0x1bc5de51365ed7fbb11ebc81cef9fd66b70050ec10fd898f0c4698765bf5803": "Vesu Clearstar USDC Reactor",
  "0x635cb8ba1c3b0b21cb2056f6b1ba75c3421ce505212aeb43ffd56b58343fa17": "Vesu Re7 ETH",

  // zkLend
  "0x4c0a5193d58f74fbace4b74dcf65481e734ed1714121bdc571da345540efa05": "zkLend Markets",
  "0x47ad51726d891f972e74e4ad858a261b43869f7126ce7436ee0b2529a98f486": "zkLend zUSDC",
  "0x811d8da5dc8a2206ea7fd0b28627c2d77280a515126e62baa4d78e22714c4a": "zkLend zUSDT",
  "0x2b9ea3acdb23da566cee8e8beae3125a1458e720dea68c4a9a7a2d8eb5bbb4a": "zkLend zWBTC",
  "0x1b5bd713e72fdc5d63ffd83762f81297f6175a5e0a4771cdadbc1dd5fe72cb1": "zkLend zETH",
  "0x536aa7e01ecc0235ca3e29da7b5ad5b12cb881e29034d87a4290edbb20b7c28": "zkLend zwstETH",
  "0x6d8fa671ef84f791b7f601fa79fea8f6ceb70b5fa84189e3159d532162efc21": "zkLend zSTRK",

  // AVNU
  "0x1114c7103e12c2b2ecbd3a2472ba9c48ddcbf702b1c242dd570057e26212111": "AVNU Exchange",

  // StarkGate bridges
  "0x73314940630fd6dcda0d772d4c972c4e0a9946bef9dabf4ef84eda8ef542b82": "StarkGate ETH Bridge",
  "0x74761a8d48ce002963002becc6d9c3dd8a2a05b1075d55e5967f42296f16bd0": "StarkGate USDT Bridge",
  "0x5cd48fccbfd8aa2773fe22c217e808319ffcc1c5a6a463f7d8fa2da48218196": "StarkGate USDC Bridge",
  "0x7aeec4870975311a7396069033796b61cd66ed49d22a786cba12a8d76717302": "StarkGate WBTC Bridge",
  "0x594c1582459ea03f77deaf9eb7e3917d6994a03c13405ba42867f83d85f085d": "StarkGate STRK Bridge",

  // Token contracts (holding own supply)
  "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d": "STRK Token",
  "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7": "ETH Token",
  "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8": "USDC.e Token",
  "0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8": "USDT Token",
  "0x42b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2": "wstETH Token",

  // Staking contract
  "0xca1702e64c81d9a07b86bd2c540188d92a2c73cf5cc0e508d949015e7e84a7": "Starknet Staking Contract",
  "0x356f304b154d29d2a8fe22f1cb9107a9b564a733cf6b4cc47fd121ac1af90c9": "sSTRK (Staked STRK)",
  "0x28d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a": "Endur xSTRK",
  "0x9035556d1ee136e7722ae4e78f92828553a45eed3bc9b2aba90788ec2ca112": "Staking Reward Supplier",
  "0xca1705e74233131dbcdee7f1b8d2926bf262168c7df339004b3f46015b6984": "Staking Minting Curve",
  "0x782f0ddca11d9950bc3220e35ac82cf868778edb67a5e58b39838544bc4cd0f": "vSTRK",

  // STRK Delegation Pools
  "0x32cfb78d9f64ece832b7f868253c232f085a374365d0ed859ee0164a2ac0588": "Staking Delegation Pool",
  "0x1f00f5e628cdf81c65226a74987b8ee59ced78a0c3908c4d4bab5f106a46f41": "Staking Delegation Pool",
  "0x2381559f559bf77293f0be0b23feacd6191cc020f47fa447e98e6e72f072477": "Staking Delegation Pool",
  "0x10ffe037520e3be96f2ce5bdc3a9eddf1d93d2079ad6e8eac90c16beb9a25dc": "Staking Delegation Pool",
  "0x294e0596df21f2eb007a898cc1492a58aaee07de9ffcb95532dc0182153397d": "Staking Delegation Pool",
  "0x48f1578bdca1a208441e1c58982c2789c8d3a4e7f56690bb8f1838db439d0dc": "Staking Delegation Pool",
  "0x7cd27e1bdf49de6b681eea2d53948b182f61e96b4942e718c29ab13b51e2dc2": "Staking Delegation Pool",
  "0x61f480d8ecf999d88208124a89a5186f8c85d1c9e09d2295e030167e5a51623": "Staking Delegation Pool",
  "0x70768d92015d43c4ca1dfd7f3093b5fb0d45ae11902c9a44d6e38699a9a03ad": "Staking Delegation Pool",
  "0x4d5c8f592b88693fde5e3e508fd20b1079fca3063570f97f41ea5b6810a4dc0": "Staking Delegation Pool",
  "0x6262a22f80cc8b4fa73f7a38c5ea437c0a6d2f0c24ea27061ff032386ea294f": "Staking Delegation Pool",

  // Nostra
  "0x6b34e1a07d5a51289c24e3ab0c27ac1b10358e67a0e2a7b34c47e2e18753d5b": "Nostra iUSDC",
  "0x7e2a13b40fc1119ec55e0bcf9428eedaa581ab3c924561ad4e955f95da63138": "Nostra iUSDT",
  "0x2530a305dd3d92aad5cf97a6a2571f8f0f88d0bbb88ea2a3a100c04c7bde0b": "Nostra iETH",
  "0x7170f54dd61ae85377f75131359e3f4a12677589bb7ec5d5f660c0a2bfc31ea": "Nostra iwstETH",
  "0x348cc417a04991964b09f9acc22b69a96e1e16c3ba31a0df07a50c70dcba04d": "Nostra iWBTC",
  "0x5eb6de9c7461b3270d029f00046c8a10d27d4f4a4c931a4ea9769c72ef4edbb": "Nostra dUSDC",
  "0x1ac0577b04ea3c0babb5c1a02a6f90a3aae8aa0fb2bba884aa9fad2bc3d4b05": "Nostra dUSDT",
  "0x2c6649e5fe97f2f3b1063c9f6e3d9f3b84e25e9e9bc9bfe69c5ca0d98c7ab8": "Nostra dETH",
  "0x3e877af736e6d4a9de1b33bfed2fc4e4cfeb3e2f80a155e87b46c5fad02ed4b": "Nostra dWBTC",

  // Extended Perps DEX
  "0x62da0780fae50d68cecaa5a051606dc21217ba290969b302db4dd99d2e9b470": "Extended Vault",
  "0x1cbf691d7600fb731530b6710f8b0d11532089b7d68036570c1e0aa08d97bda": "Extended Deposit",

  // Orbiter Bridge
  "0x6831deb151bb12e0f0b8824a80c4e28e4c44c0c7c048e0d278c98bfb77d6667": "Orbiter Bridge",

  // LayerSwap
  "0x19252b1deef483477c4d30cfcc3e5ed9c82fafea44669c182a45a01b4fdb97a": "LayerSwap",

  // Starknet Foundation
  "0x7fa3e9ef41cb56f866bc81f2de468ab6b2a946d0ec7d2b224d40070743aa8f6": "Starknet Foundation",
  "0x782897323eb2eeea09bd4c9dd0c6cc559b9452cdddde4dd26b9bbe564411703": "Starknet Foundation",

  // Cartridge
  "0x18c51fe096b48d6e8a797825194d86935cb883576bb086001ee4d49fa951719": "Cartridge",
};

// Wallet type labels (Braavos, Ready, etc.) for addresses without a protocol label.
import walletTypes from "@/data/wallet-types.json";

const WALLET_TYPES: Record<string, string> = walletTypes;

export function getAddressLabel(address: string): string | null {
  const stripped = address.toLowerCase().replace(/^0x0*/, "");
  const normalized = "0x" + (stripped || "0");
  const walletType = WALLET_TYPES[normalized];
  return ADDRESS_LABELS[normalized] ?? (walletType ? `${walletType} Wallet` : null);
}
