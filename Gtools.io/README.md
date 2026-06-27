# G_Tools — NFT Minting Automation Suite

A **single-user** NFT minting & wallet management terminal. Runs on **your own machine**.
Your private keys are encrypted at rest (AES-256-GCM) and never leave the server process.

> ⚠️ **مهم / Important:** This is a real Web3 tool that signs real transactions with real funds.
> **Always test on a testnet first** (Sepolia / Base Sepolia). A bug or a wrong setting can cost ETH.
> This software is provided as-is, with no warranty. You are responsible for your own keys and funds.

---

## ما الذي يعمل فعليًا (What actually works)

- **Mint Configuration**: paste a contract address or a URL (OpenSea / Zora / Manifold / Highlight / generic). Detects ERC-721/1155 (ERC-165), fetches the verified ABI (Etherscan **V2** unified API, with proxy→implementation resolution), reads supply/price/owner on-chain, and finds candidate mint functions.
- **Phase detection**: reads real phases from **Thirdweb** drops (`claimConditions`). For other contracts it shows the real on-chain sale-flag booleans for manual selection (there is **no** universal on-chain phase standard — anything claiming otherwise is faking it).
- **Wallet Manager**: import unlimited wallets by private key (encrypted at rest), rename, set a master, see ETH/WETH balances + NFT count (Alchemy NFT v3).
- **Funding**: batch-send ETH from the master wallet to selected wallets.
- **Mint engine**: mint from one / many / all wallets in parallel, with gas modes (standard/fast/aggressive/instant), manual gas overrides, retries, and live gas estimation.
- **Auto-Flip (OpenSea only)**: list at/below floor, custom price, or accept best/above-threshold offers via `@opensea/sdk` v11 (Seaport 1.6).
- **Terminal & Logs**: live-polling log center with level filters, search, and export.

## ما الذي تغيّر في 2026 ولا يمكن بناؤه كما في الطلب الأصلي

- **Reservoir** (الذي كان يجمّع أسواق متعددة في API واحد) **أُغلق في أكتوبر 2025**. لا بديل واحد يجمع كل الأسواق.
- **Blur** ليس له API عام للإدراج. لذلك "auto-flip عبر كل الأسواق" = OpenSea فقط واقعيًا.
- **Alchemy SDK (JS)** تم أرشفته يناير 2026 → المشروع يستخدم **Viem + Alchemy REST**.

---

## المتطلبات (Requirements)

- **Node.js 20 or newer** (download from nodejs.org).
- Free API keys:
  - **Alchemy** — RPC + NFT data (one key, all chains): https://dashboard.alchemy.com
  - **Etherscan** — ABI/source (one key, all chains, V2): https://etherscan.io/apis
  - **OpenSea** — listings/offers/market data: https://docs.opensea.io/reference/api-keys

---

## التشغيل على الكمبيوتر (Run on a computer) — 5 steps

```bash
# 1) install dependencies (this compiles the database module — needs internet)
npm install

# 2) create your secrets file
cp .env.example .env.local

# 3) edit .env.local and fill in the 6 values (passwords + 3 API keys)
#    APP_PASSWORD, SESSION_SECRET, ALCHEMY_API_KEY, ETHERSCAN_API_KEY, OPENSEA_API_KEY

# 4) build
npm run build

# 5) start
npm start
```

Then open **http://localhost:3000**. You'll be asked for:
1. **App password** (the `APP_PASSWORD` you set) — logs you in.
2. **Vault passphrase** (any phrase ≥ 8 chars you choose) — this derives the key that
   encrypts/decrypts your wallets. **Remember it. It is never stored. Lose it = lose access to imported keys.**

---

## 📱 تشغيله من الموبايل — بالتفصيل (Use it from your phone — step by step)

التطبيق فيه **سيرفر**، فمش هتلاقيه في App Store. لكن فيه طريقتين سهلتين تستخدمه من الموبايل:

### الطريقة الأولى (الأسهل): شغّله على الكمبيوتر وافتحه من الموبايل على نفس الواي-فاي

ده أبسط حل وآمن لأن كل حاجة بتفضل على جهازك في البيت.

1. على **الكمبيوتر**، نفّذ خطوات التشغيل فوق لحد `npm start`.
2. اعرف الـ **IP المحلي** بتاع الكمبيوتر:
   - **Windows**: افتح Command Prompt واكتب `ipconfig` → دوّر على `IPv4 Address` (شكله زي `192.168.1.20`).
   - **Mac**: System Settings → Wi-Fi → Details → هتلاقي الـ IP، أو في الترمنال: `ipconfig getifaddr en0`.
3. شغّل السيرفر بحيث يسمع على الشبكة (مش localhost بس):
   ```bash
   npm start -- -H 0.0.0.0
   ```
   (أو عدّل سكربت start كما هو موضح تحت — أنا ظابطه لك بالفعل ليسمع على الشبكة.)
