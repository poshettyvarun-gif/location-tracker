import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, Smartphone } from "lucide-react";
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
    <main className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-[#baf2f7] px-3 py-6 font-sans text-[#003852] sm:px-6 sm:py-10">
      <div aria-hidden className="absolute inset-x-0 top-0 h-11 bg-black" />
      <div aria-hidden className="absolute inset-0 top-11 bg-[radial-gradient(ellipse_at_50%_8%,rgba(255,255,255,.45),transparent_38%),linear-gradient(180deg,#bdf4f8_0%,#c8f7f8_55%,#98d3dd_100%)]" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[30vh] bg-[#5faabb]/45 [clip-path:polygon(0_28%,7%_19%,11%_39%,17%_10%,23%_37%,29%_20%,35%_43%,41%_8%,47%_35%,53%_16%,59%_42%,66%_22%,72%_46%,79%_13%,86%_40%,94%_18%,100%_32%,100%_100%,0_100%)]" />
      <div aria-hidden className="absolute bottom-[12vh] left-[9%] h-24 w-7 bg-[#4d96a8]/35 [clip-path:polygon(38%_0,61%_0,61%_14%,100%_14%,100%_100%,0_100%,0_35%,38%_35%)]" />
      <div aria-hidden className="absolute bottom-[12vh] right-[11%] h-32 w-9 bg-[#4d96a8]/35 [clip-path:polygon(37%_0,63%_0,63%_19%,100%_19%,100%_100%,0_100%,0_42%,37%_42%)]" />

      <section className="relative z-10 w-full max-w-[650px] pt-4 sm:pt-7">
        <div className="rounded-[1.5rem] border border-white/90 bg-white/95 px-4 pb-7 pt-8 shadow-[0_22px_48px_-18px_rgba(0,55,78,.38)] sm:rounded-[2rem] sm:px-9 sm:pb-12 sm:pt-14">
          <div className="flex items-center justify-center gap-3 min-[380px]:gap-4 sm:gap-8" aria-label="Official Telangana police identity">
            <img src="/official-logos/telangana-government-emblem-transparent.png" alt="Government of Telangana emblem" className="h-[58px] w-[58px] object-contain sm:h-[88px] sm:w-[88px]" />
            <img src="/official-logos/telangana-state-police.jpeg" alt="Telangana State Police" className="h-[66px] w-[66px] object-contain sm:h-[102px] sm:w-[102px]" />
            <img src="/official-logos/telangana-rising-2047.png" alt="Telangana Rising 2047" className="h-[58px] w-[50px] object-contain sm:h-[88px] sm:w-[74px]" />
          </div>

          <header className="mt-7 text-center sm:mt-9">
            <p className="text-[9px] font-extrabold tracking-[0.18em] text-[#a77a13] min-[380px]:text-[10px] sm:text-xs sm:tracking-[0.25em]">GOVERNMENT OF TELANGANA</p>
            <div className="mx-auto mt-3 h-[3px] w-12 bg-[#c9a52d]" />
            <h1 className="mt-5 text-[clamp(1.55rem,7.2vw,2.375rem)] font-black leading-none tracking-[0.01em] text-[#003852]">HYDERABAD CITY POLICE</h1>
            <p className="mt-2 text-[clamp(.86rem,4vw,1.3125rem)] font-bold tracking-[0.1em] text-[#4e5864] sm:tracking-[0.13em]">COMMISSIONERATE</p>
          </header>

          <div className="mx-auto mt-8 flex h-[86px] w-[86px] items-center justify-center rounded-full border border-[#d4dce3] bg-[#f1f5f8] shadow-inner sm:mt-10 sm:h-[104px] sm:w-[104px]">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#d4dee5] bg-white text-[#197f74] shadow-sm"><LockKeyhole className="h-8 w-8" /></div>
          </div>

          <div className="mt-6 text-center sm:mt-7">
            <h2 className="text-lg font-extrabold tracking-[0.12em] text-[#003852] sm:text-xl">OFFICER LOGIN</h2>
            <p className="mt-2 text-xs text-slate-500 sm:text-sm">Enter your registered mobile number to continue.</p>
          </div>

          <form onSubmit={onSubmit} className="mt-6">
            <label className="block">
              <span className="sr-only">Mobile number</span>
              <div className="flex overflow-hidden rounded-xl border-2 border-[#d1dbe2] bg-[#fafcfd] transition focus-within:border-[#00617f] focus-within:ring-4 focus-within:ring-[#00617f]/10">
                <span className="flex min-h-[64px] items-center gap-1 border-r border-[#d1dbe2] bg-[#eaf0f4] px-3 text-base font-extrabold text-[#003852] sm:min-h-[78px] sm:gap-1.5 sm:px-6 sm:text-xl"><Smartphone className="h-4 w-4 sm:h-5 sm:w-5" />+91</span>
                <input autoFocus inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} className="min-w-0 flex-1 bg-transparent px-3 text-lg font-semibold tracking-[0.08em] text-[#003852] outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 sm:px-6 sm:text-2xl" placeholder="Mobile number" aria-label="Mobile number" />
              </div>
            </label>

            {error && <p className="mt-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-center text-xs font-medium text-destructive">{error}</p>}

            <button type="submit" disabled={busy} className="mt-6 flex min-h-[64px] w-full items-center justify-center gap-2 rounded-xl bg-[#003852] px-4 text-lg font-extrabold tracking-[0.08em] text-white shadow-lg shadow-[#003852]/20 transition hover:bg-[#00506f] focus:outline-none focus:ring-4 focus:ring-[#00617f]/25 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-7 sm:min-h-[78px] sm:text-xl">
              {busy ? "OPENING ACCESS…" : "LOGIN"}<ArrowRight className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs font-extrabold tracking-[0.13em] text-[#003852] sm:mt-8 sm:text-xl sm:tracking-[0.18em]">DUTY <span className="mx-1 text-[#b38d1a]">•</span> HONOUR <span className="mx-1 text-[#b38d1a]">•</span> COMPASSION</p>
      </section>
    </main>
  );
}
