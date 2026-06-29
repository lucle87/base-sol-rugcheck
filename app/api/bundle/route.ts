import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { server } from "@/lib/x402server";
import {
  SOL_NETWORK, EVM_NETWORK, SOL_PAY_TO, EVM_PAY_TO, PRICE, SOL_ENABLED,
} from "@/lib/x402config";
import { isSolanaMint } from "@/lib/solrugcheck";
import { bundleCheck } from "@/lib/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const token = (body?.token || body?.mint || body?.address || "").toString().trim();
  if (!token) return NextResponse.json({ error: "Missing 'token' (Solana mint address)." }, { status: 400 });
  if (!isSolanaMint(token)) return NextResponse.json({ error: "Invalid Solana mint address." }, { status: 400 });
  try {
    return NextResponse.json(await bundleCheck(token));
  } catch (e: any) {
    return NextResponse.json({ error: "Bundle check failed: " + (e?.message || "unknown") }, { status: 502 });
  }
}

const accepts: any[] = [];
if (SOL_ENABLED) accepts.push({ scheme: "exact", price: PRICE, network: SOL_NETWORK, payTo: SOL_PAY_TO });
accepts.push({ scheme: "exact", price: PRICE, network: EVM_NETWORK, payTo: EVM_PAY_TO });

const paid = withX402(
  handler as any,
  {
    accepts,
    description: "Solana bundle / sniper detection: groups recent buyers by slot to flag coordinated launch buys. Most accurate for freshly launched tokens. Pay USDC on Solana or Base.",
    mimeType: "application/json",
    extensions: {
      ...declareDiscoveryExtension({
        bodyType: "json",
        input: { token: "<solana mint>" },
        inputSchema: { properties: { token: { type: "string", description: "Solana SPL mint address." } }, required: ["token"] },
        output: {
          example: { bundleVerdict: "SUSPICIOUS", distinctBuyers: 12, largestSlotCluster: { slot: 0, buyers: 4, tokensBought: 0 } },
          schema: { properties: { bundleVerdict: { type: "string", enum: ["CLEAN", "SUSPICIOUS", "LIKELY_BUNDLE", "UNKNOWN"] }, clusters: { type: "array" } } },
        },
      }),
    },
  } as any,
  server
);

export async function POST(req: NextRequest, ctx: any) {
  const preview = req.nextUrl.searchParams.get("preview");
  if (preview && process.env.PREVIEW_KEY && preview === process.env.PREVIEW_KEY) {
    return handler(req);
  }
  return (paid as any)(req, ctx);
}
