import iyRouter from "./routes/iy";
import express from "express";
import iyRouter from './routes/iy';
import type { NextFunction, Request, Response } from "express";
import campaigns from "./routes/campaigns.js";
import getCompanyShipments from "./routes/getCompanyShipments.js";
import importYetiRoutes from "./routes/iy.js";
import publicRoutes from "./routes/public.js";
import searchCompanies from "./routes/searchCompanies.js";
import statusRoutes from "./routes/status.js";

const app = express();
app.use('/public/iy', iyRouter);
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const started = Date.now();
  res.locals.start_time = started;

  res.on("finish", () => {
    const duration = Date.now() - started;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    const logPayload: Record<string, unknown> = {
      level,
      route: req.originalUrl ?? req.url,
      method: req.method,
      duration_ms: duration,
      status_code: res.statusCode,
    };
    if (res.locals.error_code) {
      logPayload.error_code = res.locals.error_code;
    }
    console.log(JSON.stringify(logPayload));
  });

  next();
});

// CORS for Gateway/browser (permissive; tighten later)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "content-type, x-api-key, authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.use(statusRoutes);
app.use(publicRoutes);
app.use(searchCompanies);
app.use(getCompanyShipments);
app.use(importYetiRoutes);
app.use(campaigns);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const error = err as {
    status?: number;
    code?: string;
    error_code?: string;
    message?: string;
    expose?: boolean;
  };

  const status =
    typeof error?.status === "number" && error.status >= 400 && error.status < 600 ? error.status : 500;
  const errorCode =
    typeof error?.code === "string" && error.code.trim().length
      ? error.code
      : typeof error?.error_code === "string" && error.error_code.trim().length
        ? error.error_code
        : "internal_error";

  res.locals.error_code = errorCode;

  const exposeMessage = status < 500 || error?.expose === true;
  const message =
    typeof error?.message === "string" && error.message.trim().length && exposeMessage
      ? error.message
      : "Unexpected error";

  console.error(
    JSON.stringify({
      level: "error",
      message: error?.message ?? "Unhandled error",
      error_code: errorCode,
      status_code: status,
    }),
  );

  res.status(status).json({
    ok: false,
    error_code: errorCode,
    message,
  });
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, "0.0.0.0", () => console.log(`search-unified listening on :${port}`));

export default app;

