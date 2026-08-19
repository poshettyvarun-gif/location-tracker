// Vercel serverless entrypoint. An Express app is itself a (req, res) handler,
// so it can be exported directly; vercel.json routes every /api/* path here.
import app from "../server/app.js";

export default app;
