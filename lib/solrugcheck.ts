// Solana SPL token safety qua GoPlus Solana API (free, khong key).
// Cham diem thich nghi: token thanh khoan sau / trusted thi khoan dung (mature),
// token moi / mong thi nghiem ngat (new). Giong mature mode ben EVM.
// Nguon: https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=<MINT>

const UA = "sol-rugcheck/1.0";
const MATURE_LIQ = 1000000; // >= $1M thanh khoan => established

export type Severity = "ok" | "warn" | "danger" | "info";
export type Check = { id: string; status: Severity; detail: string };
export type SolRugResult = {
  type: "sol-rugcheck";
  chain: "solana";
  token: string;
  tokenInfo: { name?: string | null; symbol?: string | null; totalSupply?: string | null };
  mode: "new" | "mature";
  basis: string;
  verdict: "GO" | "CAUTION" | "DANGER";
  reasons: string[];
  checks: Check[];
  notChecked: string[];
  explorer: string;
  disclaimer: string;
};

export function isSolanaMint(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim());
}

function b1(v: any): boolean | null {
  if (v === "1" || v === 1 || v === true) return true;
  if (v === "0" || v === 0 || v === false) return false;
  return null;
}
function num(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function pct(v: any): number | null {
  const n = num(v);
  if (n == null) return null;
  return Number((n <= 1 ? n * 100 : n).toFixed(2));
}

const NOT_CHECKED = [
  "Off-chain liquidity locks in third-party lockers",
  "Team intent, social signals, or future dev actions",
  "Insider/sniper wallet clustering beyond top-holder %",
];

const DISCLAIMER =
  "Heuristic check using GoPlus Solana security data (mint/freeze authority, transfer controls, holders, liquidity). A 'GO' means no red flags in the checks performed, NOT that the token is safe. Scoring adapts to liquidity: established tokens (deep liquidity or GoPlus-trusted, e.g. major stablecoins) are scored leniently because freeze/mint authority is often legitimate for them; new or thin tokens are scored strictly because those same powers are classic rug tools. Does not detect off-chain locks or team intent. Never the sole basis for a trade. Do your own research.";

export async function solRugCheck(mint: string, modeOverride?: string): Promise<SolRugResult> {
  const token = mint.trim();
  const explorer = "https://solscan.io/token/" + token;
  const base: SolRugResult = {
    type: "sol-rugcheck", chain: "solana", token, tokenInfo: {},
    mode: "new", basis: "", verdict: "CAUTION", reasons: [], checks: [],
    notChecked: NOT_CHECKED, explorer, disclaimer: DISCLAIMER,
  };

  const url = "https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=" + token;
  let rec: any = null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (res.ok) {
      const data: any = await res.json();
      const result = data?.result || {};
      rec = result[token] || result[Object.keys(result)[0]] || null;
    }
  } catch { rec = null; }

  if (!rec) {
    base.verdict = "CAUTION"; base.basis = "no data";
    base.checks.push({ id: "data", status: "info", detail: "No GoPlus security data returned for this mint (new, illiquid, or unsupported)." });
    base.reasons = ["Insufficient data to assess this token."];
    return base;
  }

  const meta = rec.metadata || {};
  base.tokenInfo = {
    name: meta.name || rec.name || null,
    symbol: meta.symbol || rec.symbol || null,
    totalSupply: rec.total_supply != null ? String(rec.total_supply) : null,
  };

  const dex: any[] = Array.isArray(rec.dex) ? rec.dex : [];
  const totalLiq = dex.reduce((s, d) => s + (num(d.tvl) ?? num(d.liquidity) ?? 0), 0);
  const trusted = b1(rec.trusted_token) === true;

  let mode: "new" | "mature";
  let basis: string;
  if (modeOverride === "new" || modeOverride === "mature") {
    mode = modeOverride; basis = "forced " + modeOverride;
  } else if (trusted) {
    mode = "mature"; basis = "GoPlus trusted token";
  } else if (totalLiq >= MATURE_LIQ) {
    mode = "mature"; basis = "deep liquidity (~$" + Math.round(totalLiq).toLocaleString() + " >= $" + MATURE_LIQ.toLocaleString() + ")";
  } else {
    mode = "new"; basis = totalLiq > 0 ? "shallow liquidity (~$" + Math.round(totalLiq).toLocaleString() + ")" : "no/low liquidity";
  }
  const strict = mode === "new";
  base.mode = mode; base.basis = basis;

  const checks: Check[] = [];
  let weight = 0;
  let danger = false;

  const freezable = b1(rec.freezable?.status ?? rec.freezable);
  if (freezable === true) {
    if (strict) {
      danger = true;
      checks.push({ id: "freeze", status: "danger", detail: "FREEZE AUTHORITY ACTIVE: issuer can freeze your token account, blocking selling. On a new/thin token this is a classic rug/honeypot setup." });
    } else {
      weight += 1;
      checks.push({ id: "freeze", status: "warn", detail: "Freeze authority active. The issuer can freeze accounts. For an established token (e.g. a major stablecoin) this is often a legitimate compliance control, but be aware of it." });
    }
  } else if (freezable === false) {
    checks.push({ id: "freeze", status: "ok", detail: "Freeze authority renounced: issuer cannot freeze your account." });
  }

  const mintable = b1(rec.mintable?.status ?? rec.mintable);
  if (mintable === true) {
    if (strict) {
      weight += 3;
      checks.push({ id: "mint", status: "warn", detail: "Mint authority active: issuer can mint more supply (dilution / rug risk)." });
    } else {
      weight += 1;
      checks.push({ id: "mint", status: "warn", detail: "Mint authority active: supply can increase. Often legitimate for stablecoins/established tokens, but it is a centralization point." });
    }
  } else if (mintable === false) {
    checks.push({ id: "mint", status: "ok", detail: "Mint authority renounced: fixed supply." });
  }

  if (b1(rec.non_transferable) === true) {
    danger = true;
    checks.push({ id: "transfer", status: "danger", detail: "Token is non-transferable." });
  }
  if (b1(rec.transfer_hook?.status ?? rec.transfer_hook) === true || (Array.isArray(rec.transfer_hook) && rec.transfer_hook.length)) {
    weight += strict ? 2 : 1;
    checks.push({ id: "transfer_hook", status: "warn", detail: "Transfer hook present (Token-2022): transfers can be programmatically restricted." });
  }
  const transferFee = pct(rec.transfer_fee?.fee_rate ?? rec.transfer_fee);
  if (transferFee != null && transferFee > 0) {
    if (transferFee >= 50) { danger = true; checks.push({ id: "transfer_fee", status: "danger", detail: "Extreme transfer fee (~" + transferFee + "%): selling effectively blocked." }); }
    else if (transferFee >= 10) { weight += 2; checks.push({ id: "transfer_fee", status: "warn", detail: "High transfer fee (~" + transferFee + "%)." }); }
    else { checks.push({ id: "transfer_fee", status: "ok", detail: "Transfer fee low (~" + transferFee + "%)." }); }
  }

  const holders: any[] = Array.isArray(rec.holders) ? rec.holders : [];
  const real = holders.filter((h) => {
    const tag = (h.tag || "").toLowerCase();
    if (tag.includes("lock") || tag.includes("burn") || tag.includes("lp") || tag.includes("pool")) return false;
    if (h.is_locked === 1 || h.is_locked === "1") return false;
    return true;
  });
  const pcts = real.map((h) => pct(h.percent)).filter((x): x is number => x != null).sort((a, b) => b - a);
  if (pcts.length) {
    const top = pcts[0];
    const top10 = Number(pcts.slice(0, 10).reduce((s, x) => s + x, 0).toFixed(2));
    if (top >= 50) { weight += strict ? 3 : 1; checks.push({ id: "concentration", status: strict ? "danger" : "warn", detail: "Top holder controls ~" + top + "% of supply (excl. LP): single-wallet dump risk." }); }
    else if (top10 >= 70) { weight += strict ? 2 : 1; checks.push({ id: "concentration", status: "warn", detail: "Top 10 holders control ~" + top10 + "% (excl. LP): concentrated." }); }
    else { checks.push({ id: "concentration", status: "ok", detail: "Distribution: top holder ~" + top + "%, top10 ~" + top10 + "% (excl. LP)." }); }
  }

  if (dex.length === 0) {
    weight += 2;
    checks.push({ id: "liquidity", status: "warn", detail: "No DEX liquidity found: token may be untradeable or pre-launch." });
  } else if (totalLiq > 0) {
    checks.push({ id: "liquidity", status: "ok", detail: "DEX liquidity present (~$" + Math.round(totalLiq).toLocaleString() + " across " + dex.length + " pool(s)). Scoring mode: " + mode + "." });
  } else {
    checks.push({ id: "liquidity", status: "info", detail: "Listed on " + dex.length + " DEX pool(s). Scoring mode: " + mode + "." });
  }

  const creators: any[] = Array.isArray(rec.creators) ? rec.creators : [];
  if (creators.length) {
    const c0 = creators[0];
    const cAddr = c0.address || c0.account || null;
    if (cAddr) checks.push({ id: "creator", status: "info", detail: "Creator: " + cAddr + "." });
  }

  if (danger) base.verdict = "DANGER";
  else if (weight >= (strict ? 4 : 3)) base.verdict = "DANGER";
  else if (weight >= 1) base.verdict = "CAUTION";
  else base.verdict = "GO";

  let reasons = checks.filter((c) => c.status === "warn" || c.status === "danger").map((c) => c.detail);
  if (reasons.length === 0) reasons = ["No red flags detected in the checks performed."];
  base.checks = checks;
  base.reasons = reasons;
  return base;
}
