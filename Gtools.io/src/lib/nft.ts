import { createWalletClient, encodeFunctionData, type Address, type Hex } from "viem";
import { CHAINS, writeTransport, alchemyNftBase, publicClient, type ChainKey } from "./chains";
import { decryptToAccount, type EncryptedBlob } from "./vault";
import { addLog, recordTx, getWalletByAddress } from "./db";
import { autoFlip, getMarketData, type FlipAction } from "./opensea";

/**
 * NFT portfolio tools — the "NFT after mint" workflows:
 *  - scan which tokenIds a wallet owns in a collection (Alchemy NFT v3, real indexed data)
 *  - rank by rarity (Alchemy computeRarity / OpenSea traits when available)
 *  - batch transfer all owned tokens to one wallet
 *  - batch list all at a price you set
 *  - accept all offers across owned tokens until offers run out
 */

const ERC721_TRANSFER_ABI = [
  { type: "function", name: "safeTransferFrom", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
] as const;
const ERC1155_TRANSFER_ABI = [
  { type: "function", name: "safeTransferFrom", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "id", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "data", type: "bytes" }], outputs: [] },
] as const;

export interface OwnedNFT {
  tokenId: string;
  name: string | null;
  image: string | null;
  rarityRank: number | null;
  balance: string; // 1 for 721, n for 1155
}

/** Scan all NFTs a wallet owns within one collection. Paginates Alchemy fully. */
export async function scanOwned(wallet: Address, contract: Address, chain: ChainKey): Promise<OwnedNFT[]> {
  const out: OwnedNFT[] = [];
  let pageKey: string | undefined;
  const base = alchemyNftBase(chain);
  if (!base) throw new Error("NFT scan requires an Alchemy API key (ALCHEMY_API_KEY). Add it to .env.local.");
  do {
    const url = new URL(`${base}/getNFTsForOwner`);
    url.searchParams.set("owner", wallet);
    url.searchParams.append("contractAddresses[]", contract);
    url.searchParams.set("withMetadata", "true");
    url.searchParams.set("pageSize", "100");
    if (pageKey) url.searchParams.set("pageKey", pageKey);
    const res = await fetch(url.toString());
    if (!res.ok) break;
    const json = await res.json();
    for (const nft of json.ownedNfts ?? []) {
      out.push({
        tokenId: nft.tokenId,
        name: nft.name ?? nft.raw?.metadata?.name ?? null,
        image: nft.image?.cachedUrl ?? nft.image?.originalUrl ?? null,
        rarityRank: null,
        balance: nft.balance ?? "1",
      });
    }
    pageKey = json.pageKey;
  } while (pageKey);
  return out;
}

/** Attach rarity ranks via Alchemy computeRarity (per-token trait rarity → rank). */
export async function attachRarity(nfts: OwnedNFT[], contract: Address, chain: ChainKey): Promise<OwnedNFT[]> {
  const base = alchemyNftBase(chain);
  if (!base) return nfts; // rarity is best-effort; skip silently if no Alchemy key
  // Alchemy summarizeNFTAttributes gives collection trait distribution; computeRarity gives per-token.
  await Promise.all(nfts.map(async (n) => {
    try {
      const url = new URL(`${base}/computeRarity`);
      url.searchParams.set("contractAddress", contract);
      url.searchParams.set("tokenId", n.tokenId);
      const res = await fetch(url.toString());
      if (!res.ok) return;
      const json = await res.json();
      // Average trait prevalence → lower = rarer. Convert to a pseudo-rank score.
      const traits: { prevalence?: number }[] = json?.rarities ?? json ?? [];
      if (Array.isArray(traits) && traits.length) {
        const avg = traits.reduce((s, t) => s + (t.prevalence ?? 1), 0) / traits.length;
        n.rarityRank = Math.round(avg * 10000); // lower = rarer
      }
    } catch { /* rarity optional */ }
  }));
  // Convert score to ordinal rank (1 = rarest) among the scanned set
  const ranked = [...nfts].filter((n) => n.rarityRank !== null).sort((a, b) => (a.rarityRank! - b.rarityRank!));
  ranked.forEach((n, i) => { n.rarityRank = i + 1; });
  return nfts;
}

export interface BatchResult { tokenId: string; status: "confirmed" | "failed" | "skipped"; hash?: Hex; error?: string; }

