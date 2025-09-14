import { Router } from "express";
const r = Router();
r.get("/health", (_req, res) => res.status(200).json({ ok: true, ts: Date.now() }));
// Duplicate /healthz here too for route grouping
r.get("/healthz", (_req, res) => res.status(200).json({ status: 'OK' }));
export default r;
