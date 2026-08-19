// Local dev entrypoint. On Vercel the app is imported by api/index.js instead,
// which runs it as a serverless function rather than a long-lived server.
import app from "./app.js";
import { isRedis } from "./store.js";

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(isRedis ? "Storage: Redis" : "Storage: in-memory (set KV_REST_API_URL/TOKEN to use Redis)");
});
