# Duo

**Programmable rules for XRP payments.**

Someone sends XRP from an ordinary XRPL wallet. Duo mints it as FXRP, secures the
recipient's cost of living as a stablecoin at that moment's price, and stakes
everything above it — in one transaction, triggered by that single payment.

The recipient never installs MetaMask, never holds FLR, and never leaves XRPL.

Built for **Flare Summer Signal**, Bounty 1 — Interoperable Asset Products.
Live on **Coston2**.

### It works end to end. Open these:

| | |
|---|---|
| A 40 XRP payment from an XRPL wallet | [`4EDE2F6C…`](https://testnet.xrpl.org/transactions/4EDE2F6C7E652FB8B2AC23B81924596823B6FBEACE748877FBBF7AC99FF32D99) |
| became $1.994 secured + 37.9 FXRP staked | [`0xd0dca79f…`](https://coston2-explorer.flare.network/tx/0xd0dca79f5356e6bad3b55351f619ed882e8f4146763a78563555cf18689aa4bd) |

No wallet connection. No second step. One payment.

---

## The problem

Someone paid in crypto loses money to two things that have nothing to do with
trading.

**They lose to the clock.** A client pays 300 XRP on Monday. The recipient is
busy and gets to it on Friday. It is now worth 14% less. Nothing was decided
badly — they were just busy.

**They never actually save.** Income lands in one pile, and a pile with no
divider in it gets spent. Putting some aside means learning a DeFi protocol,
which almost nobody does.

Duo removes both at the moment of receipt. It is not a wallet and not something
you open daily — it works once, when money arrives, the way a payroll deduction
does.

**Who it is for:** people whose *income* arrives in crypto — freelancers with
overseas clients, remote workers paid in crypto, small merchants accepting it.
Not traders, and not people wanting to spend crypto at a shop.

## The rule: a target in dollars, not a percentage

> Secure the first **$X**. Stake the rest.

| Payment in | Secured | Staked |
|---|---|---|
| below target | all of it | nothing |
| $311, target $200 | ~$200 | ~$111 |
| $1,039, target $200 | ~$200 | ~$839 |

A fixed percentage is wrong at both ends: it secures too little when a payment
is small, and leaves too much idle when a payment is large. Cost of living is a
fixed number, not a proportion.

This is also what makes the oracle load-bearing. A 60/40 split is arithmetic and
needs no price. **"$200 worth of FXRP" cannot be computed without one** — remove
the FTSO feed and the product stops working.

## How one XRPL payment does all of it

```
XRP payment to the FAssets Core Vault address
   memo = [0xFE][walletId][fee][keccak256(userOp)]        42 bytes
        │
        ▼
FDC attests the payment          ── XRPPayment attestation
        │
        ▼
executeDirectMintingWithData(proof, userOp)   ── permissionless; we submit it
        │
        ├─► FXRP minted into the sender's personal account on Flare
        │
        └─► handleMintedFAssets runs the memo's user operation
                 │
                 ▼
            PersonalAccount.executeUserOp([...])
                 setTarget · approve · DuoVault.split()
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
  ISwapAdapter → USDT0        Firelight → stXRP
     secured                     saving
        │                           │
        └──────► personal account ◄─┘
```

Two details that took real work to find, recorded so nobody repeats them:

- **Memo user-ops ride on an FAssets mint, not on a payment to the operator.**
  Paying the operator's XRPL address only carries the fixed 32-byte instruction
  set; custom operations reach `handleMintedFAssets` instead, which only the
  AssetManager may call. So the payment goes to the Core Vault address, and
  anyone may then submit the FDC proof — no operator dependency at all.
- **`PackedUserOperation` has nine fields, not eight.** Omitting
  `paymasterAndData` shifts every offset and the contract fails with a memory
  panic that points nowhere near the cause.

Opcode `0xFE` keeps the memo at 42 bytes by committing only to a hash, which is
what lets a three-call operation fit — inlining it (`0xFF`) exceeds the XRPL memo
limit at 1,162 bytes.

## How Duo uses Flare

Six protocols. Five of them do real work here; the sixth is ours and is
explained below.

| Protocol | What it does here |
|---|---|
| **FAssets** | Mints XRP into FXRP, directly from the payment |
| **FDC** | Attests the XRPL payment — `XRPPayment` |
| **Smart Accounts** | Every XRPL address has a personal account; the memo drives it |
| **FTSO** | Prices the split and the swap. Nothing works without it |
| **Firelight** | The savings side — ERC-4626, staked FXRP becomes stXRP |
| **Contract Registry** | Every address resolved at runtime, never hardcoded |

## Non-custodial, and checked on-chain

`split()` records its own balances on entry and asserts on exit that nothing it
handled stayed behind. If anything did, the whole payment reverts. The vault's
balances are zero right now, and you can check that yourself.

`split()` takes no arguments, deliberately. A memo commits to fixed calldata, so
one operation shape can serve every user only if the vault reads `msg.sender`
and looks up their target from storage.

## Security

Three issues were found and fixed before submission. They are listed here rather
than quietly patched, because how a team handles its own bugs says more than a
clean-looking repo.

**A griefing DoS, of our own making.** `split()` used to require the vault's
balances to be exactly zero on exit. The intent was to guarantee it never holds
anyone's money; the effect was that anyone could send one unit of FXRP to the
contract and permanently break `split()` for every user. It now compares against
the balances recorded on entry, so a stranger's dust is inert and the guarantee
is unchanged.

**An owner who could redirect funds.** The swap venue could be replaced in a
single transaction, and user funds pass through it. Replacement now requires a
two-day timelock with a public proposal and a cancel path, and slippage
tolerance is capped at 5%.

**An oracle checked for freshness but not sanity.** A broken feed could return a
fresh but absurd price. Values outside $0.01–$100 are now rejected — a wide band,
guarding against breakage rather than market moves.

Each has a test.

**One gap we found and chose not to close, with the reasoning.** The Firelight
deposit does not specify a minimum number of shares to accept. Standard practice
is to state a floor and revert below it, so an adverse rate move between reading
a price and depositing cannot quietly shortchange the user.

We left it. Firelight's exchange rate is monotonic — it only rises as yield
accrues, and after eight months on mainnet it has moved from 1.000000 to
1.000072. There is no path by which a depositor receives less than expected, so
the realistic loss is nil. Closing it would mean redeploying and re-running the
end-to-end demo, which would leave the transactions linked above pointing at a
superseded contract. That trade did not look worth making for a risk that does
not exist in practice.

It should be added before mainnet, where the calculus changes.

Still unaudited; still testnet only.

## The swap venue, stated plainly

**SparkDEX is not deployed on Coston2.** Verified, not assumed: its V3 router
address holds no code there, and Flare's own swap guide is titled *"Required
Addresses on Flare **Mainnet**"*. There is no FXRP↔stablecoin market on this
testnet for anyone to integrate with.

So `FtsoPricedSwap` fills the gap. Prices come from the same production oracle
mainnet uses, the tokens are the canonical Coston2 FXRP and USDT0 from the
official faucet, and the swaps are ordinary on-chain transactions. This is the
Peg Stability Module pattern — swapping at a reference price rather than along an
AMM curve.

**Three things we do not claim:**

1. **Third-party liquidity.** We supply it ourselves, from the faucet.
2. **Price impact.** A real AMM moves against you on size; this venue does not,
   so its output is slightly better than a real market would give.
3. **Depth.** Demos move single-digit dollars on the secured side because the
   faucet grants 10 USDT0 per day. The savings side has no such limit.

**This resolves on mainnet, and the work is already done.** `SparkDexAdapter`
implements the same `ISwapAdapter` interface and passes tests against the real
mainnet pool — 222k FXRP and 176k USDT0 at fee tier 500, pinned at block
67,240,000. Moving over swaps one component; DuoVault does not change. We will
deploy there once funded.

## What was built during the program

All of it. This repository was empty at the start.

`DuoVault` · `SplitMath` · `FtsoPriceReader` · `ISwapAdapter` +
`FtsoPricedSwap` + `SparkDexAdapter` · Firelight integration · the XRPL trigger
path (memo encoding, FDC attestation, direct minting) · the read-only dashboard ·
27 tests.

## Tests

```bash
npm install
npx hardhat test
```

**Unit** — the split rule, including a rounding invariant across 120 input
combinations: the two portions always sum to exactly the amount in.

**Fork** — the full flow against a local fork of Flare Mainnet: the real FXRP
token, the real Firelight vault holding 58M FXRP, and the production FTSO oracle.
A 500 FXRP payment against a $200 target secured 199.4 USDT0 and staked 302.9
FXRP. Plus the three security fixes, including running the dust attack and
showing the product survives it.

Forking reads mainnet state and executes locally. No transaction is broadcast and
no gas is spent. Flare Mainnet is deliberately absent from `hardhat.config.ts` —
with no account configured for it, broadcasting there is impossible.

## Limitations

- **Unaudited.** Never put real funds in this.
- **Testnet only**, so tokens have no value and Firelight pays no yield — the
  Coston2 vault rate is exactly 1.000000. The dashboard shows that real number
  and puts the live mainnet rate beside it, labelled as mainnet's, rather than
  inventing an APY.
- **Withdrawal takes up to two periods.** Firelight processes withdrawals per
  period and queued our request into the *following* period, not the current one.
  The UI says "up to 2 periods" because that is what happened.
- **The swap venue is ours**, as described above.
- **No users.** Built from an empty repository by one person.

## Next steps

1. **Mainnet**, where SparkDEX has real depth and the adapter is already
   fork-tested against it.
2. **Monthly targets** rather than per-payment — once the month's needs are met,
   everything after goes straight to savings.
3. **More rules.** Splitting is the first one; the mechanism is general.

## Deployed on Coston2

| Contract | Address |
|---|---|
| DuoVault | [`0x5432dbfa90000D7C7A66d41337B50F15Dd4357f7`](https://coston2-explorer.flare.network/address/0x5432dbfa90000D7C7A66d41337B50F15Dd4357f7) |
| FtsoPricedSwap | [`0xb1b7fB2C4C9C6A1fD8AEde95b16acD93889A1C47`](https://coston2-explorer.flare.network/address/0xb1b7fB2C4C9C6A1fD8AEde95b16acD93889A1C47) |
| FtsoPriceReader | [`0x5eC0dbad41BfFba0e7acbf6985041D31CA72209D`](https://coston2-explorer.flare.network/address/0x5eC0dbad41BfFba0e7acbf6985041D31CA72209D) |

| What | Transaction |
|---|---|
| XRPL payment → mint → split, 40 XRP | [XRPL `4EDE2F6C…`](https://testnet.xrpl.org/transactions/4EDE2F6C7E652FB8B2AC23B81924596823B6FBEACE748877FBBF7AC99FF32D99) → [Flare `0xd0dca79f…`](https://coston2-explorer.flare.network/tx/0xd0dca79f5356e6bad3b55351f619ed882e8f4146763a78563555cf18689aa4bd) |
| The same flow, 20 XRP, on the pre-fix contracts | [XRPL `C024BF86…`](https://testnet.xrpl.org/transactions/C024BF86441E2C23E67946741D73ACE52B21CD443BB72F88B9F877E7DBF28775) → [Flare `0xf668abc9…`](https://coston2-explorer.flare.network/tx/0xf668abc9bbd73faf18df31cbaee0606a4c88e830ec0d3da6d12cacabe10888f3) |

## Running it yourself

```bash
npm install
cp .env.example .env          # add a testnet key; never a real one
npx hardhat test
npx hardhat run scripts/deploy.coston2.ts --network coston2

# the full XRPL flow
XRP_AMOUNT=40 TARGET_USD=2 node scripts/directMint/1-sendPayment.mjs
node scripts/directMint/2-getProof.mjs      # waits for the FDC round
node scripts/directMint/3-execute.mjs
```

Dashboard:

```bash
cd frontend && npm install && npm run dev
```

C2FLR, FXRP, and USDT0 from the [Coston2 faucet](https://faucet.flare.network/coston2);
testnet XRP from the [XRPL faucet](https://faucet.altnet.rippletest.net/accounts).

## License

MIT
