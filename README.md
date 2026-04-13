# vesu-analytics

Analytics dashboard for the Vesu lending protocol on Starknet.

## Pages

- **Positions** — All open borrow/multiply positions with sorting and filtering
- **Debt & Caps** — Total debt and debt caps per lending pair across active pools
- **Risk** — Debt and positions at risk of liquidation by collateral price drop, with distribution charts
- **Top Holders** — Top holders of major Starknet assets (USDC, USDT, WBTC, solvBTC, tBTC, LBTC, ETH, wstETH, STRK)

## Setup

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local` and set your Alchemy RPC URL:

```
ALCHEMY_RPC_URL=https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/YOUR_API_KEY
```

## Index holders

The top holders page requires a pre-built snapshot of Transfer events. Run the indexer script to generate it:

```bash
npx tsx scripts/index-holders.ts
```

This scans all Transfer events for each token and writes the top 500 holders per token to `src/data/holders-snapshot.json`. The app then only needs to scan new blocks from the snapshot's last indexed block.

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Token addresses

Token contract addresses are configured in `src/config/tokens.ts`.
