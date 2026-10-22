import { describe, expect, it } from "vitest";
import { publicAccountConfig } from "../src/accounts/config";
const jwt = (role: string) =>
  `header.${btoa(JSON.stringify({ role }))}.signature`;
describe("public account configuration", () => {
  it("accepts only public publishable and legacy anon keys", () => {
    expect(
      publicAccountConfig("https://test.supabase.co", "sb_publishable_example")
        .error,
    ).toBe("");
    expect(
      publicAccountConfig("https://test.supabase.co", jwt("anon")).error,
    ).toBe("");
    expect(
      publicAccountConfig("https://test.supabase.co", "sb_secret_example").key,
    ).toBe("");
    expect(
      publicAccountConfig("https://test.supabase.co", jwt("service_role")).key,
    ).toBe("");
  });
  it("keeps a missing configuration in device mode and rejects broken or insecure URLs", () => {
    expect(publicAccountConfig().error).toBe("");
    expect(
      publicAccountConfig("not-a-url", "sb_publishable_example").error,
    ).toBeTruthy();
    expect(
      publicAccountConfig("http://example.com", "sb_publishable_example").error,
    ).toBeTruthy();
    expect(
      publicAccountConfig("http://127.0.0.1:54831", "sb_publishable_example")
        .error,
    ).toBe("");
  });
});
