import { Router } from "express";
const router = Router();
router.get("/public/status", (_req, res) => {
    res.json({
        ok: true,
        service: "search-unified",
        time: new Date().toISOString(),
    });
});
router.get("/healthz", (_req, res) => {
    res.json({
        ok: true,
        service: "search-unified",
        time: new Date().toISOString(),
    });
});
export default router;
