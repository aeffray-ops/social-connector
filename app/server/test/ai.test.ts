import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";

describe("POST /api/ai", () => {
  it("rejects an empty instruction", async () => {
    const app = createApp({ run: () => {}, get: async () => ({}) } as any);
    const res = await request(app).post("/api/ai").send({ instruction: "   " });
    expect(res.status).toBe(400);
  });
});
