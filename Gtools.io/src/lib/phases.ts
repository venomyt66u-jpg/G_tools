import { type Abi, type Address, formatEther } from "viem";
import { publicClient, type ChainKey } from "./chains";

/**
 * Mint "phases" are NOT standardized on EVM. Every framework encodes them
 * differently, and many custom contracts have ad-hoc booleans
 * (publicSaleActive, presaleActive...). There is no universal reader.
 *
 * This module:
 *  1. Detects the contract FAMILY from its ABI fingerprint.
 *  2. For families we understand (Thirdweb Drop's claimCondition), reads real
 *     phase data on-chain.
 *  3. For everything else, surfaces likely phase-toggle view functions so you
 *     can select manually. It does NOT fabricate phases it cannot read.
 */

export interface Phase {
  name: string;
  startTime: number | null; // unix seconds
  endTime: number | null;
  priceEth: string | null;
  walletLimit: string | null;
  requiresProof: boolean;
  raw?: unknown;
}

export interface PhaseReport {
  family: "thirdweb-drop" | "manifold" | "generic-toggle" | "unknown";
  phases: Phase[];
  toggles?: string[]; // view fns that look like phase flags, for manual use
  note?: string;
}

const THIRDWEB_ABI = [
  {
    type: "function",
    name: "claimCondition",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "currentStartId", type: "uint256" },
      { name: "count", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getClaimConditionById",
    stateMutability: "view",
    inputs: [{ name: "_conditionId", type: "uint256" }],
    outputs: [
      {
        name: "condition",
        type: "tuple",
        components: [
          { name: "startTimestamp", type: "uint256" },
          { name: "maxClaimableSupply", type: "uint256" },
          { name: "supplyClaimed", type: "uint256" },
          { name: "quantityLimitPerWallet", type: "uint256" },
          { name: "merkleRoot", type: "bytes32" },
          { name: "pricePerToken", type: "uint256" },
          { name: "currency", type: "address" },
          { name: "metadata", type: "string" },
        ],
      },
    ],
  },
] as const;

function abiHasFunction(abi: Abi, name: string): boolean {
  return abi.some((i) => i.type === "function" && i.name === name);
}

export async function detectPhases(address: Address, chain: ChainKey, abi: Abi): Promise<PhaseReport> {
  const client = publicClient(chain);

  // Thirdweb Drop family
  if (abiHasFunction(abi, "claimCondition") && abiHasFunction(abi, "getClaimConditionById")) {
    try {
      const cc = (await client.readContract({ address, abi: THIRDWEB_ABI, functionName: "claimCondition" })) as readonly [bigint, bigint];
      const [startId, count] = cc;
      const phases: Phase[] = [];
      for (let i = 0n; i < count; i++) {
        const id = startId + i;
        const res = (await client.readContract({ address, abi: THIRDWEB_ABI, functionName: "getClaimConditionById", args: [id] })) as {
          startTimestamp: bigint; maxClaimableSupply: bigint; supplyClaimed: bigint;
          quantityLimitPerWallet: bigint; merkleRoot: `0x${string}`; pricePerToken: bigint; currency: Address; metadata: string;
        };
        const gated = res.merkleRoot !== "0x0000000000000000000000000000000000000000000000000000000000000000";
        phases.push({
          name: res.metadata?.trim() || (gated ? `Allowlist phase ${i}` : `Public phase ${i}`),
          startTime: Number(res.startTimestamp),
          endTime: null, // thirdweb phases end when the next one starts
          priceEth: formatEther(res.pricePerToken),
          walletLimit: res.quantityLimitPerWallet.toString(),
          requiresProof: gated,
          raw: { conditionId: id.toString() },
        });
      }
      // infer end times as next phase start
      for (let i = 0; i < phases.length - 1; i++) phases[i].endTime = phases[i + 1].startTime;
      return { family: "thirdweb-drop", phases, note: "Phases read from Thirdweb claimConditions on-chain." };
    } catch (e) {
      return { family: "thirdweb-drop", phases: [], note: `Thirdweb family detected but read failed: ${(e as Error).message}` };
    }
  }

  // Generic toggle detection: view bools that look like sale flags
  const toggleNames = abi
    .filter((i) => i.type === "function" && i.stateMutability === "view" && (i.outputs?.length === 1) && i.outputs?.[0].type === "bool")
    .map((i) => (i as { name: string }).name)
    .filter((n) => /sale|presale|public|allowlist|whitelist|mint(ing)?active|claim|live/i.test(n));

  if (toggleNames.length) {
    const toggles: string[] = [];
    for (const n of toggleNames) {
      try {
        const v = await client.readContract({ address, abi, functionName: n });
        toggles.push(`${n} = ${v}`);
      } catch { toggles.push(`${n} = (read failed)`); }
    }
    return {
      family: "generic-toggle",
      phases: [],
      toggles,
      note: "No standard phase schema. Showing boolean sale-flag view functions read on-chain. Select your mint phase manually based on these.",
    };
  }

  return {
    family: "unknown",
    phases: [],
    note: "No recognizable phase structure. Use manual function selection from the ABI and set price/quantity yourself.",
  };
}
