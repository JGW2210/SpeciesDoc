import { useState } from "react";
import { useAuth } from "../lib/auth";

// Top-of-page auth bar. Signed out: a "Sign in" button that expands an inline
// email + password form (toggleable to "Create account"). Signed in: the
// account label and a sign-out button. Viewing the app never requires signing
// in — this only gates adding and editing.
export default function AuthPanel() {
  const { user, loading, signIn, signUp, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const label = user?.email ?? "";

  const reset = () => {
    setPassword("");
    setError(null);
    setNotice(null);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Something went wrong.");
      return;
    }
    if (res.needsConfirmation) {
      setNotice("Check your inbox to confirm your email, then sign in.");
      setMode("signin");
      setPassword("");
      return;
    }
    // Signed in — the auth state change closes the form.
    close();
    setEmail("");
  }

  if (loading) {
    return (
      <div className="authbar">
        <span className="authbar__muted">…</span>
      </div>
    );
  }

  if (user) {
    return (
      <div className="authbar">
        <span className="authbar__who">
          Signed in as <strong>{label}</strong>
        </span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="authbar">
      <span className="authbar__muted">Viewing as guest — sign in to add or edit your own organisms.</span>
      {open ? (
        <form className="authform" onSubmit={handleSubmit}>
          <div className="authform__tabs" role="tablist" aria-label="Auth mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              className={`authform__tab${mode === "signin" ? " is-on" : ""}`}
              onClick={() => {
                setMode("signin");
                reset();
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={`authform__tab${mode === "signup" ? " is-on" : ""}`}
              onClick={() => {
                setMode("signup");
                reset();
              }}
            >
              Create account
            </button>
          </div>
          <input
            className="field__input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@lab.org"
            autoComplete="email"
            required
          />
          <input
            className="field__input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={6}
            required
          />
          {error && (
            <p className="form__error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="authform__notice" role="status">
              {notice}
            </p>
          )}
          <div className="authform__actions">
            <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={close} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setOpen(true)}>
          Sign in
        </button>
      )}
    </div>
  );
}
