# sol-rugcheck - Solana token safety for AI agents

Pre-trade safety check for Solana SPL tokens. Nhan tien USDC qua x402 tren
Solana (chinh) va Base (du phong). Data tu GoPlus Solana (free, khong key).

## Endpoint
POST /api/rugcheck   body { "token": "<solana mint>" }   $0.01

## Checks
freeze authority, mint authority, transfer hook/fee (Token-2022),
holder concentration, DEX liquidity => GO / CAUTION / DANGER.

## Chay
1. npm install
2. copy .env.example .env
   - Tao vi Solana (Phantom), dan dia chi vao SOL_PAY_TO.
   - Dien CDP_API_KEY_ID / CDP_API_KEY_SECRET (cho Base).
   - Them PREVIEW_KEY=test123 de test.
3. npm run dev

## Test preview (chay that, bo qua tra tien)
$body = '{"token":"<solana mint>"}'
$r = Invoke-RestMethod -Uri "http://localhost:3000/api/rugcheck?preview=test123" -Method Post -ContentType "application/json" -Body $body
$r | ConvertTo-Json -Depth 6

## Discovery
/openapi.json  /llms.txt  /skill.md
