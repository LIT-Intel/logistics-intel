import { Router } from "express";
import { runGeminiAgent } from "../ai/geminiAgent.js";

const router = Router();

router.post("/enrich-company", async (req, res) => {
  try {
    const result = await runGeminiAgent(req.body || {});
    res.json({ ok: true, data: result });
  } catch (err: any) {
    console.error("ai/enrich-company error", err);
    res.status(500).json({ ok: false, error: err?.message || "Gemini failed" });
  }
});

router.get("/test", async (_req, res) => {
  res.json({ ok: true, data: { command_center_enrichment: {} } });
});

export default router;
