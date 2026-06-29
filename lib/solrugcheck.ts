// Solana SPL token safety qua GoPlus Solana API (free, khong key).
// Cham diem thich nghi: token thanh khoan sau / trusted thi khoan dung (mature),
// token moi / mong thi nghiem ngat (new). Giong mature mode ben EVM.
// Nguon: https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=<MINT>
import { cached } from "@/lib/cache";
import { fetchMarket, Market } from "@/lib/market";

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
  market: Market;
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
  "LP locked at third-party lockers not indexed by GoPlus (burn and indexed locks ARE detected)",
  "Team intent, social signals, or future dev actions",
  "Insider/sniper wallet clustering beyond top-holder %",
];

const DISCLAIMER =
  "Heuristic check using GoPlus Solana security data: mint/freeze authority, Token-2022 powers (close authority, balance-mutable authority, default-frozen state, mutable metadata, upgradable fee/hook), holder concentration, and LP burn/lock on the main pool. A 'GO' means no red flags in the checks performed, NOT that the token is safe. Scoring adapts: established/GoPlus-trusted tokens are scored leniently (these powers are often legitimate, e.g. major stablecoins); new or thin tokens strictly because the same powers are classic rug tools. LP security is read from GoPlus burn percentage and LP holders; a lock at an unindexed locker may be missed. Never the sole basis for a trade. Do your own research.";

