import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, LogIn } from "lucide-react";
import { useAuth } from "./AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login(phone.replace(/\D/g, ""));
      navigate(user.role === "employee" ? "/employee" : "/admin", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-soft"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl surface-navy">
            <Shield className="h-6 w-6 text-gold" />
          </div>
          <h1 className="font-display text-lg font-semibold text-card-foreground">
            Command Dashboard
          </h1>
          <p className="text-xs text-muted-foreground">Enter your registered mobile number</p>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Mobile number</span>
          <input
            autoFocus
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground"
            placeholder="10-digit mobile number"
          />
        </label>

        {error && (
          <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <LogIn className="h-4 w-4" />
          {busy ? "Opening…" : "Login"}
        </button>
      </form>
    </div>
  );
}
