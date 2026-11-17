# Ammora Pool Watch

Ammora Pool Watch is a read-only live dashboard for Ammora Season 2 contracts on the GIWA Sepolia testnet (chain ID **91342**), built for the **Ammora Season 2 Builder mission**. It reads the tAMM token, the swap pool’s live quotes (`quoteExactIn`), curve status, the GIWA ETH vault total, and the staking period end directly from on-chain contracts via ethers.js and the public GIWA Sepolia RPC.

## Contracts read

| Contract | Address |
| --- | --- |
| tAMM token | `0x10B3Cc2fc981277Ada576891CF649D0ABA768B06` |
| Pool | `0x1EF92A6a9BB4bBed2b385Dd5E688F88e7965BCf8` |
| Curve | `0x1FD82a1BeAff168BdeFC790EB0f1A50f7C53b978` |
| Vault | `0x016e6B1c6e73152eA8C33CDA7D960D08608f7c4b` |
| Staking | `0x091d0B15121DD466e67DBE080E62C30D05b93C27` |

## Run it

Open `index.html` in a browser, or serve the folder with any static server. For example, run this command from the app folder:

```bash
python3 -m http.server
```

Then open [http://localhost:8000](http://localhost:8000).

There is no build step, no keys are required, and the app is read-only. Optional wallet connect switches reads to the injected provider.

## Tech

Vanilla HTML/CSS/JS with ethers.js v6 loaded from a CDN.

Code generated with Codex (Xingchi gpt-6-astra).

## Disclaimer

This is a testnet demo and is not affiliated with Ammora or Dunamu. Data is read live from the testnet RPC.
