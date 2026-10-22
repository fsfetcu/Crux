// Never display arbitrary text or tokens from a sign-in callback URL.
export const oauthFailureMessage =
  "Google sign-in could not be completed. Try again with an approved account, or ask the owner to check your access.";

export function oauthCallbackFailed(href: string): boolean {
  try {
    const url = new URL(href);
    return [url.searchParams, new URLSearchParams(url.hash.slice(1))].some(
      (params) => params.has("error") || params.has("error_code"),
    );
  } catch {
    return false;
  }
}
