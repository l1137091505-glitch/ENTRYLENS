import { BrowserProvider, Contract, JsonRpcProvider, formatEther, getAddress, id, isAddress } from 'ethers'
import './style.css'

const BOT_CHAIN = {
  chainId: '0x2a5',
  chainName: 'BOT Chain',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: ['https://rpc.botchain.ai'],
  blockExplorerUrls: ['https://scan.botchain.ai'],
}

const ENTRYPOINTS = [
  { label: 'EntryPoint v0.6', address: '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789' },
  { label: 'EntryPoint v0.7', address: '0x00000000071727de22e5e9d8baf0e7f49efd74c8' },
]

const REGISTRY_ABI = [
  'function recordReport(bytes32 reportHash,uint8 passed,uint8 total,string clientLabel) returns (uint256)',
  'function recordCount() view returns (uint256)',
  'function records(uint256) view returns (address reporter,bytes32 reportHash,uint8 passed,uint8 total,uint64 timestamp,string clientLabel)',
  'event ReportRecorded(uint256 indexed recordId,address indexed reporter,bytes32 indexed reportHash,uint8 passed,uint8 total,uint64 timestamp,string clientLabel)',
]

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>
  on?(event: string, listener: (...args: unknown[]) => void): void
  removeListener?(event: string, listener: (...args: unknown[]) => void): void
}

type WalletInfo = {
  uuid: string
  name: string
  icon?: string
  rdns?: string
  provider: Eip1193Provider
}

type CheckState = 'pass' | 'warn' | 'fail' | 'idle'
type Check = { key: string; label: string; detail: string; state: CheckState }

const checks: Check[] = [
  { key: 'rpc', label: 'BOT Chain RPC', detail: 'Waiting for a scan.', state: 'idle' },
  { key: 'network', label: 'Wallet network', detail: 'Connect a wallet to compare chain IDs.', state: 'idle' },
  { key: 'account', label: 'Account format', detail: 'No account selected.', state: 'idle' },
  { key: 'code', label: 'Contract bytecode', detail: 'Detects EOA or smart account code.', state: 'idle' },
  { key: 'balance', label: 'Native balance', detail: 'Reads BOT balance without spending it.', state: 'idle' },
  { key: 'ep06', label: 'EntryPoint v0.6', detail: 'Checks whether code exists on BOT Chain.', state: 'idle' },
  { key: 'ep07', label: 'EntryPoint v0.7', detail: 'Checks whether code exists on BOT Chain.', state: 'idle' },
  { key: 'nonce', label: 'Transaction nonce', detail: 'Reads the account transaction count.', state: 'idle' },
  { key: 'signature', label: 'Wallet signature', detail: 'Optional. Run only when you choose.', state: 'idle' },
  { key: 'registry', label: 'Report registry', detail: 'Checks the configured registry contract.', state: 'idle' },
]

const state = {
  wallets: new Map<string, WalletInfo>(),
  wallet: null as WalletInfo | null,
  account: '',
  lastReportHash: '',
  lastPassed: 0,
  scanning: false,
}

