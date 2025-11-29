// services/search-unified/src/ai/index.ts
import { Router } from "express";
import { runGeminiAgent } from "./geminiAgent.js";
export const aiRouter = Router();
// Simple health check for AI wiring
aiRouter.get("/test", (_req, res) => {
    res.json({
        ok: true,
        data: {
            command_center_enrichment: {},
        },
    });
});
// Main enrichment endpoint used by the frontend / Command Center
aiRouter.post("/enrich-company", async (req, res) => {
    try {
        const body = (req.body || {});
        const result = await runGeminiAgent(body);
        res.json({
            ok: true,
            data: result,
        });
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error("POST /ai/enrich-company error", err);
        res.status(500).json({
            ok: false,
            error: err?.message || "Gemini agent failed",
        });
    }
});
