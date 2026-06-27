import { type Abi, type Address, getAddress, formatEther, decodeFunctionData } from "viem";
import { publicClient, CHAINS, type ChainKey } from "./chains";

const ERC165_ABI = [
  {
    type: "function",
    name: "supportsInterface",
    stateMutability: "view",
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const COMMON_VIEW_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MAX_SUPPLY", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "mintPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "price", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "cost", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const IID_ERC721 = "0x80ac58cd";
const IID_ERC1155 = "0xd9b67a26";

const CHAIN_IDS: Record<ChainKey, number> = {
  ethereum: 1, base: 8453, arbitrum: 42161, optimism: 10, polygon: 137,
};

async function fetchAbi(address: Address, chain: ChainKey): Promise<{ abi: Abi | null; implementation?: Address; verified: boolean }> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return { abi: null, verified: false };
  const base = `https://api.etherscan.io/v2/api?chainid=${CHAIN_IDS[chain]}`;

  // getsourcecode reveals proxy + implementation
  try {
    const srcRes = await fetch(`${base}&module=contract&action=getsourcecode&address=${address}&apikey=${key}`);
    const srcJson = await srcRes.json();
    const entry = srcJson?.result?.[0];
    let target = address;
    let implementation: Address | undefined;
    if (entry?.Proxy === "1" && entry?.Implementation && /^0x[a-fA-F0-9]{40}$/.test(entry.Implementation)) {
      implementation = getAddress(entry.Implementation);
      target = implementation;
    }
    const abiRes = await fetch(`${base}&module=contract&action=getabi&address=${target}&apikey=${key}`);
    const abiJson = await abiRes.json();
    if (abiJson?.status === "1" && abiJson.result && abiJson.result !== "Contract source code not verified") {
      return { abi: JSON.parse(abiJson.result) as Abi, implementation, verified: true };
    }
    return { abi: null, implementation, verified: false };
  } catch {
    return { abi: null, verified: false };
  }
}

export interface MintCandidate {
  name: string;
  signature: string;
  inputs: { name: string; type: string }[];
  payable: boolean;
  // heuristic confidence 0..1 that this is the primary mint entrypoint
  score: number;
}

function findMintFunctions(abi: Abi): MintCandidate[] {
  const out: MintCandidate[] = [];
  for (const item of abi) {
    if (item.type !== "function") continue;
    const n = item.name.toLowerCase();
    const isMintish = /mint|claim|purchase|buy|drop/.test(n);
    if (!isMintish) continue;
    const payable = item.stateMutability === "payable";
    const inputs = (item.inputs ?? []).map((i) => ({ name: i.name ?? "", type: i.type }));
    let score = 0;
    if (n === "mint") score += 0.4;
    if (/mint|claim|purchase/.test(n)) score += 0.2;
    if (payable) score += 0.2;
    // public-mint shapes: mint(uint256) / mint(address,uint256) / claim(...)
    const hasQty = inputs.some((i) => /quantity|amount|count|numberof|qty|_amount|tokencount/i.test(i.name) || i.type === "uint256");
    if (hasQty) score += 0.15;
    // allowlist shapes include bytes32[] proof
    const hasProof = inputs.some((i) => i.type === "bytes32[]");
    if (hasProof) score += 0.05; // still a mint, just gated
    out.push({
      name: item.name,
      signature: `${item.name}(${inputs.map((i) => i.type).join(",")})`,
      inputs,
      payable,
      score: Math.min(score, 1),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

async function tryRead<T>(addr: Address, chain: ChainKey, abi: readonly unknown[], fn: string): Promise<T | null> {
  try {
    return (await publicClient(chain).readContract({ address: addr, abi: abi as Abi, functionName: fn })) as T;
  } catch {
    return null;
  }
}

export interface CollectionInfo {
  address: Address;
  chain: ChainKey;
  standard: "ERC721" | "ERC1155" | "unknown";
  name: string | null;
  symbol: string | null;
  totalSupply: string | null;
  maxSupply: string | null;
  remaining: string | null;
  mintPriceWei: string | null;
  mintPriceEth: string | null;
  owner: Address | null;
  verified: boolean;
  isProxy: boolean;
  implementation: Address | null;
  explorerUrl: string;
}

export interface AnalysisResult {
  collection: CollectionInfo;
  abi: Abi | null;
  mintCandidates: MintCandidate[];
  notes: string[];
}

export async function analyzeContract(address: Address, chain: ChainKey): Promise<AnalysisResult> {
  const notes: string[] = [];
  const client = publicClient(chain);

  // Verify there is code at the address
  const code = await client.getCode({ address }).catch(() => null);
  if (!code || code === "0x") {
    notes.push("No contract bytecode at this address on the selected chain. Wrong chain?");
  }

  // Standard detection via ERC165
  let standard: CollectionInfo["standard"] = "unknown";
  const is721 = await tryRead<boolean>(address, chain, ERC165_ABI, "supportsInterface").catch(() => null);
  // supportsInterface needs an arg; do explicit calls
  async function supports(id: string): Promise<boolean> {
    try {
      return (await client.readContract({ address, abi: ERC165_ABI, functionName: "supportsInterface", args: [id as `0x${string}`] })) as boolean;
    } catch { return false; }
  }
  if (await supports(IID_ERC721)) standard = "ERC721";
  else if (await supports(IID_ERC1155)) standard = "ERC1155";
  else notes.push("ERC165 interface check inconclusive; standard inferred as unknown.");
  void is721;

  const { abi, implementation, verified } = await fetchAbi(address, chain);
  if (!verified) notes.push("Contract source not verified on explorer; ABI-based features limited to on-chain reads.");

  const name = await tryRead<string>(address, chain, COMMON_VIEW_ABI, "name");
  const symbol = await tryRead<string>(address, chain, COMMON_VIEW_ABI, "symbol");
  const totalSupply = await tryRead<bigint>(address, chain, COMMON_VIEW_ABI, "totalSupply");

  let maxSupply = await tryRead<bigint>(address, chain, COMMON_VIEW_ABI, "maxSupply");
  if (maxSupply === null) maxSupply = await tryRead<bigint>(address, chain, COMMON_VIEW_ABI, "MAX_SUPPLY");

  let priceWei = await tryRead<bigint>(address, chain, COMMON_VIEW_ABI, "mintPrice");
  if (priceWei === null) priceWei = await tryRead<bigint>(address, chain, COMMON_VIEW_ABI, "price");
  if (priceWei === null) priceWei = await tryRead<bigint>(address, chain, COMMON_VIEW_ABI, "cost");

  const owner = await tryRead<Address>(address, chain, COMMON_VIEW_ABI, "owner");

  const remaining =
    maxSupply !== null && totalSupply !== null ? (maxSupply - totalSupply).toString() : null;

  const mintCandidates = abi ? findMintFunctions(abi) : [];
  if (abi && mintCandidates.length === 0) notes.push("No obvious mint function found in ABI; manual function selection may be required.");

  return {
    abi,
    mintCandidates,
    notes,
    collection: {
      address,
      chain,
      standard,
      name,
      symbol,
      totalSupply: totalSupply?.toString() ?? null,
      maxSupply: maxSupply?.toString() ?? null,
      remaining,
      mintPriceWei: priceWei?.toString() ?? null,
      mintPriceEth: priceWei !== null ? formatEther(priceWei) : null,
      owner: owner ?? null,
      verified,
      isProxy: !!implementation,
      implementation: implementation ?? null,
      explorerUrl: `${CHAINS[chain].explorer}/address/${address}`,
    },
  };
}

export { decodeFunctionData };