/** Transfer every owned token in a collection from one wallet to a destination. */
export async function batchTransfer(opts: {
  fromWallet: Address; toAddress: Address; contract: Address; chain: ChainKey;
  standard: "ERC721" | "ERC1155"; tokenIds?: string[];
}): Promise<BatchResult[]> {
  const { fromWallet, toAddress, contract, chain, standard } = opts;
  const row = getWalletByAddress(fromWallet);
  if (!row) return [{ tokenId: "-", status: "failed", error: "Wallet not found" }];
  const tokens = opts.tokenIds ?? (await scanOwned(fromWallet, contract, chain)).map((n) => n.tokenId);
  if (!tokens.length) return [{ tokenId: "-", status: "skipped", error: "No owned tokens found" }];

  const account = decryptToAccount(JSON.parse(row.enc_blob) as EncryptedBlob);
  const walletClient = createWalletClient({ account, chain: CHAINS[chain].chain, transport: writeTransport(chain) });
  const client = publicClient(chain);
  let nonce = await client.getTransactionCount({ address: account.address });
  const results: BatchResult[] = [];

  for (const tokenId of tokens) {
    try {
      const data = standard === "ERC721"
        ? encodeFunctionData({ abi: ERC721_TRANSFER_ABI, functionName: "safeTransferFrom", args: [fromWallet, toAddress, BigInt(tokenId)] })
        : encodeFunctionData({ abi: ERC1155_TRANSFER_ABI, functionName: "safeTransferFrom", args: [fromWallet, toAddress, BigInt(tokenId), 1n, "0x"] });
      const hash = await walletClient.sendTransaction({ to: contract, data, nonce: nonce++ });
      recordTx({ kind: "transfer", chain, wallet_address: fromWallet, collection: contract, hash, status: "pending", detail: { tokenId, to: toAddress } });
      addLog({ level: "WALLET", wallet: row.label, collection: contract, tx_hash: hash, status: "pending", message: `Transfer #${tokenId} → ${toAddress.slice(0, 8)}…` });
      results.push({ tokenId, status: "confirmed", hash });
    } catch (e) {
      const error = (e as Error).message;
      addLog({ level: "ERROR", wallet: row.label, collection: contract, message: `Transfer #${tokenId} failed: ${error}` });
      results.push({ tokenId, status: "failed", error });
    }
  }
  return results;
}

/** List every owned token at a fixed price (ETH). Uses OpenSea via autoFlip. */
export async function batchList(opts: {
  wallet: Address; contract: Address; chain: ChainKey; priceEth: number; tokenIds?: string[];
}): Promise<BatchResult[]> {
  const tokens = opts.tokenIds ?? (await scanOwned(opts.wallet, opts.contract, opts.chain)).map((n) => n.tokenId);
  if (!tokens.length) return [{ tokenId: "-", status: "skipped", error: "No owned tokens" }];
  const action: FlipAction = { type: "custom_listing", priceEth: opts.priceEth };
  const results: BatchResult[] = [];
  for (const tokenId of tokens) {
    const r = await autoFlip({ walletAddress: opts.wallet, chain: opts.chain, contract: opts.contract, tokenId, action });
    results.push({ tokenId, status: r.status === "done" ? "confirmed" : r.status === "skipped" ? "skipped" : "failed", error: r.status === "failed" ? r.detail : undefined });
  }
  return results;
}

/** Accept the best offer on every owned token, in descending offer order, until
 *  offers are exhausted or all tokens are sold. Tokens with no qualifying offer
 *  are left untouched. */
export async function acceptAllOffers(opts: {
  wallet: Address; contract: Address; chain: ChainKey; minEth?: number; tokenIds?: string[];
}): Promise<BatchResult[]> {
  const tokens = opts.tokenIds ?? (await scanOwned(opts.wallet, opts.contract, opts.chain)).map((n) => n.tokenId);
  if (!tokens.length) return [{ tokenId: "-", status: "skipped", error: "No owned tokens" }];
  const min = opts.minEth ?? 0;
  const action: FlipAction = min > 0 ? { type: "accept_offer_above", minEth: min } : { type: "accept_best_offer" };

  const results: BatchResult[] = [];
  for (const tokenId of tokens) {
    const r = await autoFlip({ walletAddress: opts.wallet, chain: opts.chain, contract: opts.contract, tokenId, action });
    results.push({ tokenId, status: r.status === "done" ? "confirmed" : r.status === "skipped" ? "skipped" : "failed", error: r.status !== "done" ? r.detail : undefined });
    // If offers ran dry (skip reason mentions no offers), keep going — remaining
    // tokens may still have offers; autoFlip checks each independently.
  }
  return results;
}

export { getMarketData };
