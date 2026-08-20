// Local dev entrypoint. On Vercel the app is imported by api/index.js instead,
// which runs it as a serverless function rather than a long-lived server.
import app from "./app.js";
import { isSupabaseConfigured } from "./supabaseClient.js";

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(
    isSupabaseConfigured
      ? "Storage: Supabase (permanent)"
      : "Storage: in-memory — resets on restart. Set SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for permanent storage.",
  );
});
