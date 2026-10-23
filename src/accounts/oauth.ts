// Never display arbitrary text or tokens from a sign-in callback URL.
export const oauthFailureMessage =
  "Google sign-in could not be completed. Check your connection and try again with your Google account.";

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
