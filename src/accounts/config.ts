export function publicAccountConfig(url?: string, key?: string) {
  if (!url && !key) return { url: "", key: "", error: "" };
  const invalid = () => ({
    url: "",
    key: "",
    error:
      "Account setup needs a project URL and a public publishable or anon key.",
  });
  if (!url || !key) return invalid();
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" &&
      !(
        parsed.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(parsed.hostname)
      )
    )
      return invalid();
    if (key.startsWith("sb_publishable_")) return { url, key, error: "" };
    const payload = JSON.parse(
      atob(key.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")),
    );
    if (payload.role === "anon") return { url, key, error: "" };
  } catch {
    /* Invalid or secret credentials must never create a browser client. */
  }
  return invalid();
}
