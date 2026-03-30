import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../lib/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      setLoading(true);
      setError("");
      await login({ email: email.trim(), password });
      navigate("/event-types", { replace: true });
    } catch (requestError) {
      setError(requestError.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="public-page">
      <div className="public-card login-card">
        <h1>Log in</h1>
        <p className="muted">Use your host credentials to continue.</p>
        <form className="form-grid" onSubmit={handleSubmit}>
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
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="auth-switch">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </div>
    </section>
  );
}
