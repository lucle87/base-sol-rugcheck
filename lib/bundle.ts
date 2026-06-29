// Bundle / sniper detection cho token Solana (v1).
// Y tuong: nhieu vi khac nhau MUA token trong cung mot slot (block ~400ms) la
// dau hieu insider/bot gom co to chuc (bundle), khong phai mua tu nhien.
//
// Nguon: Helius Enhanced Transactions API (parsed). Lay batch giao dich SWAP gan
// nhat cua token, xac dinh nguoi mua = feePayer (vi khoi tao swap, nhan token),
// nhom theo slot, tim cum.
//
// GIOI HAN (noi thang, ghi trong note tra ve):
//  - Batch la cac swap GAN NHAT, KHONG chac la luc launch. Voi token MOI launch
//    thi gan nhat == luc launch -> dung. Voi token CU, day la cum gan day, it y
//    nghia hon. v1 khong phan trang ve tan launch (ton nhieu call, cham, de rate
//    limit cho mot endpoint tra phi).
//  - feePayer = nguoi mua la heuristic; aggregator/MEV co the tra phi ho nguoi khac.
//  - % token tinh tuong doi tren cua so phan tich (khong doc total supply).

const WSOL = "So11111111111111111111111111111111111111112";

type Buy = { slot: number; buyer: string; amount: number; ts: number; sig: string };

function heliusUrl(mint: string, key: string, limit: number): string {
  const base = "https://api-mainnet.helius-rpc.com/v0/addresses/" + mint + "/transactions";
  return base + "?api-key=" + encodeURIComponent(key) + "&limit=" + limit + "&type=SWAP";
}

export type BundleResult = {
  type: "bundle-check";
  token: string;
  window: { txAnalyzed: number; swaps: number; firstSlot: number | null; lastSlot: number | null; spanSlots: number | null; firstTs: number | null; lastTs: number | null };
  buys: number;
  distinctBuyers: number;
  largestSlotCluster: { slot: number; buyers: number; tokensBought: number } | null;
  clusters: { slot: number; buyers: number; tokensBought: number }[];
  clusterBuyerShare: number | null; // % token (cua so nay) ma cum lon nhat gom
  bundleVerdict: "CLEAN" | "SUSPICIOUS" | "LIKELY_BUNDLE" | "UNKNOWN";
  reasons: string[];
  note: string;
};

