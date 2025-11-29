// services/search-unified/src/ai/index.ts

import { Router, type Request, type Response } from "express";
import { runGeminiAgent, type LitGeminiInput } from "./geminiAgent.js";

export const aiRouter = Router();

// Simple health check for AI wiring
aiRouter.get("/test", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    data: {
      command_center_enrichment: {},
    },
  });
});

// Main enrichment endpoint used by the frontend / Command Center
aiRouter.post("/enrich-company", async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as LitGeminiInput;

    const result = await runGeminiAgent(body);

    res.json({
      ok: true,
      data: result,
    });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("POST /ai/enrich-company error", err);
    res.status(500).json({
      ok: false,
      error: err?.message || "Gemini agent failed",
    });
  }
});