const registryAddress = (import.meta.env.VITE_ENTRYLENS_ADDRESS || '').trim()
const rpc = new JsonRpcProvider(BOT_CHAIN.rpcUrls[0], 677)

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="nav">
    <a class="skip-link" href="#scan">Skip to account scan</a>
    <a class="brand" href="#top" aria-label="ENTRYLENS home">
      <svg class="brand__mark" viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="18"/><circle cx="21" cy="21" r="10"/><path d="M21 3v8M39 21h-8M21 39v-8M3 21h8"/></svg>
      <span>ENTRYLENS</span>
    </a>
    <nav class="nav__links" aria-label="Main navigation">
      <a href="#method">Method</a>
      <a href="#scan">Scanner</a>
      <a href="#records">Records</a>
    </nav>
    <button class="button button--small" id="connectButton" type="button"><span class="status-dot"></span><span>Connect wallet</span></button>
  </header>

  <main id="top">
    <section class="hero">
      <div class="hero__copy">
        <p class="eyebrow">BOT Chain / network 677</p>
        <h1>Read an account before you route a UserOperation.</h1>
        <p class="lede">ENTRYLENS checks the chain, account code, balance and known EntryPoint deployments. It produces evidence, not a certification.</p>
        <div class="hero__actions">
          <a class="button" href="#scan">Run account checks <span aria-hidden="true">↘</span></a>
          <a class="text-link" href="#method">See the method</a>
        </div>
        <p class="hero__fact">10 explicit checks · read-only until you sign or record</p>
      </div>

      <div class="hero__visual" aria-label="Preview of the diagnostic console">
        <div class="orb orb--one"></div><div class="orb orb--two"></div>
        <div class="terminal">
          <div class="terminal__bar"><span>live account profile</span><span class="mono">677 / BOT</span></div>
          <div class="terminal__score">
            <div class="ring"><span id="heroScore">—</span><small>passed</small></div>
            <div><p class="label">Scan state</p><strong id="heroState">Not started</strong><p class="terminal__meta" id="heroAddress">Connect a wallet or enter an address.</p></div>
          </div>
          <div class="terminal__rows">
            <div><span>RPC reachability</span><b data-mini="rpc">WAIT</b></div>
            <div><span>Account bytecode</span><b data-mini="code">WAIT</b></div>
            <div><span>EntryPoint route</span><b data-mini="entry">WAIT</b></div>
          </div>
        </div>
        <div class="proof-card">
          <span class="proof-card__icon">◎</span>
          <div><small>Report fingerprint</small><strong id="heroHash">Awaiting scan</strong></div>
        </div>
      </div>
    </section>

    <section class="method" id="method">
      <div class="section-head">
        <p class="eyebrow">The method</p>
        <h2>Useful signals, with their limits visible.</h2>
        <p>ENTRYLENS separates RPC facts from wallet actions. A green row means the check returned the expected value; it does not mean the account is secure.</p>
      </div>
      <div class="method__rail">
        <article><span>01</span><h3>Discover</h3><p>Find injected wallets through EIP‑6963, then fall back to the legacy provider.</p></article>
        <article><span>02</span><h3>Inspect</h3><p>Read chain ID, bytecode, BOT balance, nonce and known EntryPoint addresses.</p></article>
        <article><span>03</span><h3>Fingerprint</h3><p>Hash the ordered result set in your browser. Private keys never enter the page.</p></article>
        <article><span>04</span><h3>Record</h3><p>Optionally write only the report hash and score to the registry contract.</p></article>
      </div>
    </section>

    <section class="scanner" id="scan">
      <div class="scanner__control">
        <p class="eyebrow">Account scanner</p>
        <h2>Inspect a connected or pasted account.</h2>
        <label for="accountInput">Account address</label>
        <div class="input-row">
          <input id="accountInput" autocomplete="off" spellcheck="false" placeholder="0x…" />
          <button class="button" id="scanButton" type="button">Run checks <span aria-hidden="true">↘</span></button>
        </div>
        <div class="scan-meta">
          <div><span>Network</span><strong>BOT Chain · 677</strong></div>
          <div><span>Registry</span><strong id="registryState">Checking configuration</strong></div>
          <div><span>Mode</span><strong>Read first</strong></div>
        </div>
        <div class="report-block">
          <span>Report fingerprint</span>
          <code id="reportHash">Run the scan to create a fingerprint.</code>
          <div class="report-actions">
            <button class="button button--secondary" id="signButton" type="button" disabled>Test signature</button>
            <button class="button" id="recordButton" type="button" disabled>Record report <span aria-hidden="true">↗</span></button>
          </div>
          <p class="fineprint">Signature testing asks for a message signature. Recording asks for a contract transaction and gas.</p>
        </div>
      </div>
      <div class="checks-panel">
        <div class="checks-panel__head"><span>Check</span><span>Observed result</span><span>State</span></div>
        <div id="checksList"></div>
      </div>
    </section>

    <section class="records" id="records">
      <div class="records__intro">
        <p class="eyebrow">On-chain records</p>
        <h2>A small receipt, not a copy of the account.</h2>
        <p>The registry stores the reporter, report hash, score and timestamp. It does not store signatures, wallet secrets or the expanded diagnostic results.</p>
        <a href="https://scan.botchain.ai" class="text-link" target="_blank" rel="noreferrer">Open BOT explorer ↗</a>
      </div>
      <div class="ledger">
        <div class="ledger__head"><span>Latest registry entries</span><button id="refreshRecords" class="plain-button" type="button">Refresh</button></div>
        <div id="recordList" class="ledger__body"><p class="empty">Configure the registry address to read records.</p></div>
      </div>
    </section>

    <section class="close-band">
      <p class="eyebrow">One honest limit</p>
      <h2>Account checks cannot replace an audit.</h2>
      <p>Use ENTRYLENS to catch wrong networks, missing code and unavailable EntryPoints before a transaction. Review contracts and bundler policy separately.</p>
      <a class="button button--inverse" href="#scan">Inspect an account <span aria-hidden="true">↗</span></a>
    </section>
  </main>

  <footer>
    <div class="footer__brand"><svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="18"/><circle cx="21" cy="21" r="10"/></svg>ENTRYLENS</div>
    <p>Independent BOT Chain diagnostic interface.</p>
    <div><a href="https://scan.botchain.ai" target="_blank" rel="noreferrer">Explorer ↗</a><a href="https://botchain.ai" target="_blank" rel="noreferrer">BOT Chain ↗</a></div>
  </footer>

  <div class="wallet-modal" id="walletModal" hidden>
    <button class="wallet-modal__backdrop" data-close-wallet aria-label="Close wallet list"></button>
    <section class="wallet-sheet" role="dialog" aria-modal="true" aria-labelledby="walletTitle">
      <div class="wallet-sheet__head"><div><p class="eyebrow">Wallet discovery</p><h2 id="walletTitle">Choose a wallet</h2></div><button class="close-button" data-close-wallet aria-label="Close">×</button></div>
      <div id="walletList" class="wallet-list"></div>
      <a class="mobile-wallet" id="mobileWalletLink" href="https://metamask.app.link/dapp/" target="_blank" rel="noreferrer">Open this site in MetaMask mobile ↗</a>
      <p class="fineprint">ENTRYLENS never asks for a seed phrase or private key.</p>
    </section>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite" hidden><strong id="toastTitle"></strong><span id="toastText"></span><button id="toastClose" aria-label="Dismiss">×</button></div>
