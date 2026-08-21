import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AcceptoEpayAdapter,
  epaySign,
  mapCheckoutStatus,
  parseCheckoutId,
} from "./accepto-epay.js";

const secret = "sk_live_test";
const pid = "1001";

function adapter() {
  return new AcceptoEpayAdapter(
    {
      pid,
      submitUrl: "https://api.accepto.io/submit.php",
      apiBaseUrl: "https://api.accepto.io",
    },
    { secret },
  );
}

describe("accepto epay sign", () => {
  it("uses lowercase md5 and appends key without &key=", () => {
    const params = {
      pid,
      type: "usdt",
      out_trade_no: "ORD1",
      notify_url: "https://a.test/n",
      return_url: "https://a.test/r",
      name: "VIP",
      money: "1.00",
    };
    assert.equal(epaySign(params, secret), "5427fab6ca3d36446777414993dc5234");
  });

  it("drops sign, sign_type, and empty values", () => {
    const withNoise = {
      pid,
      type: "usdt",
      out_trade_no: "ORD1",
      notify_url: "https://a.test/n",
      return_url: "https://a.test/r",
      name: "VIP",
      money: "1.00",
      param: "",
      sign: "deadbeef",
      sign_type: "MD5",
    };
    const clean = {
      pid,
      type: "usdt",
      out_trade_no: "ORD1",
      notify_url: "https://a.test/n",
      return_url: "https://a.test/r",
      name: "VIP",
      money: "1.00",
    };
    assert.equal(epaySign(withNoise, secret), epaySign(clean, secret));
  });
});

describe("parseCheckoutId / mapCheckoutStatus", () => {
  it("extracts uuid from hosted checkout url", () => {
    assert.equal(
      parseCheckoutId("https://accepto.io/checkout/b1a7d65f-42e1-4c0a-9f11-aaaaaaaaaaaa"),
      "b1a7d65f-42e1-4c0a-9f11-aaaaaaaaaaaa",
    );
    assert.equal(parseCheckoutId("https://api.accepto.io/submit.php?pid=1"), null);
  });

  it("only maps an explicit success whitelist to paid", () => {
    assert.equal(mapCheckoutStatus("PENDING_DEPOSIT"), "pending");
    assert.equal(mapCheckoutStatus("PROCESSING"), "pending");
    assert.equal(mapCheckoutStatus("unknown-xyz"), "pending");
    assert.equal(mapCheckoutStatus("FAILED"), "pending");
    assert.equal(mapCheckoutStatus("COMPLETED"), "paid");
    assert.equal(mapCheckoutStatus("paid"), "paid");
  });
});

describe("AcceptoEpayAdapter.verifyCallback", () => {
  it("accepts TRADE_SUCCESS with a valid signature", () => {
    const payload = {
      pid,
      trade_no: "acc_1",
      out_trade_no: "ORD1",
      type: "usdt",
      name: "VIP",
      money: "1.00",
      trade_status: "TRADE_SUCCESS",
      param: "",
    };
    const signed = {
      ...payload,
      sign: epaySign(payload, secret),
      sign_type: "MD5",
    };
    const result = adapter().verifyCallback(signed);
    assert.equal(result.merchantOrderNo, "ORD1");
    assert.equal(result.providerOrderNo, "acc_1");
    assert.equal(result.state, "paid");
    assert.equal(result.amountCents, 100);
    assert.equal(adapter().callbackAck, "success");
  });

  it("rejects a bad signature", () => {
    assert.throws(
      () =>
        adapter().verifyCallback({
          pid,
          trade_no: "acc_1",
          out_trade_no: "ORD1",
          money: "1.00",
          trade_status: "TRADE_SUCCESS",
          sign: "00000000000000000000000000000000",
        }),
      /callback_bad_signature/,
    );
  });
});
