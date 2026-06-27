import {
  createWalletClient, encodeFunctionData, parseEther, type Abi, type Address, type Hex,
} from "viem";
import { CHAINS, writeTransport, publicClient, type ChainKey } from "./chains";
import { decryptToAccount, type EncryptedBlob } from "./vault";
import { addLog, recordTx, updateTx, getWalletByAddress } from "./db";

export type MintMode = "slow_extra" | "slow" | "standard" | "fast" | "instant";

// Gas multipliers applied to the network's suggested base/priority fee.
// fee = ceiling multiplier (maxFeePerGas), tip = priority multiplier.
const MODE_MULTIPLIERS: Record<MintMode, { fee: number; tip: number }> = {
  slow_extra: { fee: 0.85, tip: 0.5 },
  slow: { fee: 1.0, tip: 0.8 },
  standard: { fee: 1.15, tip: 1.0 },
  fast: { fee: 1.4, tip: 1.8 },
  instant: { fee: 2.2, tip: 4.0 },
};

export interface MintParams {
  chain: ChainKey;
  contract: Address;
  abi: Abi;
  functionName: string;
  // args the user/phase resolver supplies, e.g. [quantity] or [to, quantity, proof]
  args: unknown[];
  // total ETH value to send (price * quantity), as a decimal string e.g. "0.08"
  valueEth: string;
  mode: MintMode;
  // optional manual overrides (decimal gwei)
  maxFeeGwei?: number;
  priorityFeeGwei?: number;
  gasLimit?: bigint;
  retryCount?: number;
  retryDelayMs?: number;
}

export interface MintOutcome {
  walletAddress: Address;
  status: "confirmed" | "failed" | "pending";
  hash?: Hex;
  error?: string;
  gasUsed?: string;
  blockNumber?: string;
  attempts: number;
}

function gweiToWei(g: number): bigint {
  return BigInt(Math.round(g * 1e9));
}

async function resolveFees(chain: ChainKey, mode: MintMode, override?: { maxFeeGwei?: number; priorityFeeGwei?: number }) {
  const client = publicClient(chain);
  const mult = MODE_MULTIPLIERS[mode];
  if (override?.maxFeeGwei && override?.priorityFeeGwei) {
    return {
      maxFeePerGas: gweiToWei(override.maxFeeGwei),
      maxPriorityFeePerGas: gweiToWei(override.priorityFeeGwei),
    };
  }
  const fees = await client.estimateFeesPerGas();
  const base = fees.maxFeePerGas ?? gweiToWei(30);
  const tip = fees.maxPriorityFeePerGas ?? gweiToWei(1.5);
  return {
    maxFeePerGas: BigInt(Math.round(Number(base) * mult.fee)),
    maxPriorityFeePerGas: BigInt(Math.round(Number(tip) * mult.tip)),
  };
}

/** Estimate the full cost of a mint for preview (gas + value). Read-only.
 *  Returns both the EXPECTED cost (base fee + tip, what you likely pay) and the
 *  MAX cost (the maxFeePerGas cap, worst case), which the gauge displays. */
export async function estimateMint(params: MintParams, from: Address) {
  const client = publicClient(chain(params));
  const data = encodeFunctionData({ abi: params.abi, functionName: params.functionName, args: params.args });
  const value = parseEther(params.valueEth || "0");
  const fees = await resolveFees(params.chain, params.mode, { maxFeeGwei: params.maxFeeGwei, priorityFeeGwei: params.priorityFeeGwei });

  // current network base fee, to compute the *expected* effective price
  let baseFee = 0n;
  try {
    const block = await client.getBlock({ blockTag: "latest" });
    baseFee = block.baseFeePerGas ?? 0n;
  } catch { /* baseFee stays 0 → expected falls back to max */ }

  let gas: bigint;
  try {
    gas = params.gasLimit ?? (await client.estimateGas({ account: from, to: params.contract, data, value }));
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }

  // Effective price actually paid on EIP-1559 = min(maxFee, baseFee + priorityTip)
  const effective = baseFee > 0n
    ? (baseFee + fees.maxPriorityFeePerGas < fees.maxFeePerGas
        ? baseFee + fees.maxPriorityFeePerGas
        : fees.maxFeePerGas)
    : fees.maxFeePerGas;

  const expectedGasCost = gas * effective;
  const maxGasCost = gas * fees.maxFeePerGas;

  return {
    ok: true as const,
    gas: gas.toString(),
    expectedGwei: Number(effective) / 1e9,
    maxFeeGwei: Number(fees.maxFeePerGas) / 1e9,
    priorityFeeGwei: Number(fees.maxPriorityFeePerGas) / 1e9,
    baseFeeGwei: Number(baseFee) / 1e9,
    expectedCostEth: (Number(expectedGasCost + value) / 1e18).toFixed(6),
    maxCostEth: (Number(maxGasCost + value) / 1e18).toFixed(6),
    expectedGasCostEth: (Number(expectedGasCost) / 1e18).toFixed(6),
    valueEth: params.valueEth,
  };
}

