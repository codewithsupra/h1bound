import { describe, expect, it } from "vitest";
import { hashIp, signGuest, verifyGuest } from "@/lib/server/guest-cookie";

const id = "3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f";

describe("guest cookie", () => {
  it("round-trips and rejects tampering", () => {
    const v = signGuest(id);
    expect(verifyGuest(v)).toBe(id);
    expect(verifyGuest(v.replace(id, "3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e50"))).toBeNull();
    expect(verifyGuest(`${id}.forged`)).toBeNull();
    expect(verifyGuest("not-a-cookie")).toBeNull();
    expect(verifyGuest(undefined)).toBeNull();
  });
  it("hashes IPs stably without exposing them", () => {
    expect(hashIp("1.2.3.4")).toBe(hashIp("1.2.3.4"));
    expect(hashIp("1.2.3.4")).not.toContain("1.2.3.4");
  });
});
