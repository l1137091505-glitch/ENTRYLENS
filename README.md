# ENTRYLENS

ENTRYLENS is an original BOT Chain account-diagnostics interface inspired by the category of ERC-4337 conformance tools. It does not copy the source design or branding of the reference site.

The interface reads a wallet or pasted address, checks BOT Chain RPC state, account bytecode, BOT balance, transaction nonce and the canonical EntryPoint v0.6/v0.7 addresses. It then creates a deterministic report fingerprint in the browser. A deployed `EntryLensRegistry` can optionally store that fingerprint and the pass count on-chain.

## Repository layout

- `frontend/` — Vite + TypeScript + ethers v6 interface
- `contracts/src/EntryLensRegistry.sol` — self-contained Solidity contract
- `contracts/build/` — ABI and bytecode compiled with Solidity 0.8.24
- `DEPLOY-ZH.md` — Chinese deployment guide
- `VERIFICATION.md` — build and quality checks

## Local development

```bash
cd frontend
npm install
npm run dev
```

Copy `.env.example` to `.env` only after the registry is deployed.

## Safety model

- Wallet discovery supports EIP-6963 and the legacy injected provider.
- Connecting requests accounts and BOT Chain switching only.
- A signature is requested only after pressing **Test signature**.
- A transaction is requested only after pressing **Record report**.
- The contract stores a hash and score, never wallet secrets or expanded check details.
- ENTRYLENS is a diagnostic interface, not an audit or formal ERC-4337 certification.
