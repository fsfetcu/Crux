// Remember an attempted redirect across Google -> Back/cancel -> Crux.
// Session storage is tab-local; a new visit in a new tab starts normally.
export const GOOGLE_REDIRECT_KEY = "crux-google-redirect-attempt";

export function claimAutomaticGoogleRedirect(): boolean {
  try {
    if (sessionStorage.getItem(GOOGLE_REDIRECT_KEY)) return false;
    sessionStorage.setItem(GOOGLE_REDIRECT_KEY, "1");
    return true;
  } catch {
    // A manual sign-in still works when the browser blocks session storage.
    return false;
  }
}

export function pauseAutomaticGoogleRedirect() {
  try { sessionStorage.setItem(GOOGLE_REDIRECT_KEY, "1"); } catch { /* Optional guard. */ }
}

export function clearGoogleRedirectAttempt() {
  try { sessionStorage.removeItem(GOOGLE_REDIRECT_KEY); } catch { /* Optional guard. */ }
}
