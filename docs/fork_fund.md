# Fork Mode: Funding Test Wallet

This guide explains how to fund the test wallet with ETH and AQUARI tokens when running in fork mode.

## Prerequisites

- Anvil fork running: `anvil --fork-url https://mainnet.base.org --port 8545`
- Cast CLI installed (part of Foundry)

## Addresses

| Name | Address |
|------|---------|
| **Test Wallet** (Anvil #9) | `0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199` |
| **AQUARI Token** | `0x7F0E9971D3320521Fc88F863E173a4cddBB051bA` |
| **AQUARI Owner** (Whale) | `0x187ED96248Bbbbf4D5b059187e030B7511b67801` |
| **Disperse Contract** | `0xD152f549545093347A162Dce210e7293f1452150` |

## Step 1: Fund with ETH

Use Anvil's `setBalance` RPC to directly set ETH balance:

```bash
# Set 100 ETH (0x56BC75E2D63100000 = 100 ETH in hex)
cast rpc anvil_setBalance \
  0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199 \
  0x56BC75E2D63100000 \
  --rpc-url http://localhost:8545
```

### Common ETH amounts in hex:

| Amount | Hex Value |
|--------|-----------|
| 10 ETH | `0x8AC7230489E80000` |
| 50 ETH | `0x2B5E3AF16B1880000` |
| 100 ETH | `0x56BC75E2D63100000` |
| 1000 ETH | `0x3635C9ADC5DEA00000` |

## Step 2: Fund with AQUARI Tokens

Impersonate the AQUARI owner to transfer tokens:

```bash
# Step 2a: Impersonate owner
cast rpc anvil_impersonateAccount \
  0x187ED96248Bbbbf4D5b059187e030B7511b67801 \
  --rpc-url http://localhost:8545

# Step 2b: Transfer 100,000 AQUARI to test wallet
cast send 0x7F0E9971D3320521Fc88F863E173a4cddBB051bA \
  "transfer(address,uint256)" \
  0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199 \
  100000000000000000000000 \
  --from 0x187ED96248Bbbbf4D5b059187e030B7511b67801 \
  --unlocked \
  --rpc-url http://localhost:8545

# Step 2c: Stop impersonating
cast rpc anvil_stopImpersonatingAccount \
  0x187ED96248Bbbbf4D5b059187e030B7511b67801 \
  --rpc-url http://localhost:8545
```

### Common AQUARI amounts (18 decimals):

| Amount | Wei Value |
|--------|-----------|
| 10,000 AQUARI | `10000000000000000000000` |
| 50,000 AQUARI | `50000000000000000000000` |
| 100,000 AQUARI | `100000000000000000000000` |
| 500,000 AQUARI | `500000000000000000000000` |

## Step 3: Verify Balances

```bash
# Check ETH balance
cast balance 0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199 \
  --ether \
  --rpc-url http://localhost:8545

# Check AQUARI balance
cast call 0x7F0E9971D3320521Fc88F863E173a4cddBB051bA \
  "balanceOf(address)(uint256)" \
  0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199 \
  --rpc-url http://localhost:8545
```

## Quick Copy-Paste Script

Run all funding commands at once:

```bash
#!/bin/bash
RPC="http://localhost:8545"
TEST_WALLET="0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199"
AQUARI_TOKEN="0x7F0E9971D3320521Fc88F863E173a4cddBB051bA"
OWNER="0x187ED96248Bbbbf4D5b059187e030B7511b67801"

echo "=== Funding Test Wallet ==="

# Fund ETH
echo "Setting ETH balance to 100 ETH..."
cast rpc anvil_setBalance $TEST_WALLET 0x56BC75E2D63100000 --rpc-url $RPC

# Fund AQUARI
echo "Transferring 100,000 AQUARI..."
cast rpc anvil_impersonateAccount $OWNER --rpc-url $RPC
cast send $AQUARI_TOKEN \
  "transfer(address,uint256)" \
  $TEST_WALLET \
  100000000000000000000000 \
  --from $OWNER \
  --unlocked \
  --rpc-url $RPC
cast rpc anvil_stopImpersonatingAccount $OWNER --rpc-url $RPC

# Verify
echo ""
echo "=== Final Balances ==="
echo "ETH: $(cast balance $TEST_WALLET --ether --rpc-url $RPC)"
echo "AQUARI: $(cast call $AQUARI_TOKEN 'balanceOf(address)(uint256)' $TEST_WALLET --rpc-url $RPC)"
```

## Troubleshooting

### "Insufficient balance" errors
- Ensure Anvil fork is running on port 8545
- Re-run the funding commands above

### AQUARI transfer fails
- The owner address may have changed. Find current owner:
  ```bash
  cast call 0x7F0E9971D3320521Fc88F863E173a4cddBB051bA "owner()(address)" --rpc-url http://localhost:8545
  ```
- Check owner's AQUARI balance:
  ```bash
  cast call 0x7F0E9971D3320521Fc88F863E173a4cddBB051bA "balanceOf(address)(uint256)" <OWNER_ADDRESS> --rpc-url http://localhost:8545
  ```

### Anvil not responding
- Restart Anvil: `anvil --fork-url https://mainnet.base.org --port 8545`
- Check if port 8545 is in use: `lsof -i :8545`
