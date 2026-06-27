import { createWalletClient, parseEther, formatEther, type Address, type Hex } from "viem";
import { CHAINS, writeTransport, alchemyNftBase, publicClient, type ChainKey } from "./chains";
import { decryptToAccount, type EncryptedBlob } from "./vault";
import { addLog, recordTx, updateTx, getWalletByAddress, listWallets } from "./db";

const ERC20_BALANCE_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export interface WalletBalances {
  address: Address;
  ethWei: string;
  eth: string;
  wethWei: string;
  weth: string;
  nftCount: number | null;
}

export async function readBalances(address: Address, chain: ChainKey): Promise<WalletBalances> {
  const client = publicClient(chain);
  const [ethWei, wethWei] = await Promise.all([
    client.getBalance({ address }),
    client.readContract({ address: CHAINS[chain].weth, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [address] }).catch(() => 0n) as Promise<bigint>,
  ]);

  // NFT count via Alchemy REST (real indexed data). Skipped if no Alchemy key.
  let nftCount: number | null = null;
  const nftBase = alchemyNftBase(chain);
  if (nftBase) {
    try {
      const res = await fetch(`${nftBase}/getNFTsForOwner?owner=${address}&withMetadata=false&pageSize=1`);
      const json = await res.json();
      nftCount = typeof json.totalCount === "number" ? json.totalCount : null;
    } catch { nftCount = null; }
  }

  return {
    address,
    ethWei: ethWei.toString(),
    eth: formatEther(ethWei),
    wethWei: (wethWei as bigint).toString(),
    weth: formatEther(wethWei as bigint),
    nftCount,
  };
}

export interface FundTarget { address: Address; amountEth: string; }
export interface FundResult { to: Address; status: "confirmed" | "failed" | "pending"; hash?: Hex; error?: string; }

/**
 * Batch-send ETH from a master wallet to destinations. Sends are issued
 * sequentially with incrementing nonce so they don't collide, then awaited.
 * (A multicall contract could batch into one tx, but plain transfers keep this
 *  dependency-free and work identically on every chain.)
 */
export async function batchFund(masterAddress: Address, chain: ChainKey, targets: FundTarget[]): Promise<FundResult[]> {
  const row = getWalletByAddress(masterAddress);
  if (!row) return targets.map((t) => ({ to: t.address, status: "failed", error: "Master wallet not found" }));

  let account;
  try { account = decryptToAccount(JSON.parse(row.enc_blob) as EncryptedBlob); }
  catch (e) { return targets.map((t) => ({ to: t.address, status: "failed", error: (e as Error).message })); }

  const walletClient = createWalletClient({ account, chain: CHAINS[chain].chain, transport: writeTransport(chain) });
  const client = publicClient(chain);
  let nonce = await client.getTransactionCount({ address: account.address });

  const fees = await client.estimateFeesPerGas();
  const results: FundResult[] = [];
  const pending: { to: Address; hash: Hex; txId: number }[] = [];

  for (const t of targets) {
    const txId = recordTx({ kind: "fund", chain, wallet_address: masterAddress, status: "pending", detail: { to: t.address, amountEth: t.amountEth } });
    try {
      const hash = await walletClient.sendTransaction({
        to: t.address, value: parseEther(t.amountEth), nonce: nonce++,
        maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
      updateTx(txId, { hash });
      addLog({ level: "WALLET", wallet: row.label, tx_hash: hash, status: "pending", message: `Funding ${t.amountEth} ETH → ${t.address}` });
      pending.push({ to: t.address, hash, txId });
    } catch (e) {
      const err = (e as Error).message;
      updateTx(txId, { status: "failed", detail: { error: err } });
      addLog({ level: "ERROR", wallet: row.label, message: `Funding ${t.address} failed: ${err}` });
      results.push({ to: t.address, status: "failed", error: err });
    }
  }

  await Promise.all(pending.map(async (p) => {
    try {
      const r = await client.waitForTransactionReceipt({ hash: p.hash, timeout: 120_000 });
      const ok = r.status === "success";
      updateTx(p.txId, { status: ok ? "confirmed" : "failed" });
      addLog({ level: ok ? "SUCCESS" : "ERROR", wallet: row.label, tx_hash: p.hash, status: ok ? "confirmed" : "failed", message: ok ? `Funded ${p.to}` : `Funding ${p.to} reverted` });
      results.push({ to: p.to, status: ok ? "confirmed" : "failed", hash: p.hash });
    } catch (e) {
      updateTx(p.txId, { status: "failed", detail: { error: (e as Error).message } });
      results.push({ to: p.to, status: "failed", hash: p.hash, error: (e as Error).message });
    }
  }));

  return results;
}

export async function readAllBalances(chain: ChainKey) {
  const wallets = listWallets();
  return Promise.all(wallets.map(async (w) => ({
    id: w.id, label: w.label, address: w.address as Address, is_master: !!w.is_master,
    balances: await readBalances(w.address as Address, chain),
  })));
}
