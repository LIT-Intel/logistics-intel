// services/search-unified/src/routes/gemini.ts

import type { Request, Response } from "express";
import { runGeminiAgent, type LitGeminiInput } from "../ai/geminiAgent";

export async function geminiRoute(req: Request, res: Response) {
  try {
    const body = (req.body || {}) as LitGeminiInput;

    const result = await runGeminiAgent(body);

    res.json({
      ok: true,
      data: result,
    });
  } catch (err: any) {
    console.error("geminiRoute error", err);
    res.status(500).json({
      ok: false,
      error: err?.message || "Gemini agent failed",
    });
  }
}

export default geminiRoute;
