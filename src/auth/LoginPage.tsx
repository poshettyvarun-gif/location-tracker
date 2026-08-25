import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, LogIn, Mail, Shield, UserPlus } from "lucide-react";
import { apiFetch, useAuth } from "./AuthContext";

type Mode = "password" | "email" | "register";
const REGISTRATION_ROLES = [
  { value: "constable", label: "Constable" }, { value: "si", label: "Sub-Inspector (SI)" },
  { value: "ci", label: "Circle Inspector (CI)" }, { value: "inspector", label: "Police Inspector" },
];

export default function LoginPage() {
  const { login, loginWithEmailLink } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [requestedRole, setRequestedRole] = useState("constable");
  const [linkSent, setLinkSent] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailLink = params.get("email_link");
    const accessToken = new URLSearchParams(window.location.hash.slice(1)).get("access_token");
    if (!emailLink || !accessToken) return;
    const finishLink = async () => {
      setBusy(true); setError(null);
      try {
        if (emailLink === "registration") {
          const name = params.get("registration_name");
          const requestedRole = params.get("registration_role");
          if (!name || !requestedRole) throw new Error("Registration details are missing. Please register again.");
          await apiFetch("/api/auth/registration/verify-link", { method: "POST", body: JSON.stringify({ name, code: params.get("registration_code"), requestedRole, accessToken }) });
          setMode("register"); setRegistered(true);
        } else {
          const user = await loginWithEmailLink(accessToken);
          navigate(user.role === "employee" ? "/employee" : "/admin", { replace: true });
        }
      } catch (err) { setError(err instanceof Error ? err.message : "Could not verify email link"); }
      finally { window.history.replaceState({}, document.title, "/login"); setBusy(false); }
    };
    void finishLink();
  }, [loginWithEmailLink, navigate]);

  function switchMode(next: Mode) { setMode(next); setLinkSent(false); setRegistered(false); setError(null); }
  async function passwordSubmit(event: FormEvent) {
    event.preventDefault(); setError(null); setBusy(true);
    try { const user = await login(username.trim(), password); navigate(user.role === "employee" ? "/employee" : "/admin", { replace: true }); }
    catch (err) { setError(err instanceof Error ? err.message : "Login failed"); }
    finally { setBusy(false); }
  }
  async function sendLink(forRegistration: boolean) {
    setError(null); setBusy(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await apiFetch(forRegistration ? "/api/auth/registration/send-link" : "/api/auth/email/send-link", { method: "POST", body: JSON.stringify(forRegistration ? { email: normalizedEmail, name: name.trim(), code: code.trim() || null, requestedRole } : { email: normalizedEmail }) });
      setLinkSent(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not send email link"); }
    finally { setBusy(false); }
  }
  async function emailSubmit(event: FormEvent) { event.preventDefault(); await sendLink(mode === "register"); }
  const submit = mode === "password" ? passwordSubmit : emailSubmit;

  return <div className="flex min-h-screen items-center justify-center bg-background px-4"><form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-soft">
    <div className="mb-6 flex flex-col items-center text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl surface-navy"><Shield className="h-6 w-6 text-gold" /></div><h1 className="font-display text-lg font-semibold text-card-foreground">Command Dashboard</h1><p className="text-xs text-muted-foreground">Secure police operations access</p></div>
    <div className="mb-5 grid grid-cols-3 rounded-xl bg-muted p-1 text-xs font-medium"><button type="button" onClick={() => switchMode("password")} className={`rounded-lg px-2 py-2 ${mode === "password" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Password</button><button type="button" onClick={() => switchMode("email")} className={`rounded-lg px-2 py-2 ${mode === "email" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Email link</button><button type="button" onClick={() => switchMode("register")} className={`rounded-lg px-2 py-2 ${mode === "register" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Register</button></div>
    {mode === "password" ? <><label className="mb-3 block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Username</span><input autoFocus value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground" placeholder="Username" /></label><label className="mb-5 block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground" placeholder="••••••••" /></label></> : registered ? <div className="rounded-xl border border-[#3f8f5f]/30 bg-[#3f8f5f]/10 px-4 py-4 text-center text-sm text-[#265c3b]"><BadgeCheck className="mx-auto mb-2 h-6 w-6" />Email verified. Your application is pending ACP approval.</div> : <>{mode === "register" && <><label className="mb-3 block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Register as</span><select value={requestedRole} onChange={(event) => setRequestedRole(event.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground">{REGISTRATION_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label><label className="mb-3 block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Full name</span><input required value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground" placeholder="Full name" /></label><label className="mb-3 block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Police / employee ID</span><input value={code} onChange={(event) => setCode(event.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground" placeholder="Optional" /></label></>}<label className="mb-3 block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Official email address</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground" placeholder="name@department.gov" /></label>{linkSent ? <div className="mb-5 rounded-xl border border-[#3f8f5f]/30 bg-[#3f8f5f]/10 px-3 py-3 text-xs text-[#265c3b]">Email sent. Open it and click <strong>Sign in</strong>; this page will finish verification automatically.</div> : <p className="mb-5 text-xs text-muted-foreground">We will send a free verification link to this email. Registration remains pending ACP approval after verification.</p>}</>}
    {error && <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
    {!registered && <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{mode === "register" ? <UserPlus className="h-4 w-4" /> : mode === "email" ? <Mail className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}{busy ? "Please wait…" : mode === "password" ? "Sign in" : "Send sign-in link"}</button>}
  </form></div>;
}