`

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!
const connectButton = $('#connectButton')
const accountInput = $('#accountInput') as HTMLInputElement
const scanButton = $('#scanButton') as HTMLButtonElement
const signButton = $('#signButton') as HTMLButtonElement
const recordButton = $('#recordButton') as HTMLButtonElement

function renderChecks() {
  $('#checksList').innerHTML = checks.map((check) => `
    <div class="check-row" data-state="${check.state}">
      <strong>${check.label}</strong>
      <span>${check.detail}</span>
      <b>${check.state === 'idle' ? 'WAIT' : check.state.toUpperCase()}</b>
    </div>
  `).join('')
}

function updateCheck(key: string, stateValue: CheckState, detail: string) {
  const check = checks.find((item) => item.key === key)
  if (!check) return
  check.state = stateValue
  check.detail = detail
  renderChecks()
}

function setMini(key: 'rpc' | 'code' | 'entry', value: string, okay: boolean) {
  const el = document.querySelector<HTMLElement>(`[data-mini="${key}"]`)
  if (!el) return
  el.textContent = value
  el.dataset.okay = String(okay)
}

function short(value: string, left = 7, right = 5) {
  return value.length > left + right + 3 ? `${value.slice(0, left)}…${value.slice(-right)}` : value
}

function showToast(title: string, text: string, error = false) {
  const toast = $('#toast')
  $('#toastTitle').textContent = title
  $('#toastText').textContent = text
  toast.classList.toggle('toast--error', error)
  toast.hidden = false
}

function parseError(error: unknown): string {
  const candidate = error as { shortMessage?: string; reason?: string; message?: string; code?: number }
  if (candidate?.code === 4001) return 'The wallet request was declined.'
  return candidate?.shortMessage || candidate?.reason || candidate?.message || 'The request could not be completed.'
}

function registerWallet(detail: { info: { uuid: string; name: string; icon?: string; rdns?: string }; provider: Eip1193Provider }) {
  state.wallets.set(detail.info.uuid, { ...detail.info, provider: detail.provider })
  renderWalletList()
}

function discoverWallets() {
  window.addEventListener('eip6963:announceProvider', ((event: CustomEvent) => registerWallet(event.detail)) as EventListener)
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  const legacy = (window as Window & { ethereum?: Eip1193Provider }).ethereum
  if (legacy) state.wallets.set('legacy-injected', { uuid: 'legacy-injected', name: 'Browser wallet', provider: legacy })
  window.setTimeout(renderWalletList, 250)
}

function renderWalletList() {
  const list = $('#walletList')
  const wallets = [...state.wallets.values()]
  list.innerHTML = wallets.length ? wallets.map((wallet) => `
    <button class="wallet-option" type="button" data-wallet="${wallet.uuid}">
      ${wallet.icon ? `<img src="${wallet.icon}" alt="" />` : '<span class="wallet-fallback">W</span>'}
      <span><strong>${wallet.name}</strong><small>${wallet.rdns || 'Injected browser provider'}</small></span><b>↗</b>
    </button>`).join('') : `<div class="wallet-empty"><strong>No injected wallet found.</strong><p>Install a browser wallet, or open this page inside a mobile wallet browser.</p></div>`
  list.querySelectorAll<HTMLButtonElement>('[data-wallet]').forEach((button) => button.addEventListener('click', () => connectWallet(button.dataset.wallet!)))
}

function openWalletModal() {
  const modal = $('#walletModal')
  const deepPath = `${location.host}${location.pathname}${location.search}`
  ;($('#mobileWalletLink') as HTMLAnchorElement).href = `https://metamask.app.link/dapp/${deepPath}`
  modal.hidden = false
  document.body.classList.add('modal-open')
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  window.setTimeout(renderWalletList, 200)
}

