import { useEffect, useState } from "react";
import { Check, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "../auth/AuthContext";

type Registration = {
  id: string;
  name: string;
  email: string;
  code: string | null;
  requestedRole: "constable" | "si" | "ci" | "inspector";
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  reviewedAt: number | null;
};

const ROLE_LABEL: Record<Registration["requestedRole"], string> = {
  constable: "Constable",
  si: "Sub-Inspector",
  ci: "Circle Inspector",
  inspector: "Police Inspector",
};

export default function AdminRegistrations() {
  const [requests, setRequests] = useState<Registration[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiFetch("/api/admin/registration-requests");
        if (!cancelled) setRequests(data);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Could not load registration requests");
      }
    };
    load();
    const interval = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  async function review(request: Registration, decision: "approved" | "rejected") {
    const action = decision === "approved" ? "approve" : "reject";
    if (!confirm(`${action[0].toUpperCase()}${action.slice(1)} ${request.name}'s ${ROLE_LABEL[request.requestedRole]} registration?`)) return;
    setReviewingId(request.id);
    try {
      await apiFetch(`/api/admin/registration-requests/${request.id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      setRequests((items) => items.map((item) => (item.id === request.id ? { ...item, status: decision, reviewedAt: Date.now() } : item)));
      toast.success(`${request.name}'s registration was ${decision}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not review registration");
    } finally {
      setReviewingId(null);
    }
  }

  const pending = requests.filter((request) => request.status === "pending");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      <header className="mb-6">
        <h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">Registration approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ACP reviews email-verified Constable, SI, CI, and Inspector registrations. Approval creates their dashboard account.
        </p>
      </header>

      {pending.length > 0 && (
        <p className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-foreground">
          {pending.length} registration{pending.length === 1 ? "" : "s"} awaiting your decision.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Applicant</th>
              <th className="px-4 py-3 font-medium">Requested role</th>
              <th className="px-4 py-3 font-medium">Registered</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3.5">
                  <p className="font-medium text-card-foreground">{request.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{request.email}</p>
                  {request.code && <p className="mt-0.5 text-xs text-muted-foreground">ID: {request.code}</p>}
                </td>
                <td className="px-4 py-3.5 text-muted-foreground">{ROLE_LABEL[request.requestedRole]}</td>
                <td className="px-4 py-3.5 text-muted-foreground">{new Date(request.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3.5"><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize text-foreground">{request.status}</span></td>
                <td className="px-4 py-3.5">
                  {request.status === "pending" && (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => review(request, "rejected")} disabled={reviewingId === request.id} className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-50"><X className="h-3.5 w-3.5" />Reject</button>
                      <button onClick={() => review(request, "approved")} disabled={reviewingId === request.id} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Check className="h-3.5 w-3.5" />Approve</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">No registration requests yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