function chain(p: MintParams) { return p.chain; }

/** Execute a mint from a single wallet, with retry. Decrypts key only here. */
export async function mintFromWallet(walletAddress: Address, params: MintParams): Promise<MintOutcome> {
  const row = getWalletByAddress(walletAddress);
  if (!row) return { walletAddress, status: "failed", error: "Wallet not found", attempts: 0 };

  const retries = params.retryCount ?? 0;
  const delay = params.retryDelayMs ?? 1500;
  const data = encodeFunctionData({ abi: params.abi, functionName: params.functionName, args: params.args });
  const value = parseEther(params.valueEth || "0");

  let attempts = 0;
  let lastErr = "";
  const txId = recordTx({
    kind: "mint", chain: params.chain, wallet_address: walletAddress,
    collection: params.contract, status: "pending",
    detail: { functionName: params.functionName, valueEth: params.valueEth, mode: params.mode },
  });

  while (attempts <= retries) {
    attempts++;
    let account;
    try {
      account = decryptToAccount(JSON.parse(row.enc_blob) as EncryptedBlob);
    } catch (e) {
      const msg = (e as Error).message;
      updateTx(txId, { status: "failed", detail: { error: msg } });
      addLog({ level: "ERROR", wallet: row.label, collection: params.contract, message: `Vault locked / decrypt failed: ${msg}` });
      return { walletAddress, status: "failed", error: msg, attempts };
    }

    const walletClient = createWalletClient({
      account, chain: CHAINS[params.chain].chain, transport: writeTransport(params.chain),
    });
    const client = publicClient(params.chain);

    try {
      const fees = await resolveFees(params.chain, params.mode, { maxFeeGwei: params.maxFeeGwei, priorityFeeGwei: params.priorityFeeGwei });
      let gas = params.gasLimit;
      if (!gas) {
        gas = await client.estimateGas({ account: account.address, to: params.contract, data, value });
        gas = (gas * 120n) / 100n; // 20% headroom
      }
      addLog({ level: "MINT", wallet: row.label, collection: params.contract, status: "pending", message: `Submitting mint (attempt ${attempts}) ${params.functionName} value=${params.valueEth} ETH` });

      const hash = await walletClient.sendTransaction({
        to: params.contract, data, value, gas,
        maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
      updateTx(txId, { hash, status: "pending" });
      addLog({ level: "BLOCKCHAIN", wallet: row.label, collection: params.contract, tx_hash: hash, status: "pending", message: `Tx submitted: ${hash}` });

      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status === "success") {
        updateTx(txId, { status: "confirmed", detail: { gasUsed: receipt.gasUsed.toString(), block: receipt.blockNumber.toString() } });
        addLog({ level: "SUCCESS", wallet: row.label, collection: params.contract, tx_hash: hash, status: "confirmed", message: `Mint confirmed in block ${receipt.blockNumber}` });
        return { walletAddress, status: "confirmed", hash, gasUsed: receipt.gasUsed.toString(), blockNumber: receipt.blockNumber.toString(), attempts };
      } else {
        lastErr = "Transaction reverted on-chain";
        addLog({ level: "ERROR", wallet: row.label, collection: params.contract, tx_hash: hash, status: "failed", message: lastErr });
      }
    } catch (e) {
      lastErr = (e as Error).message;
      addLog({ level: "ERROR", wallet: row.label, collection: params.contract, message: `Attempt ${attempts} failed: ${lastErr}` });
    }
    if (attempts <= retries) await new Promise((r) => setTimeout(r, delay));
  }

  updateTx(txId, { status: "failed", detail: { error: lastErr } });
  return { walletAddress, status: "failed", error: lastErr, attempts };
}

/** Mint from multiple wallets in parallel. */
export async function mintFromWallets(wallets: Address[], params: MintParams): Promise<MintOutcome[]> {
  return Promise.all(wallets.map((w) => mintFromWallet(w, params)));
}
