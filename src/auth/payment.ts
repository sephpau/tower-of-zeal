// Ronin RON payment flow for shop purchases. The player clicks Buy →
// we ask their wallet to send `priceWei` to TREASURY_WALLET → we get
// back a tx hash → we hand that hash to the server, which verifies the
// receipt on-chain before granting the item.
//
// The wallet popup is the only interactive step. Everything else happens
// transparently between the client and Ronin RPC.

import { requestRoninWalletConnector } from "@sky-mavis/tanto-connect";
import { TREASURY_WALLET } from "../core/shop";

const RONIN_CHAIN_ID = 2020;

export interface PaymentResult {
  ok: boolean;
  txHash?: `0x${string}`;
  reason?: string;
}

/** Open the connected Ronin Wallet and ask the user to send `priceWei` RON
 *  to the treasury. Returns the tx hash on success. The actual on-chain
 *  inclusion is awaited by the SERVER on the verify step — we don't block
 *  the UI here, we just confirm the wallet broadcast happened. */
export async function payForItem(priceWei: bigint): Promise<PaymentResult> {
  let connector;
  try {
    connector = await requestRoninWalletConnector();
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "no Ronin wallet detected" };
  }

  let address: string;
  try {
    const result = await connector.connect(RONIN_CHAIN_ID);
    if (!result.account) return { ok: false, reason: "no account returned by wallet" };
    address = result.account;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "wallet connect rejected" };
  }

  const provider = await connector.getProvider();

  // Build the tx. value is bigint → hex string for the JSON-RPC call.
  const valueHex = "0x" + priceWei.toString(16);
  let txHash: string;
  try {
    const result = await provider.request({
      method: "eth_sendTransaction",
      params: [{
        from: address,
        to: TREASURY_WALLET,
        value: valueHex,
        // No data; this is a plain RON transfer.
      }],
    });
    if (typeof result !== "string") return { ok: false, reason: "wallet returned no tx hash" };
    txHash = result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "wallet send failed";
    // Common case: user rejected the popup. Surface that cleanly so the UI
    // can show "Purchase cancelled" instead of a scary error.
    if (/reject|denied|cancel/i.test(msg)) {
      return { ok: false, reason: "purchase cancelled" };
    }
    return { ok: false, reason: msg };
  }

  // The server polls Ronin RPC for the receipt + confirmations, so we don't
  // need to await on-chain inclusion here.
  return { ok: true, txHash: txHash as `0x${string}` };
}
