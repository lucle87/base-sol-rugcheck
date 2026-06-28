// x402 V2 server: dang ky ca EVM va SVM scheme, dung facilitator CDP (lo ca Base lan Solana).
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";
import { facilitator as cdpFacilitator } from "@coinbase/x402";
import { EVM_IS_MAINNET, FACILITATOR_URL } from "@/lib/x402config";

const facilitatorClient = EVM_IS_MAINNET
  ? new HTTPFacilitatorClient(cdpFacilitator as any)
  : new HTTPFacilitatorClient({ url: FACILITATOR_URL });

export const server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(server);
registerExactSvmScheme(server);
(server as any).registerExtension?.(bazaarResourceServerExtension);
