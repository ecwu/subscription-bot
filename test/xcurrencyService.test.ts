import { describe, expect, it, vi } from "vitest";
import { fetchXCurrencyExchangeRates } from "../src/services/xcurrencyService.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("fetchXCurrencyExchangeRates", () => {
  it("fetches USD-quoted rates and converts them to the report config shape", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        success: true,
        timestamp: 1591784799,
        rates: {
          EUR: 1.25,
          JPY: 0.01,
          USD: 1,
        },
      }),
    );

    const result = await fetchXCurrencyExchangeRates("secret-key", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = new URL(fetcher.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe(
      "https://api.xcurrency.com/rate/mid/latest",
    );
    expect(url.searchParams.get("apiKey")).toBe("secret-key");
    expect(url.searchParams.get("quote")).toBe("USD");
    expect(url.searchParams.get("category")).toBe("currency");

    expect(result).toEqual({
      exchangeRates: {
        base: "USD",
        rates: {
          USD: 1,
          EUR: 0.8,
          JPY: 100,
        },
      },
      timestamp: 1591784799,
      currencyCount: 3,
    });
  });

  it("rejects unsuccessful API responses", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        success: false,
        timestamp: 1591784799,
        rates: {},
      }),
    );

    await expect(
      fetchXCurrencyExchangeRates("secret-key", fetcher),
    ).rejects.toThrow("successful rates data");
  });

  it("rejects invalid numeric rates", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        success: true,
        timestamp: 1591784799,
        rates: { EUR: -1 },
      }),
    );

    await expect(
      fetchXCurrencyExchangeRates("secret-key", fetcher),
    ).rejects.toThrow("invalid rate");
  });
});
