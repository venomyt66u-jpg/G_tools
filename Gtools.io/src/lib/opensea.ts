import { OpenSeaSDK, Chain } from "@opensea/sdk";
import { JsonRpcProvider, Wallet } from "ethers";
import { type Address } from "viem";
import { CHAINS, rpcUrls, type ChainKey } from "./chains";
import { rawPrivateKeyForSigning, type EncryptedBlob } from "./vault";
import { addLog, recordTx, getWalletByAddress } from "./db";

/**
 * OpenSea is the only major EVM NFT marketplace with a working, documented
 * listing API as of 2026 (Seaport 1.6 via @opensea/sdk v11). Reservoir — which
 * previously aggregated OpenSea/Blur/etc. through one API — shut down Oct 2025.
 * Blur has no public listing API. So "auto-flip across marketplaces" realistically
 * means OpenSea here. Floor/offer data below is read from OpenSea's v2 REST API.
 *
 * NOTE: @opensea/sdk needs an ethers v6 Signer (it cannot take a viem account),
 * so the wallet's key is decrypted in-process to build the Signer. The key never
 * leaves this Node process and is never logged or returned over HTTP.
 */

const OPENSEA_CHAIN: Record<ChainKey, Chain> = {
  ethereum: Chain.Mainnet,
  base: Chain.Base,
  arbitrum: Chain.Arbitrum,
  optimism: Chain.Optimism,
  polygon: Chain.Polygon,
};

function sdkForWallet(walletAddress: Address, chain: ChainKey): OpenSeaSDK {
  const row = getWalletByAddress(walletAddress);
  if (!row) throw new Error("Wallet not found");
  const pk = rawPrivateKeyForSigning(JSON.parse(row.enc_blob) as EncryptedBlob);
  // Use the same failover RPC ordering; ethers picks the first that responds.
  const urls = rpcUrls(chain);
  const provider = new JsonRpcProvider(urls[0]);
  const signer = new Wallet(pk, provider);
  // ethers ships both ESM and CJS builds; @opensea/sdk's types reference the CJS
  // Signer while our import resolves to ESM. The runtime object is identical, so
  // we cast at this single boundary. (Verified Wallet implements the Signer API.)
  return new OpenSeaSDK(signer as unknown as ConstructorParameters<typeof OpenSeaSDK>[0], {
    chain: OPENSEA_CHAIN[chain],
    apiKey: process.env.OPENSEA_API_KEY,
  });
}

const OS_API = "https://api.opensea.io/api/v2";
function osHeaders() {
  return { accept: "application/json", "x-api-key": process.env.OPENSEA_API_KEY ?? "" };
}

/** Resolve the OpenSea collection slug for a contract (needed by most v2 endpoints). */
async function resolveSlug(contract: Address, chain: ChainKey): Promise<string | null> {
  try {
    const res = await fetch(`${OS_API}/chain/${CHAINS[chain].openseaChain}/contract/${contract}`, { headers: osHeaders() });
    const json = await res.json();
    return json?.collection ?? null;
  } catch {
    return null;
  }
}

export interface MarketData {
  floorPriceEth: number | null;
  bestOfferEth: number | null;
  lastSaleEth: number | null;
  volumeEth: number | null;
  slug: string | null;
}

export async function getMarketData(contract: Address, chain: ChainKey): Promise<MarketData> {
  const empty: MarketData = { floorPriceEth: null, bestOfferEth: null, lastSaleEth: null, volumeEth: null, slug: null };
  const slug = await resolveSlug(contract, chain);
  if (!slug) return empty;
  try {
    const sRes = await fetch(`${OS_API}/collections/${slug}/stats`, { headers: osHeaders() });
    const sJson = await sRes.json();
    const total = sJson?.total ?? {};

    // best collection offer
    let bestOffer: number | null = null;
    try {
      const oRes = await fetch(`${OS_API}/offers/collection/${slug}`, { headers: osHeaders() });
      const oJson = await oRes.json();
      for (const o of oJson?.offers ?? []) {
        const v = Number(o?.price?.value ?? 0) / 10 ** Number(o?.price?.decimals ?? 18);
        if (v && (bestOffer === null || v > bestOffer)) bestOffer = v;
      }
    } catch { /* offers optional */ }

    return {
      floorPriceEth: typeof total.floor_price === "number" ? total.floor_price : null,
      bestOfferEth: bestOffer,
      lastSaleEth: null,
      volumeEth: typeof total.volume === "number" ? total.volume : null,
      slug,
    };
  } catch {
    return { ...empty, slug };
  }
}

