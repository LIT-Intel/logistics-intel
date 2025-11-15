import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

router.get("/public/status", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "search-unified",
    time: new Date().toISOString(),
  });
});

router.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "search-unified",
    time: new Date().toISOString(),
  });
});

export default router;

