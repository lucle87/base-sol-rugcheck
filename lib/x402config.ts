// Cau hinh x402 V2 cho sol-rugcheck: nhan tien Solana (chinh) + Base (du phong).

// Solana network CAIP-2. Mainnet mac dinh.
export const SOL_NETWORK =
  process.env.SOL_NETWORK || "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const SOL_IS_MAINNET = SOL_NETWORK.includes("5eykt4");

// EVM (Base) du phong.
const EVMRAW = (process.env.X402_NETWORK || "base").toLowerCase().trim();
export const EVM_NETWORK: "eip155:8453" | "eip155:84532" =
  EVMRAW === "base-sepolia" || EVMRAW === "eip155:84532" ? "eip155:84532" : "eip155:8453";
export const EVM_IS_MAINNET = EVM_NETWORK === "eip155:8453";

// Vi nhan tien.
export const SOL_PAY_TO = process.env.SOL_PAY_TO || ""; // dia chi vi Solana cua ban
export const EVM_PAY_TO = (process.env.PAY_TO ||
  "0xcd6b6d99b7751ff30b68fa1365488eb73fa7cefa") as `0x${string}`;

export const FACILITATOR_URL =
  process.env.FACILITATOR_URL || "https://x402.org/facilitator";

export const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "vanlucpdu@gmail.com";

// Gia. Next nuot dau $ trong .env, nen chuan hoa.
function normalizePrice(raw: string): string {
  let p = (raw || "0.01").trim().replace(/^\$/, "");
  if (p.startsWith(".")) p = "0" + p;
  if (p === "" || p === "0") p = "0.01";
  return "$" + p;
}
export const PRICE = normalizePrice(process.env.X402_PRICE || "0.01");
export const PRICE_USD = PRICE.replace("$", "");

// Co nhan duoc tien Solana khong (can co SOL_PAY_TO).
export const SOL_ENABLED = SOL_PAY_TO.length > 0;
