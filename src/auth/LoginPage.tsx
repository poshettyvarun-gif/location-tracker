import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BadgeCheck, Landmark, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
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
      setError(err instanceof Error ? err.message : "Login could not be completed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#c8f5fa] px-4 py-8 text-[#082c45] sm:px-6">
      <div aria-hidden className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,.72),_transparent_70%)]" />
      <div aria-hidden className="absolute -left-24 top-24 h-72 w-72 rounded-full border-[30px] border-white/20" />
      <div aria-hidden className="absolute -right-20 top-1/3 h-80 w-80 rounded-full border-[36px] border-[#76cbd8]/20" />

      <section className="relative z-10 w-full max-w-md">
        <div className="rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-[0_24px_60px_-28px_rgba(8,44,69,.5)] backdrop-blur sm:p-9">
          <div className="flex items-center justify-center gap-3" aria-label="Police command identity">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#d7b65a]/40 bg-[#f8f3dd] text-[#8a6812] shadow-sm"><Landmark className="h-7 w-7" /></div>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#062f4a] text-[#f4c84b] shadow-lg shadow-[#062f4a]/20"><ShieldCheck className="h-9 w-9" /></div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#238fb2]/30 bg-[#e6f8fb] text-[#087699] shadow-sm"><BadgeCheck className="h-7 w-7" /></div>
          </div>

          <header className="mt-7 text-center">
            <p className="text-xs font-bold tracking-[0.24em] text-[#a47b12]">GOVERNMENT OF TELANGANA</p>
            <div className="mx-auto mt-3 h-0.5 w-12 bg-[#d3ab31]" />
            <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-[#062f4a] sm:text-4xl">Hyderabad City Police</h1>
            <p className="mt-1 text-sm font-semibold tracking-[0.16em] text-slate-500">COMMAND CENTRE</p>
          </header>

          <div className="mx-auto mt-7 flex h-16 w-16 items-center justify-center rounded-full border border-[#d7e5ea] bg-[#eef8fa] text-[#087699] shadow-inner"><LockKeyhole className="h-7 w-7" /></div>
          <div className="mt-4 text-center">
            <h2 className="text-base font-bold tracking-[0.12em] text-[#062f4a]">OFFICER LOGIN</h2>
            <p className="mt-1 text-xs text-slate-500">Use your registered mobile number to continue.</p>
          </div>

          <form onSubmit={onSubmit} className="mt-6">
            <label className="block">
              <span className="sr-only">Mobile number</span>
              <div className="flex overflow-hidden rounded-2xl border-2 border-[#d5e1e7] bg-[#f9fcfd] transition focus-within:border-[#0d7595] focus-within:ring-4 focus-within:ring-[#0d7595]/10">
                <span className="flex items-center gap-1.5 border-r border-[#d5e1e7] bg-[#eaf3f6] px-4 text-sm font-bold text-[#062f4a]"><Smartphone className="h-4 w-4" />+91</span>
                <input autoFocus inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} className="min-w-0 flex-1 bg-transparent px-4 py-4 text-lg font-semibold tracking-[0.08em] text-[#062f4a] outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400" placeholder="10-digit mobile number" aria-label="Mobile number" />
              </div>
            </label>

            {error && <p className="mt-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-center text-xs font-medium text-destructive">{error}</p>}

            <button type="submit" disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#062f4a] px-4 py-4 text-base font-bold tracking-[0.08em] text-white shadow-lg shadow-[#062f4a]/20 transition hover:bg-[#0b4569] focus:outline-none focus:ring-4 focus:ring-[#0d7595]/25 disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? "OPENING ACCESS…" : "LOGIN"}<ArrowRight className="h-5 w-5" />
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">CP and DCP use monitoring access. Field workers use Camera and GPS check-in.</p>
        </div>
        <p className="mt-6 text-center text-sm font-bold tracking-[0.22em] text-[#083a54]">DUTY <span className="mx-1 text-[#c59a22]">•</span> HONOUR <span className="mx-1 text-[#c59a22]">•</span> COMPASSION</p>
      </section>

      <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-[#4caec1]/45 [clip-path:polygon(0_48%,8%_34%,14%_58%,21%_20%,27%_52%,35%_30%,43%_58%,51%_16%,59%_52%,68%_25%,76%_55%,86%_22%,100%_48%,100%_100%,0_100%)]" />
    </main>
  );
}