export async function solRugCheck(mint: string, modeOverride?: string): Promise<SolRugResult> {
  const token = mint.trim();
  const explorer = "https://solscan.io/token/" + token;
  const base: SolRugResult = {
    type: "sol-rugcheck", chain: "solana", token, tokenInfo: {},
    mode: "new", basis: "", market: { found: false }, verdict: "CAUTION", reasons: [], checks: [],
    notChecked: NOT_CHECKED, explorer, disclaimer: DISCLAIMER,
  };

  const url = "https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=" + token;
  const [recR, marketR] = await Promise.allSettled([
    cached("goplussol:" + token, 60000, async () => {
      const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
      if (!res.ok) return null;
      const data: any = await res.json();
      const result = data?.result || {};
      return result[token] || result[Object.keys(result)[0]] || null;
    }),
    fetchMarket(token),
  ]);
  const rec: any = recR.status === "fulfilled" ? recR.value : null;
  const market: Market = marketR.status === "fulfilled" ? marketR.value : { found: false };
  base.market = market;

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
  const goplusLiq = dex.reduce((s, d) => s + (num(d.tvl) ?? num(d.liquidity) ?? 0), 0);
  // Uu tien thanh khoan DexScreener (cap nhat hon), fallback GoPlus.
  const totalLiq = market.found && market.liquidityUsd != null ? market.liquidityUsd : goplusLiq;
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

  // ---- Token-2022 quyen nguy hiem ----
  // closable: issuer co the dong token account cua ban (mat token).
  if (b1(rec.closable?.status ?? rec.closable) === true) {
    if (strict) { danger = true; checks.push({ id: "closable", status: "danger", detail: "CLOSE AUTHORITY ACTIVE: issuer can close your token account and seize the tokens. Classic Token-2022 rug vector on a new token." }); }
    else { weight += 1; checks.push({ id: "closable", status: "warn", detail: "Close authority active: issuer can close token accounts. Be aware even for established tokens." }); }
  }

  // balance_mutable_authority: issuer co the sua so du vi cua ban (cuc nguy hiem).
  if (b1(rec.balance_mutable_authority?.status ?? rec.balance_mutable_authority) === true) {
    if (strict) { danger = true; checks.push({ id: "balance_mutable", status: "danger", detail: "BALANCE-MUTABLE AUTHORITY ACTIVE: issuer can change your wallet balance directly. Extreme Token-2022 risk." }); }
    else { weight += 2; checks.push({ id: "balance_mutable", status: "warn", detail: "Balance-mutable authority active: issuer can alter balances. Unusual even for established tokens." }); }
  }

  // default_account_state: "2" = frozen mac dinh (account moi bi dong bang -> honeypot kieu Solana).
  if (String(rec.default_account_state) === "2") {
    danger = true;
    checks.push({ id: "default_state", status: "danger", detail: "Default account state is FROZEN: new holders' accounts start frozen, blocking transfers (honeypot pattern)." });
  } else if (b1(rec.default_account_state_upgradable?.status) === true && strict) {
    weight += 1;
    checks.push({ id: "default_state", status: "warn", detail: "Default-account-state is upgradable: issuer could switch new accounts to frozen later." });
  }

  // metadata_mutable: team doi ten/anh token sau (low risk, info trong mature).
  if (b1(rec.metadata_mutable?.status ?? rec.metadata_mutable) === true) {
    if (strict) { weight += 1; checks.push({ id: "metadata", status: "warn", detail: "Metadata is mutable: name/symbol/image can be changed after launch (impersonation risk on new tokens)." }); }
    else { checks.push({ id: "metadata", status: "info", detail: "Metadata is mutable: issuer can update name/image (common and often legitimate for established projects)." }); }
  }

  // transfer_fee_upgradable / transfer_hook_upgradable: co the bat phi/hook sau.
  if (b1(rec.transfer_fee_upgradable?.status) === true && strict) {
    weight += 1;
    checks.push({ id: "fee_upgradable", status: "warn", detail: "Transfer-fee authority active: a sell fee could be introduced or raised later." });
  }
  if (b1(rec.transfer_hook_upgradable?.status) === true && strict) {
    weight += 1;
    checks.push({ id: "hook_upgradable", status: "warn", detail: "Transfer-hook authority active: a restricting hook could be added later." });
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

  const hasLiq = (market.found && (market.liquidityUsd ?? 0) > 0) || dex.length > 0;
  if (!hasLiq) {
    weight += 2;
    checks.push({ id: "liquidity", status: "warn", detail: "No DEX liquidity found: token may be untradeable or pre-launch." });
  } else {
    const liqStr = totalLiq > 0 ? "~$" + Math.round(totalLiq).toLocaleString() : "present";
    const vol = market.found && market.volume24hUsd != null ? ", 24h vol ~$" + Math.round(market.volume24hUsd).toLocaleString() : "";
    const age = market.found && market.ageDays != null ? ", age ~" + market.ageDays + "d" : "";
    checks.push({ id: "liquidity", status: "ok", detail: "Liquidity " + liqStr + vol + age + ". Scoring mode: " + mode + "." });
  }

  // ---- LP security (burn/lock) tu GoPlus: burn_percent pool chinh + lp_holders ----
  if (dex.length > 0) {
    // pool chinh = TVL cao nhat
    const main = [...dex].sort((a, b) => (num(b.tvl) ?? 0) - (num(a.tvl) ?? 0))[0];
    const mainBurn = main ? num(main.burn_percent) : null;

    // lp_holders: cong phan locked/burned
    const lpHolders: any[] = Array.isArray(rec.lp_holders) ? rec.lp_holders : [];
    let lpSecuredFromHolders = 0;
    for (const h of lpHolders) {
      const p = pct(h.percent) ?? 0;
      const tag = (h.tag || "").toLowerCase();
      const locked = h.is_locked === 1 || h.is_locked === "1" || (Array.isArray(h.locked_detail) && h.locked_detail.length > 0);
      if (locked || tag.includes("burn") || tag.includes("lock") || tag.includes("incinerator")) lpSecuredFromHolders += p;
    }

    const lpSecured = Math.max(mainBurn ?? 0, lpSecuredFromHolders);
    if (lpSecured >= 90) {
      checks.push({ id: "lp_security", status: "ok", detail: "LP secured (~" + lpSecured.toFixed(1) + "% burned/locked on the main pool): liquidity cannot be pulled." });
    } else if (lpSecured > 0) {
      if (strict) weight += 1;
      checks.push({ id: "lp_security", status: strict ? "warn" : "info", detail: "LP only ~" + lpSecured.toFixed(1) + "% burned/locked on the main pool: most liquidity could be removed." });
    } else {
      if (strict) weight += 2;
      checks.push({ id: "lp_security", status: strict ? "warn" : "info", detail: "LP not detectably burned or locked on the main pool" + (strict ? ": liquidity could be pulled (rug risk). Lock at an unindexed locker may be missed." : " (mature tokens may hold LP in unindexed lockers; detection is partial).") });
    }
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
