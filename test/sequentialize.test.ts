import { describe, it, expect } from "vitest";
import { sequentialize } from "../src/bot/middleware/sequentialize.js";
import type { BotContext } from "../src/types/context.js";

describe("sequentialize", () => {
  it("processes updates with different keys concurrently", async () => {
    let callCount = 0;
    const middleware = sequentialize(async () => {
      callCount++;
      return callCount === 1 ? "key-a" : "key-b";
    });

    const order: string[] = [];

    const ctxA = {} as BotContext;
    const ctxB = {} as BotContext;

    const promiseA = middleware(ctxA, async () => {
      order.push("a-start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("a-end");
    });

    const promiseB = middleware(ctxB, async () => {
      order.push("b-start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("b-end");
    });

    await Promise.all([promiseA, promiseB]);

    // With different keys both should start before either ends
    const aStartIndex = order.indexOf("a-start");
    const aEndIndex = order.indexOf("a-end");
    const bStartIndex = order.indexOf("b-start");
    const bEndIndex = order.indexOf("b-end");

    expect(aStartIndex).toBeLessThan(aEndIndex);
    expect(bStartIndex).toBeLessThan(bEndIndex);
    // Concurrent: b starts before a ends
    expect(bStartIndex).toBeLessThan(aEndIndex);
    expect(aStartIndex).toBeLessThan(bEndIndex);
  });

  it("processes updates with the same key sequentially", async () => {
    const middleware = sequentialize(async () => "same-key");

    const order: string[] = [];

    const ctxA = {} as BotContext;
    const ctxB = {} as BotContext;

    const promiseA = middleware(ctxA, async () => {
      order.push("a-start");
      await Promise.resolve();
      order.push("a-end");
    });

    const promiseB = middleware(ctxB, async () => {
      order.push("b-start");
      await Promise.resolve();
      order.push("b-end");
    });

    await Promise.all([promiseA, promiseB]);

    // Same key should be sequential, so a must finish before b starts
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });

  it("passes through when getSessionKey returns undefined", async () => {
    const middleware = sequentialize(async () => undefined);

    const ctx = {} as BotContext;
    let nextCalled = false;

    await middleware(ctx, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it("continues queue after a previous update throws", async () => {
    const middleware = sequentialize(async () => "same-key");
    const order: string[] = [];
    const sentinel = new Error("intentional failure");

    const ctxA = {} as BotContext;
    const ctxB = {} as BotContext;

    // Start both without awaiting the first
    const promiseA = middleware(ctxA, async () => {
      order.push("a-start");
      throw sentinel;
    });

    const promiseB = middleware(ctxB, async () => {
      order.push("b-start");
      await Promise.resolve();
      order.push("b-end");
    });

    // A should reject; B should resolve
    await expect(promiseA).rejects.toBe(sentinel);
    await expect(promiseB).resolves.toBeUndefined();

    // B should have run despite A throwing
    expect(order).toContain("b-start");
    expect(order).toEqual(["a-start", "b-start", "b-end"]);
  });

  it("does not permanently poison the queue after a rejection", async () => {
    const middleware = sequentialize(async () => "same-key");
    const order: string[] = [];
    const sentinel = new Error("first failure");

    const ctx1 = {} as BotContext;
    const ctx2 = {} as BotContext;
    const ctx3 = {} as BotContext;

    // First update throws
    const promise1 = middleware(ctx1, async () => {
      order.push("1-start");
      throw sentinel;
    });

    // Second update starts while first is pending
    const promise2 = middleware(ctx2, async () => {
      order.push("2-start");
      await Promise.resolve();
      order.push("2-end");
    });

    await expect(promise1).rejects.toBe(sentinel);
    await promise2;

    // After both settled, a third update should still run normally
    await middleware(ctx3, async () => {
      order.push("3-start");
      await Promise.resolve();
      order.push("3-end");
    });

    expect(order).toEqual(["1-start", "2-start", "2-end", "3-start", "3-end"]);
  });
});
