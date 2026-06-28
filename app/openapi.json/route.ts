import { BASE_URL, SOL_NETWORK, EVM_NETWORK, SOL_PAY_TO, EVM_PAY_TO, PRICE_USD, SOL_ENABLED, CONTACT_EMAIL } from "@/lib/x402config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const proofs = [EVM_PAY_TO];
  if (SOL_ENABLED) proofs.push(SOL_PAY_TO as any);

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "sol-rugcheck - Solana token safety for AI agents",
      version: "1.0.0",
      description:
        "Pre-trade safety check for Solana SPL tokens: freeze/mint authority, transfer hooks/fees, holder concentration and liquidity, returned as a GO/CAUTION/DANGER verdict (GoPlus data). Pay-per-call in USDC via x402 on Solana or Base. No API key, no signup.",
      contact: { name: "sol-rugcheck", email: CONTACT_EMAIL, url: BASE_URL },
    },
    servers: [{ url: BASE_URL }],
    "x-docs": { llmsTxt: BASE_URL + "/llms.txt", skill: BASE_URL + "/skill.md" },
    x402Version: 2,
    "x-discovery": { ownershipProofs: proofs },
    paths: {
      "/api/rugcheck": {
        post: {
          operationId: "solRugcheck",
          summary: "Solana SPL token safety check",
          description:
            "Body: { token } where token is a Solana SPL mint address. Returns verdict GO/CAUTION/DANGER with checks for freeze authority, mint authority, transfer controls, holder concentration and liquidity. A GO means no red flags in the checks performed, NOT that the token is safe.",
          "x-payment-info": {
            x402Version: 2,
            price: { mode: "fixed", amount: PRICE_USD, currency: "USD" },
            protocols: ["x402"],
            networks: SOL_ENABLED ? [SOL_NETWORK, EVM_NETWORK] : [EVM_NETWORK],
            asset: "USDC",
            payTo: { solana: SOL_ENABLED ? SOL_PAY_TO : null, base: EVM_PAY_TO },
          },
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", properties: { token: { type: "string", description: "Solana SPL mint address." } }, required: ["token"] } } },
          },
          responses: {
            "200": { description: "Verdict and checks." },
            "400": { description: "Missing/invalid mint." },
            "402": { description: "Payment Required (x402, USDC on Solana or Base)." },
          },
        },
      },
    },
  };
  return new Response(JSON.stringify(spec, null, 2), { headers: { "content-type": "application/json" } });
}
