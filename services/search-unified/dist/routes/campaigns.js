import { Router } from "express";
const router = Router();
router.get("/public/campaigns", (_req, res) => {
    res.json({ campaigns: [], total: 0 });
});
export default router;
