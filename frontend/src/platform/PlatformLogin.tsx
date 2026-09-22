import { FormEvent, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Notice } from "../components/ui/Notice";
import { platformApi, type PlatformUser } from "../platform-api";

export function PlatformLogin({
  onLogin,
}: {
  onLogin: (user: PlatformUser) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      onLogin(await platformApi.login(email, password));
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not sign in",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="platform-login">
      <section>
        <div className="platform-mark">
          <i />
          <strong>REMIT</strong>
          <span>PLATFORM</span>
        </div>
        <ShieldCheck size={38} />
        <h1>Support operations</h1>
        <p>This workspace is restricted to authorized REMIT platform staff.</p>
        {error ? (
          <Notice title="Could not sign in" tone="danger">
            {error}
          </Notice>
        ) : null}
        <form onSubmit={submit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button disabled={submitting}>
            {submitting ? "Signing in…" : "Enter support console"}
          </button>
        </form>
        <a href="/">Return to REMIT</a>
      </section>
    </main>
  );
}
