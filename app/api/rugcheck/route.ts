import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { server } from "@/lib/x402server";
import {
  SOL_NETWORK, EVM_NETWORK, SOL_PAY_TO, EVM_PAY_TO, PRICE, SOL_ENABLED,
} from "@/lib/x402config";
import { solRugCheck, isSolanaMint } from "@/lib/solrugcheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const token = (body?.token || body?.mint || body?.address || "").toString().trim();
  if (!token) return NextResponse.json({ error: "Missing 'token' (Solana mint address)." }, { status: 400 });
  if (!isSolanaMint(token)) return NextResponse.json({ error: "Invalid Solana mint address." }, { status: 400 });
  const mode = body?.mode ? body.mode.toString().trim() : undefined;
  try {
    return NextResponse.json(await solRugCheck(token, mode));
  } catch (e: any) {
    return NextResponse.json({ error: "Check failed: " + (e?.message || "unknown") }, { status: 502 });
  }
}

// Nhan tien: Solana (chinh) neu da cau hinh vi, va Base (du phong).
const accepts: any[] = [];
if (SOL_ENABLED) accepts.push({ scheme: "exact", price: PRICE, network: SOL_NETWORK, payTo: SOL_PAY_TO });
accepts.push({ scheme: "exact", price: PRICE, network: EVM_NETWORK, payTo: EVM_PAY_TO });

const paid = withX402(
  handler as any,
  {
    accepts,
    description: "Solana SPL token safety check: freeze/mint authority, transfer controls, holder concentration, liquidity (GO/CAUTION/DANGER) via GoPlus. Pay USDC on Solana or Base.",
    mimeType: "application/json",
    extensions: {
      ...declareDiscoveryExtension({
        bodyType: "json",
        input: { token: "<solana mint>" },
        inputSchema: { properties: { token: { type: "string", description: "Solana SPL mint address." } }, required: ["token"] },
        output: {
          example: { verdict: "CAUTION", chain: "solana", checks: [] },
          schema: { properties: { verdict: { type: "string", enum: ["GO", "CAUTION", "DANGER"] }, checks: { type: "array" } } },
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


// GET: de discovery crawler (x402scan) probe thay 402 payment challenge.
// Agent that su goi bang POST.
export async function GET(req: NextRequest, ctx: any) {
  return (paid as any)(req, ctx);
}