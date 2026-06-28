// Market data cho token Solana tu DexScreener (free, khong key).
// Nguon: https://api.dexscreener.com/latest/dex/tokens/{mint}
import { cached } from "@/lib/cache";

const UA = "sol-rugcheck/1.0";

export type Market = {
  found: boolean;
  symbol?: string | null;
  priceUsd?: number | null;
  priceChange24hPct?: number | null;
  liquidityUsd?: number | null;
  volume24hUsd?: number | null;
  fdvUsd?: number | null;
  marketCapUsd?: number | null;
  dex?: string | null;
  ageDays?: number | null;
  pairUrl?: string | null;
};

export async function fetchMarket(mint: string): Promise<Market> {
  const addr = mint.trim();
  const key = "dexscreener:sol:" + addr;
  try {
    return await cached(key, 30000, async () => {
      const url = "https://api.dexscreener.com/latest/dex/tokens/" + addr;
      const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
      if (!res.ok) return { found: false };
      const data: any = await res.json();
      let pairs: any[] = Array.isArray(data?.pairs) ? data.pairs : [];
      const want = addr.toLowerCase();
      // Chi giu cap ma token dang hoi la baseToken (de priceUsd dung la gia token nay,
      // khong phai token doi ung). DexScreener tra ca cap ma no la quoteToken.
      pairs = pairs.filter(
        (p) =>
          (p.chainId || "").toLowerCase() === "solana" &&
          (p?.baseToken?.address || "").toLowerCase() === want
      );
      if (!pairs.length) return { found: false };
      pairs.sort((a, b) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0));
      const p = pairs[0];
      const created = p?.pairCreatedAt ? Number(p.pairCreatedAt) : null;
      const ageDays = created ? Number(((Date.now() - created) / 86400000).toFixed(1)) : null;
      return {
        found: true,
        symbol: p?.baseToken?.symbol || null,
        priceUsd: p?.priceUsd ? Number(p.priceUsd) : null,
        priceChange24hPct: p?.priceChange?.h24 ?? null,
        liquidityUsd: p?.liquidity?.usd ?? null,
        volume24hUsd: p?.volume?.h24 ?? null,
        fdvUsd: p?.fdv ?? null,
        marketCapUsd: p?.marketCap ?? null,
        dex: p?.dexId || null,
        ageDays,
        pairUrl: p?.url || null,
      };
    });
  } catch {
    return { found: false };
  }
}