function closeWalletModal() {
  $('#walletModal').hidden = true
  document.body.classList.remove('modal-open')
}

async function ensureBotChain(provider: Eip1193Provider) {
  const current = await provider.request({ method: 'eth_chainId' }) as string
  if (current?.toLowerCase() === BOT_CHAIN.chainId) return
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BOT_CHAIN.chainId }] })
  } catch (error) {
    const candidate = error as { code?: number }
    if (candidate?.code !== 4902) throw error
    await provider.request({ method: 'wallet_addEthereumChain', params: [BOT_CHAIN] })
  }
}

function attachWalletListeners(provider: Eip1193Provider) {
  provider.on?.('accountsChanged', (...args) => {
    const accounts = args[0] as string[]
    if (!accounts?.length) return disconnectWallet()
    state.account = getAddress(accounts[0])
    syncConnectedState()
  })
  provider.on?.('chainChanged', () => syncConnectedState())
}

async function connectWallet(uuid: string) {
  const wallet = state.wallets.get(uuid)
  if (!wallet) return
  try {
    const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' }) as string[]
    if (!accounts?.length) throw new Error('The wallet did not return an account.')
    await ensureBotChain(wallet.provider)
    state.wallet = wallet
    state.account = getAddress(accounts[0])
    attachWalletListeners(wallet.provider)
    syncConnectedState()
    closeWalletModal()
    showToast('Wallet connected', `${wallet.name} is ready on BOT Chain.`)
    accountInput.value = state.account
    await runChecks()
  } catch (error) {
    showToast('Connection stopped', parseError(error), true)
  }
}

function disconnectWallet() {
  state.wallet = null
  state.account = ''
  connectButton.querySelector('span:last-child')!.textContent = 'Connect wallet'
  connectButton.classList.remove('is-connected')
  signButton.disabled = true
  recordButton.disabled = true
}

function syncConnectedState() {
  connectButton.querySelector('span:last-child')!.textContent = short(state.account)
  connectButton.classList.add('is-connected')
  accountInput.value = state.account
  $('#heroAddress').textContent = state.account
  signButton.disabled = !state.account
}

