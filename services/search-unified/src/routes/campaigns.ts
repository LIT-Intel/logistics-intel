import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

router.get("/public/campaigns", (_req: Request, res: Response) => {
  res.json({ campaigns: [], total: 0 });
});

export default router;

