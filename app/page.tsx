import { BASE_URL, PRICE_USD, SOL_ENABLED } from "@/lib/x402config";
export const dynamic = "force-dynamic";
export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
      <h1>sol-rugcheck</h1>
      <p style={{ color: "#9aa4af" }}>Pre-trade safety check for Solana SPL tokens. ${PRICE_USD} USDC per call via x402 on {SOL_ENABLED ? "Solana or Base" : "Base"}. No API key.</p>
      <p style={{ color: "#9aa4af" }}>
        Docs: <a href="/llms.txt" style={{ color: "#5db0ff" }}>/llms.txt</a> &middot; <a href="/openapi.json" style={{ color: "#5db0ff" }}>/openapi.json</a> &middot; <a href="/skill.md" style={{ color: "#5db0ff" }}>/skill.md</a>
      </p>
      <p style={{ marginTop: 24 }}><code>POST /api/rugcheck</code> body <code>{`{ "token": "<solana mint>" }`}</code></p>
      <p style={{ color: "#5a636d", marginTop: 24, fontSize: 12 }}>{BASE_URL}</p>
    </main>
  );
}