async function runChecks() {
  if (state.scanning) return
  const rawAddress = accountInput.value.trim() || state.account
  if (!isAddress(rawAddress)) {
    showToast('Address needed', 'Enter a valid 0x account address or connect a wallet.', true)
    accountInput.focus()
    return
  }
  const address = getAddress(rawAddress)
  accountInput.value = address
  state.scanning = true
  scanButton.disabled = true
  scanButton.firstChild!.textContent = 'Running checks '
  checks.forEach((check) => { check.state = 'idle'; check.detail = 'Reading…' })
  renderChecks()
  try {
    const blockNumber = await rpc.getBlockNumber()
    updateCheck('rpc', 'pass', `RPC answered at block ${blockNumber.toLocaleString()}.`)
    setMini('rpc', 'PASS', true)
    updateCheck('account', 'pass', `${address} is a checksummed address.`)

    let walletChain = ''
    if (state.wallet) {
      walletChain = await state.wallet.provider.request({ method: 'eth_chainId' }) as string
      updateCheck('network', walletChain.toLowerCase() === BOT_CHAIN.chainId ? 'pass' : 'fail', walletChain.toLowerCase() === BOT_CHAIN.chainId ? 'Connected wallet reports chain 677.' : `Connected wallet reports ${parseInt(walletChain, 16)}.`)
    } else {
      updateCheck('network', 'warn', 'No connected wallet. RPC checks still ran on BOT Chain.')
    }

    const [code, balance, nonce, ep06Code, ep07Code] = await Promise.all([
      rpc.getCode(address), rpc.getBalance(address), rpc.getTransactionCount(address), rpc.getCode(ENTRYPOINTS[0].address), rpc.getCode(ENTRYPOINTS[1].address),
    ])
    const isContract = code !== '0x'
    updateCheck('code', isContract ? 'pass' : 'warn', isContract ? `${code.length / 2 - 1} bytes of account code detected.` : 'No bytecode detected; this is an EOA at the current block.')
    setMini('code', isContract ? 'SMART' : 'EOA', isContract)
    updateCheck('balance', balance > 0n ? 'pass' : 'warn', `${formatEther(balance)} BOT available.`)
    updateCheck('nonce', 'pass', `Transaction count is ${nonce}.`)
    updateCheck('ep06', ep06Code !== '0x' ? 'pass' : 'warn', ep06Code !== '0x' ? `Code found at ${ENTRYPOINTS[0].address}.` : 'No code found at the canonical v0.6 address.')
    updateCheck('ep07', ep07Code !== '0x' ? 'pass' : 'warn', ep07Code !== '0x' ? `Code found at ${ENTRYPOINTS[1].address}.` : 'No code found at the canonical v0.7 address.')
    setMini('entry', ep06Code !== '0x' || ep07Code !== '0x' ? 'FOUND' : 'NONE', ep06Code !== '0x' || ep07Code !== '0x')
    updateCheck('signature', state.wallet && state.account.toLowerCase() === address.toLowerCase() ? 'warn' : 'idle', state.wallet && state.account.toLowerCase() === address.toLowerCase() ? 'Ready for an optional signature test.' : 'Connect this account to test its wallet signature.')

    let registryOkay = false
    if (isAddress(registryAddress)) {
      const registryCode = await rpc.getCode(registryAddress)
      registryOkay = registryCode !== '0x'
      updateCheck('registry', registryOkay ? 'pass' : 'fail', registryOkay ? `Registry code found at ${registryAddress}.` : 'Configured registry address has no code.')
    } else {
      updateCheck('registry', 'warn', 'VITE_ENTRYLENS_ADDRESS is not configured. Scanning remains available.')
    }

    const report = checks.map(({ key, label, detail, state: checkState }) => ({ key, label, detail, state: checkState }))
    state.lastReportHash = id(JSON.stringify({ chainId: 677, account: address, report }))
    state.lastPassed = checks.filter((check) => check.state === 'pass').length
    $('#reportHash').textContent = state.lastReportHash
    $('#heroHash').textContent = short(state.lastReportHash, 12, 8)
    $('#heroScore').textContent = `${state.lastPassed}/${checks.length}`
    $('#heroState').textContent = isContract ? 'Contract account mapped' : 'EOA mapped'
    $('#heroAddress').textContent = short(address, 12, 10)
    signButton.disabled = !(state.wallet && state.account.toLowerCase() === address.toLowerCase())
    recordButton.disabled = !(registryOkay && state.wallet && state.account)
    showToast('Scan complete', `${state.lastPassed} of ${checks.length} checks returned a pass state.`)
  } catch (error) {
    updateCheck('rpc', 'fail', parseError(error))
    setMini('rpc', 'FAIL', false)
    showToast('Scan failed', parseError(error), true)
  } finally {
    state.scanning = false
    scanButton.disabled = false
    scanButton.firstChild!.textContent = 'Run checks '
  }
}