export async function bundleCheck(mint: string): Promise<BundleResult> {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error("HELIUS_API_KEY not configured.");

  const LIMIT = 100;
  const ctrl = new AbortController();
  const tt = setTimeout(() => ctrl.abort(), 8000);
  let res: Response;
  try {
    res = await fetch(heliusUrl(mint, key, LIMIT), {
      headers: { "User-Agent": "base-sol-rugcheck/1.0" },
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch (e: any) {
    throw new Error(e?.name === "AbortError" ? "Helius timeout after 8000ms" : "Helius fetch failed");
  } finally {
    clearTimeout(tt);
  }
  if (!res.ok) throw new Error("Helius HTTP " + res.status);
  const txs = await res.json();
  if (!Array.isArray(txs)) throw new Error("Unexpected Helius response.");

  const swaps = txs.filter((t: any) => t && (t.type === "SWAP" || (Array.isArray(t.tokenTransfers) && t.tokenTransfers.length)));

  // Xac dinh nguoi mua moi swap: feePayer nhan token (mint = token) -> mua.
  const buys: Buy[] = [];
  for (const t of swaps) {
    const actor = t.feePayer;
    if (!actor) continue;
    const transfers: any[] = Array.isArray(t.tokenTransfers) ? t.tokenTransfers : [];
    let net = 0;
    for (const tr of transfers) {
      if (tr?.mint !== mint) continue; // chi quan tam token nay (bo WSOL)
      const amt = Number(tr.tokenAmount) || 0;
      if (tr.toUserAccount === actor) net += amt;   // nhan token -> mua
      if (tr.fromUserAccount === actor) net -= amt; // gui token -> ban
    }
    if (net > 0) {
      buys.push({ slot: Number(t.slot) || 0, buyer: actor, amount: net, ts: Number(t.timestamp) || 0, sig: t.signature || "" });
    }
  }

  const slots = swaps.map((t: any) => Number(t.slot) || 0).filter((s: number) => s > 0);
  const firstSlot = slots.length ? Math.min(...slots) : null;
  const lastSlot = slots.length ? Math.max(...slots) : null;
  const tsAll = swaps.map((t: any) => Number(t.timestamp) || 0).filter((s: number) => s > 0);
  const firstTs = tsAll.length ? Math.min(...tsAll) : null;
  const lastTs = tsAll.length ? Math.max(...tsAll) : null;

  // Nhom nguoi mua theo slot (vi DISTINCT trong moi slot)
  const bySlot = new Map<number, Map<string, number>>();
  for (const b of buys) {
    if (!bySlot.has(b.slot)) bySlot.set(b.slot, new Map());
    const m = bySlot.get(b.slot)!;
    m.set(b.buyer, (m.get(b.buyer) || 0) + b.amount);
  }

  const clusters = Array.from(bySlot.entries())
    .map(([slot, m]) => ({
      slot,
      buyers: m.size,
      tokensBought: Number(Array.from(m.values()).reduce((s, x) => s + x, 0).toFixed(4)),
    }))
    .filter((c) => c.buyers >= 2)
    .sort((a, b) => b.buyers - a.buyers);

  const largest = clusters.length ? clusters[0] : null;
  const distinctBuyers = new Set(buys.map((b) => b.buyer)).size;
  const totalTokensBought = buys.reduce((s, b) => s + b.amount, 0);
  const clusterShare = largest && totalTokensBought > 0
    ? Number(((largest.tokensBought / totalTokensBought) * 100).toFixed(1))
    : null;

  // Verdict heuristic theo cum lon nhat trong mot slot
  let verdict: BundleResult["bundleVerdict"] = "CLEAN";
  const reasons: string[] = [];
  if (!slots.length) {
    verdict = "UNKNOWN";
    reasons.push("No swap activity returned for this token (may be brand new, illiquid, or not indexed).");
  } else if (largest && largest.buyers >= 5) {
    verdict = "LIKELY_BUNDLE";
    reasons.push(largest.buyers + " distinct wallets bought in the SAME slot (" + largest.slot + "): strong coordinated-buy / bundle signal.");
  } else if (largest && largest.buyers >= 3) {
    verdict = "SUSPICIOUS";
    reasons.push(largest.buyers + " distinct wallets bought in one slot (" + largest.slot + "): possible coordinated entry.");
  } else {
    reasons.push("No slot had 3+ distinct buyers in the analyzed window: no obvious bundle pattern.");
  }
  if (clusterShare != null && clusterShare >= 50 && verdict !== "CLEAN") {
    reasons.push("That cluster grabbed ~" + clusterShare + "% of tokens bought in the analyzed window.");
  }

  return {
    type: "bundle-check",
    token: mint,
    window: {
      txAnalyzed: txs.length,
      swaps: swaps.length,
      firstSlot, lastSlot,
      spanSlots: firstSlot != null && lastSlot != null ? lastSlot - firstSlot : null,
      firstTs, lastTs,
    },
    buys: buys.length,
    distinctBuyers,
    largestSlotCluster: largest,
    clusters: clusters.slice(0, 10),
    clusterBuyerShare: clusterShare,
    bundleVerdict: verdict,
    reasons,
    note: "Analyzes the MOST RECENT swaps (up to 100), grouping buyers by slot. Most accurate for freshly launched tokens, where recent swaps ARE the launch window; for older tokens this reflects recent clustering, not the launch. Buyer = swap fee payer (heuristic; aggregators/MEV may pay for others). Token % is relative to this window, not total supply. A bundle signal is a risk flag, not proof of malice.",
  };
}