export type FlipAction =
  | { type: "none" }
  | { type: "list_at_floor" }
  | { type: "list_below_floor"; deltaPct: number }
  | { type: "custom_listing"; priceEth: number }
  | { type: "accept_best_offer" }
  | { type: "accept_offer_above"; minEth: number };

export interface FlipResult { tokenId: string; status: "done" | "skipped" | "failed"; detail: string; }

/** Read the numeric ETH value of an Offer's price (price.current.value in wei). */
function offerPriceEth(offer: unknown): number | null {
  const p = (offer as { price?: { value?: string; currency?: string; decimals?: number; current?: { value?: string; decimals?: number } } }).price;
  if (!p) return null;
  const value = p.current?.value ?? p.value;
  const decimals = p.current?.decimals ?? p.decimals ?? 18;
  if (value === undefined) return null;
  return Number(value) / 10 ** Number(decimals);
}

/** Execute an auto-flip decision for a freshly minted token. */
export async function autoFlip(opts: {
  walletAddress: Address; chain: ChainKey; contract: Address; tokenId: string; action: FlipAction;
}): Promise<FlipResult> {
  const { walletAddress, chain, contract, tokenId, action } = opts;
  const row = getWalletByAddress(walletAddress);
  const label = row?.label ?? walletAddress;

  if (action.type === "none") return { tokenId, status: "skipped", detail: "No action configured" };

  const sdk = sdkForWallet(walletAddress, chain);
  const slug = await resolveSlug(contract, chain);
  const expiration = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days

  try {
    // --- Accept offers ---
    if (action.type === "accept_best_offer" || action.type === "accept_offer_above") {
      if (!slug) return { tokenId, status: "skipped", detail: "Collection slug not found on OpenSea" };
      const min = action.type === "accept_offer_above" ? action.minEth : 0;
      const best = await sdk.api.getBestOffer(slug, tokenId);
      if (!best) return { tokenId, status: "skipped", detail: "No active offers found" };
      const price = offerPriceEth(best);
      if (price === null || price < min) {
        return { tokenId, status: "skipped", detail: `Best offer ${price ?? "none"} below threshold ${min}` };
      }
      const txHash = await sdk.fulfillOrder({ order: best, accountAddress: walletAddress });
      recordTx({ kind: "accept_offer", chain, wallet_address: walletAddress, collection: contract, hash: txHash, status: "confirmed", detail: { tokenId, price } });
      addLog({ level: "LISTING", wallet: label, collection: contract, tx_hash: txHash, status: "confirmed", message: `Accepted offer ${price} ETH on #${tokenId}` });
      return { tokenId, status: "done", detail: `Accepted offer ${price} ETH, tx ${txHash}` };
    }

    // --- Listings ---
    const market = await getMarketData(contract, chain);
    let priceEth: number;
    if (action.type === "list_at_floor") {
      if (market.floorPriceEth === null) return { tokenId, status: "skipped", detail: "No floor price available" };
      priceEth = market.floorPriceEth;
    } else if (action.type === "list_below_floor") {
      if (market.floorPriceEth === null) return { tokenId, status: "skipped", detail: "No floor price available" };
      priceEth = market.floorPriceEth * (1 - action.deltaPct / 100);
    } else {
      priceEth = action.priceEth;
    }
    priceEth = Math.max(priceEth, 0);

    const listing = await sdk.createListing({
      asset: { tokenId, tokenAddress: contract },
      accountAddress: walletAddress,
      amount: priceEth,
      expirationTime: expiration,
    });
    const orderHash = (listing as { orderHash?: string }).orderHash ?? "";
    recordTx({ kind: "list", chain, wallet_address: walletAddress, collection: contract, hash: orderHash, status: "confirmed", detail: { tokenId, priceEth } });
    addLog({ level: "LISTING", wallet: label, collection: contract, status: "confirmed", message: `Listed #${tokenId} at ${priceEth.toFixed(5)} ETH` });
    return { tokenId, status: "done", detail: `Listed at ${priceEth.toFixed(5)} ETH` };
  } catch (e) {
    const err = (e as Error).message;
    addLog({ level: "ERROR", wallet: label, collection: contract, message: `Flip failed for #${tokenId}: ${err}` });
    return { tokenId, status: "failed", detail: err };
  }
}