4. على **الموبايل** (لازم يكون على نفس شبكة الواي-فاي): افتح المتصفح واكتب:
   ```
   http://192.168.1.20:3000
   ```
   (غيّر الـ IP للـ IP بتاع كمبيوترك).
5. سجّل الدخول بكلمة السر وافتح الـ vault — وخلاص بتستخدمه من الموبايل والشغل الفعلي بيحصل على الكمبيوتر.

**نصيحة:** من المتصفح على الأيفون/الأندرويد تقدر تعمل "Add to Home Screen" فيبقى ليه أيقونة زي أي تطبيق ويفتح في ملء الشاشة (الواجهة متظبطة للموبايل أصلًا — responsive).

> ✅ الأمان هنا ممتاز: الكمبيوتر بتاعك في البيت بس، والموبايل مجرد شاشة بتتحكم فيه عبر الواي-فاي.
> ❌ متفتحش البورت ده على الإنترنت العام (port forwarding) — ده تطبيق single-user ومش معمول للإنترنت المفتوح.

### الطريقة الثانية: استضافة على سيرفر شخصي وفتحه من أي مكان

لو عايز توصله من بره البيت (من بيانات الموبايل مثلًا)، تقدر تنشره على سيرفر صغير (VPS) بتأجره:

1. أجّر VPS رخيص (مثلًا Hetzner / DigitalOcean / Railway).
2. ارفع المشروع عليه، نفّس نفس خطوات التشغيل، وحط الـ `.env.local`.
3. لازم تحط **HTTPS** (شهادة SSL) و**كلمة سر قوية جدًا**، وويفضّل تقفل الوصول بـ VPN أو IP allowlist.
4. افتح رابط السيرفر من موبايلك في أي وقت.

> ⚠️ تحذير مهم: لو حطيت مفاتيح محافظ حقيقية على VPS على الإنترنت، السيرفر ده بيبقى هدف. لو فيه فلوس كتير، الطريقة الأولى (البيت + واي-فاي) أأمن بكتير. استخدم محافظ منفصلة بأرصدة محدودة لو هتستضيفه أونلاين.

---

## كيف تتأكد قبل ما تخاطر بفلوس (Test safely first)

1. استورد محفظة فيها **شوية ETH على شبكة تجريبية** (Sepolia عبر Alchemy).
2. جرّب الـ analyze على عقد معروف، شوف البيانات بتظهر صح.
3. جرّب mint بقيمة صغيرة، اتأكد إن الـ tx بتتأكد على الإكسبلورر.
4. بعد ما تطمن، انقل لـ mainnet بأرصدة محدودة.

---

## بنية المشروع (Project structure)

```
src/
  app/
    page.tsx            # gate (login + vault unlock) + dashboard shell
    layout.tsx          # fonts + shell
    globals.css         # terminal aesthetic
    api/                # all backend route handlers (real chain work)
      analyze/  mint/  mint/estimate/  fund/  list/  market/
      wallets/  logs/  transactions/  auth/login/  auth/unlock/
  lib/
    chains.ts           # Viem clients + Alchemy RPC/NFT per chain
    vault.ts            # AES-256-GCM encryption, in-memory passphrase
    db.ts               # SQLite (lazy init) — wallets/tx/logs
    parse.ts            # URL/address parser (OpenSea/Zora/Manifold/Highlight)
    analyze.ts          # ERC-165 + Etherscan V2 ABI + on-chain reads + mint fn detect
    phases.ts           # Thirdweb claimConditions + honest fallback
    mint.ts             # gas modes, retries, multi-wallet mint engine
    fund.ts             # batch ETH send + balances
    opensea.ts          # @opensea/sdk v11: list / accept offers / market data
    auth.ts             # single-user session + vault guards
  components/           # MintConfig, WalletManager, Terminal, ui primitives
  store/useStore.ts     # zustand client state
```

## الأمان (Security model — read it)

- Private keys are encrypted with **AES-256-GCM**; the key is derived by **scrypt**
  from your vault passphrase, held **only in server memory**, never written to disk.
- Decrypted keys exist in memory only for the duration of a signing call.
- Keys / `enc_blob` are **never** sent to the browser or written to logs.
- There is **no remote custody**. Disk + passphrase together = access. Treat the
  passphrase like a seed phrase.
- This is a **local single-user tool**. Do not expose it on the public internet
  without HTTPS, a strong password, and ideally a VPN/IP allowlist.

## حدود معروفة (Known limits)

- Auto-flip is **OpenSea only** (the only marketplace with a usable listing API in 2026).
- Universal mint-phase detection isn't possible; only known families (Thirdweb) are read fully.
- Eligibility shows **yellow/unknown** by default — merkle/holder/balance checks are
  phase-specific; confirm before minting a gated phase, and supply the merkle proof for gated mints.
- "Live monitoring" uses polling (2.5s). A WebSocket upgrade (Alchemy `eth_subscribe`) is a natural next step.
