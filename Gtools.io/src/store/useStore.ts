"use client";
import { create } from "zustand";

export type ChainKey = "ethereum" | "base" | "arbitrum" | "optimism" | "polygon";

interface Wallet { id: number; label: string; address: string; is_master: boolean; balances?: any; }
interface Analysis { collection: any; abi: any[]; mintCandidates: any[]; phases: any; notes: string[]; parsed: any; }

interface State {
  authed: boolean;
  unlocked: boolean;
  chain: ChainKey;
  wallets: Wallet[];
  analysis: Analysis | null;
  selectedWallets: string[];
  setAuthed: (v: boolean) => void;
  setUnlocked: (v: boolean) => void;
  setChain: (c: ChainKey) => void;
  setWallets: (w: Wallet[]) => void;
  setAnalysis: (a: Analysis | null) => void;
  toggleWallet: (addr: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
}

export const useStore = create<State>((set, get) => ({
  authed: false,
  unlocked: false,
  chain: "ethereum",
  wallets: [],
  analysis: null,
  selectedWallets: [],
  setAuthed: (v) => set({ authed: v }),
  setUnlocked: (v) => set({ unlocked: v }),
  setChain: (c) => set({ chain: c }),
  setWallets: (w) => set({ wallets: w }),
  setAnalysis: (a) => set({ analysis: a }),
  toggleWallet: (addr) => set((s) => ({
    selectedWallets: s.selectedWallets.includes(addr)
      ? s.selectedWallets.filter((a) => a !== addr)
      : [...s.selectedWallets, addr],
  })),
  selectAll: () => set((s) => ({ selectedWallets: s.wallets.map((w) => w.address) })),
  clearSelection: () => set({ selectedWallets: [] }),
}));