async function testSignature() {
  if (!state.wallet || !state.account) return openWalletModal()
  try {
    const message = `ENTRYLENS diagnostic signature\nAccount: ${state.account}\nChain: 677\nReport: ${state.lastReportHash || 'not-scanned'}\nThis is not a transaction.`
    const signature = await state.wallet.provider.request({ method: 'personal_sign', params: [message, state.account] }) as string
    updateCheck('signature', 'pass', `Signature returned: ${short(signature, 12, 8)}.`)
    showToast('Signature returned', 'The wallet completed the optional message-signing check.')
  } catch (error) {
    updateCheck('signature', 'fail', parseError(error))
    showToast('Signature test stopped', parseError(error), true)
  }
}

async function recordReport() {
  if (!state.wallet || !state.account) return openWalletModal()
  if (!isAddress(registryAddress) || !state.lastReportHash) {
    showToast('Registry unavailable', 'Deploy the contract, set VITE_ENTRYLENS_ADDRESS, redeploy, then run the scan again.', true)
    return
  }
  try {
    await ensureBotChain(state.wallet.provider)
    const browserProvider = new BrowserProvider(state.wallet.provider)
    const signer = await browserProvider.getSigner()
    const registry = new Contract(registryAddress, REGISTRY_ABI, signer)
    showToast('Confirm in wallet', 'Review the registry address and gas before signing.')
    const tx = await registry.recordReport(state.lastReportHash, state.lastPassed, checks.length, 'entrylens-web')
    showToast('Transaction submitted', `Waiting for ${short(tx.hash, 12, 8)}.`)
    await tx.wait()
    showToast('Report recorded', 'The report fingerprint is now visible on BOT Chain.')
    await loadRecords()
  } catch (error) {
    showToast('Record stopped', parseError(error), true)
  }
}

async function loadRecords() {
  const recordList = $('#recordList')
  if (!isAddress(registryAddress)) {
    recordList.innerHTML = '<p class="empty">Configure VITE_ENTRYLENS_ADDRESS to read records.</p>'
    $('#registryState').textContent = 'Preview mode'
    return
  }
  try {
    const code = await rpc.getCode(registryAddress)
    if (code === '0x') throw new Error('No contract code at the configured address.')
    $('#registryState').textContent = short(registryAddress)
    const registry = new Contract(registryAddress, REGISTRY_ABI, rpc)
    const count = Number(await registry.recordCount())
    if (!count) {
      recordList.innerHTML = '<p class="empty">No reports have been recorded yet.</p>'
      return
    }
    const first = Math.max(1, count - 5)
    const ids = Array.from({ length: count - first + 1 }, (_, index) => count - index)
    const rows = await Promise.all(ids.map(async (recordId) => ({ recordId, data: await registry.records(recordId) })))
    recordList.innerHTML = rows.map(({ recordId, data }) => `
      <article><span>#${String(recordId).padStart(3, '0')}</span><div><strong>${short(data.reporter)}</strong><small>${new Date(Number(data.timestamp) * 1000).toLocaleString()}</small></div><b>${data.passed}/${data.total}</b><a href="https://scan.botchain.ai/address/${registryAddress}" target="_blank" rel="noreferrer">View ↗</a></article>
    `).join('')
  } catch (error) {
    $('#registryState').textContent = 'Configuration error'
    recordList.innerHTML = `<p class="empty">${parseError(error)}</p>`
  }
}

connectButton.addEventListener('click', () => state.account ? disconnectWallet() : openWalletModal())
scanButton.addEventListener('click', runChecks)
signButton.addEventListener('click', testSignature)
recordButton.addEventListener('click', recordReport)
$('#refreshRecords').addEventListener('click', loadRecords)
$('#toastClose').addEventListener('click', () => { $('#toast').hidden = true })
document.querySelectorAll('[data-close-wallet]').forEach((button) => button.addEventListener('click', closeWalletModal))
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeWalletModal() })

renderChecks()
discoverWallets()
loadRecords()
