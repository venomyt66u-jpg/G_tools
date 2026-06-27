import { mainnet, base, arbitrum, optimism, polygon } from "viem/chains";
import { createPublicClient, http, fallback, type PublicClient, type Chain } from "viem";

export type ChainKey = "ethereum" | "base" | "arbitrum" | "optimism" | "polygon";

interface ChainMeta {
  key: ChainKey;
  chain: Chain;
  alchemySlug: string;     // Alchemy network slug (RPC + NFT API)
  openseaChain: string;    // OpenSea v2 chain identifier
  explorer: string;
  weth: `0x${string}`;     // wrapped native (WETH / WMATIC)
  // Public fallback RPCs used if Alchemy + custom RPC fail. Multiple per chain.
  publicRpcs: string[];
}

export const CHAINS: Record<ChainKey, ChainMeta> = {
  ethereum: {
    key: "ethereum", chain: mainnet, alchemySlug: "eth-mainnet", openseaChain: "ethereum",
    explorer: "https://etherscan.io", weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    publicRpcs: [
      "https://eth.llamarpc.com",
      "https://rpc.ankr.com/eth",
      "https://ethereum-rpc.publicnode.com",
      "https://cloudflare-eth.com",
    ],
  },
  base: {
    key: "base", chain: base, alchemySlug: "base-mainnet", openseaChain: "base",
    explorer: "https://basescan.org", weth: "0x4200000000000000000000000000000000000006",
    publicRpcs: [
      "https://mainnet.base.org",
      "https://base.llamarpc.com",
      "https://base-rpc.publicnode.com",
      "https://rpc.ankr.com/base",
    ],
  },
  arbitrum: {
    key: "arbitrum", chain: arbitrum, alchemySlug: "arb-mainnet", openseaChain: "arbitrum",
    explorer: "https://arbiscan.io", weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    publicRpcs: [
      "https://arb1.arbitrum.io/rpc",
      "https://arbitrum-one-rpc.publicnode.com",
      "https://rpc.ankr.com/arbitrum",
    ],
  },
  optimism: {
    key: "optimism", chain: optimism, alchemySlug: "opt-mainnet", openseaChain: "optimism",
    explorer: "https://optimistic.etherscan.io", weth: "0x4200000000000000000000000000000000000006",
    publicRpcs: [
      "https://mainnet.optimism.io",
      "https://optimism-rpc.publicnode.com",
      "https://rpc.ankr.com/optimism",
    ],
  },
  polygon: {
    key: "polygon", chain: polygon, alchemySlug: "polygon-mainnet", openseaChain: "matic",
    explorer: "https://polygonscan.com", weth: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    publicRpcs: [
      "https://polygon-rpc.com",
      "https://polygon-bor-rpc.publicnode.com",
      "https://rpc.ankr.com/polygon",
    ],
  },
};

/** Alchemy RPC (optional — only if key set). Used as the FIRST, fastest endpoint. */
export function alchemyRpcUrl(key: ChainKey): string | null {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) return null;
  return `https://${CHAINS[key].alchemySlug}.g.alchemy.com/v2/${apiKey}`;
}

export function alchemyNftBase(key: ChainKey): string | null {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) return null;
  return `https://${CHAINS[key].alchemySlug}.g.alchemy.com/nft/v3/${apiKey}`;
}

/** Optional user-supplied custom RPCs per chain. Supports a comma-separated list
 *  under RPC_<CHAIN>_URLS (preferred, enables failover across your own RPCs) and
 *  a single-URL RPC_<CHAIN> for convenience. Your RPCs are tried FIRST. */
function customRpcs(key: ChainKey): string[] {
  const upper = key.toUpperCase();
  const list = process.env[`RPC_${upper}_URLS`];
  const single = process.env[`RPC_${upper}`];
  const urls: string[] = [];
  if (list) urls.push(...list.split(",").map((s) => s.trim()).filter(Boolean));
  if (single) urls.push(single.trim());
  return urls;
}

/**
 * Build the ordered RPC list for a chain:
 *   1. user custom RPC (if provided)   ← highest priority
 *   2. Alchemy (if key set)
 *   3. several public RPCs             ← last-resort failover
 * viem's fallback() transport tries them in order and automatically moves to the
 * next on error, so a single endpoint dropping never breaks the app.
 */
export function rpcUrls(key: ChainKey): string[] {
  const urls: string[] = [];
  urls.push(...customRpcs(key));
  const al = alchemyRpcUrl(key);
  if (al) urls.push(al);
  urls.push(...CHAINS[key].publicRpcs);
  // de-dup while preserving order
  return [...new Set(urls)];
}

const clientCache = new Map<ChainKey, PublicClient>();

/** Public client with automatic multi-RPC failover. */
export function publicClient(key: ChainKey): PublicClient {
  if (clientCache.has(key)) return clientCache.get(key)!;
  const transports = rpcUrls(key).map((u) =>
    http(u, { timeout: 12_000, retryCount: 2, retryDelay: 400 }),
  );
  const c = createPublicClient({
    chain: CHAINS[key].chain,
    transport: fallback(transports, { rank: false, retryCount: 1 }),
  }) as PublicClient;
  clientCache.set(key, c);
  return c;
}

/** A write transport (for wallet clients) with the same failover ordering. */
export function writeTransport(key: ChainKey) {
  const transports = rpcUrls(key).map((u) =>
    http(u, { timeout: 15_000, retryCount: 2, retryDelay: 500 }),
  );
  return fallback(transports, { rank: false });
}
