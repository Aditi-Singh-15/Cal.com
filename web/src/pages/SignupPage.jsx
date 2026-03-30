import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signup } from "../lib/api";

export default function SignupPage() {
  const navigate = useNavigate();
  const browserTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      setLoading(true);
      setError("");
      await signup({
        name: name.trim(),
        email: email.trim(),
        password,
        timezone: browserTimezone,
      });
      navigate("/event-types", { replace: true });
    } catch (requestError) {
      setError(requestError.message ?? "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="public-page">
      <div className="public-card login-card">
        <h1>Sign up</h1>
        <p className="muted">Create your host account to continue.</p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <div className="inline-error">{error}</div> : null}
          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </section>
  );
}
