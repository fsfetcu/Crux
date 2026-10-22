import { useAccount } from "./AccountContext";
import { GoogleSignIn } from "./GoogleSignIn";

export function SignInGate() {
  const account = useAccount();
  return (
    <main className="signin-page">
      <section className="signin-card" aria-labelledby="signin-title">
        <a className="signin-brand" href={import.meta.env.BASE_URL} aria-label="Crux home">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} width="44" height="44" alt="" />
          crux.
        </a>
        <p className="eyebrow">YOUR TRAINING, IN BALANCE</p>
        <h1 id="signin-title">Your training, just for you.</h1>
        {account.client ? <GoogleSignIn automatic /> : (
          <div className="form-stack">
            <p role="status">Sign-in is temporarily unavailable. Please try again shortly.</p>
            <button className="button" onClick={() => window.location.reload()}>Try again</button>
          </div>
        )}
        <nav className="footer-legal" aria-label="Privacy and terms">
          <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy</a>
          <a href={`${import.meta.env.BASE_URL}terms.html`}>Terms</a>
        </nav>
      </section>
    </main>
  );
}
