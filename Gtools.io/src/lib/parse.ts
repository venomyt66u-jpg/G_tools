import type { ChainKey } from "./chains";
import { isAddress, getAddress } from "viem";

export interface ParsedTarget {
  address?: `0x${string}`;
  chain?: ChainKey;
  source: string; // human label of what was detected
  raw: string;
}

/**
 * Accepts a raw paste: bare contract address, or a URL from OpenSea / Zora /
 * Manifold / Highlight / generic mint sites. Extracts contract address + chain
 * where it can be reliably read from the URL itself. Where the address can't be
 * read from the URL (e.g. a project's vanity mint page), we return what we can
 * and the analyzer will attempt resolution on-chain / via the page.
 */
export function parseTarget(input: string): ParsedTarget {
  const raw = input.trim();

  // Bare address
  if (isAddress(raw)) {
    return { address: getAddress(raw), source: "contract address", raw };
  }

  let url: URL | null = null;
  try {
    url = new URL(raw);
  } catch {
    // Maybe "chain:address" form or address with junk
    const m = raw.match(/0x[a-fA-F0-9]{40}/);
    if (m) return { address: getAddress(m[0]), source: "address in text", raw };
    return { source: "unrecognized", raw };
  }

  const host = url.hostname.replace(/^www\./, "");
  const segs = url.pathname.split("/").filter(Boolean);
  const addrInPath = url.pathname.match(/0x[a-fA-F0-9]{40}/)?.[0];

  const chainFromOpenSea: Record<string, ChainKey> = {
    ethereum: "ethereum",
    base: "base",
    arbitrum: "arbitrum",
    optimism: "optimism",
    matic: "polygon",
    polygon: "polygon",
  };

  // OpenSea: /assets/<chain>/<addr>/<id>  or  /collection/<slug>
  if (host.endsWith("opensea.io")) {
    const chainSeg = segs.find((s) => s in chainFromOpenSea);
    return {
      address: addrInPath ? getAddress(addrInPath) : undefined,
      chain: chainSeg ? chainFromOpenSea[chainSeg] : undefined,
      source: "OpenSea URL",
      raw,
    };
  }

  // Zora: zora.co/collect/<chain>:<addr>/<id>  where chain is eth|base|oeth|zora
  if (host.endsWith("zora.co")) {
    const zoraChain: Record<string, ChainKey> = {
      eth: "ethereum",
      base: "base",
      oeth: "optimism",
      arb: "arbitrum",
    };
    const m = url.pathname.match(/([a-z]+):(0x[a-fA-F0-9]{40})/);
    if (m) {
      return {
        address: getAddress(m[2]),
        chain: zoraChain[m[1]],
        source: "Zora URL",
        raw,
      };
    }
  }

  // Manifold: app pages embed contract in query or path
  if (host.includes("manifold.xyz") || host.includes("manifold.gallery")) {
    return { address: addrInPath ? getAddress(addrInPath) : undefined, source: "Manifold URL", raw };
  }

  // Highlight: highlight.xyz/mint/<chain>:<addr> or /mint/<addr>
  if (host.includes("highlight.xyz")) {
    const m = url.pathname.match(/(?:([a-z]+):)?(0x[a-fA-F0-9]{40})/);
    const hlChain: Record<string, ChainKey> = { base: "base", eth: "ethereum", ethereum: "ethereum" };
    if (m) return { address: getAddress(m[2]), chain: m[1] ? hlChain[m[1]] : undefined, source: "Highlight URL", raw };
  }

  // Generic: any URL that contains an address
  if (addrInPath) {
    return { address: getAddress(addrInPath), source: `mint URL (${host})`, raw };
  }

  return { source: `mint URL (${host}) — no address in URL`, raw };
}
