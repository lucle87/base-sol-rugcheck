import { BASE_URL, SOL_PAY_TO, EVM_PAY_TO, PRICE_USD, SOL_ENABLED } from "@/lib/x402config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const lines = [
    "# sol-rugcheck - Solana token safety for AI agents",
    "",
    "Pre-trade safety check for Solana SPL tokens. Pay-per-call $" + PRICE_USD + " USDC via x402 on Solana or Base. No API key.",
    "",
    "## Endpoint",
    "POST " + BASE_URL + "/api/rugcheck",
    "Body: { \"token\": \"<solana mint address>\" }",
    "",
    "## What it checks (GoPlus Solana data)",
    "- Freeze authority (can the issuer freeze your account and block selling)",
    "- Mint authority (can the issuer mint more supply)",
    "- Transfer controls (Token-2022 transfer hook / transfer fee)",
    "- Holder concentration (top holder and top-10 %, excluding LP)",
    "- DEX liquidity presence, plus LP burn/lock on the main pool (from GoPlus)",
    "- Token-2022 powers: close authority, balance-mutable authority, default-frozen state, mutable metadata, upgradable transfer fee/hook",
    "",
    "## Verdict",
    "GO / CAUTION / DANGER. Freeze authority active or non-transferable forces DANGER.",
    "A GO means no red flags were found in the checks performed, NOT \"safe\".",
    "",
    "## Payment",
    "Unpaid requests return HTTP 402 with x402 terms (USDC).",
    SOL_ENABLED ? "- Solana: pay to " + SOL_PAY_TO : "- Solana: (not configured)",
    "- Base: pay to " + EVM_PAY_TO,
    "Pay with an x402 client and retry. No account needed.",
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
