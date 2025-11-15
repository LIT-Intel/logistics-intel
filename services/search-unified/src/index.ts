import express from "express";
import type { NextFunction, Request, Response, Express } from "express";
import campaigns from "./routes/campaigns.js";
import getCompanyShipments from "./routes/getCompanyShipments.js";
import { iyRouter } from "./routes/iy.js";
import publicRoutes from "./routes/public.js";
import searchCompanies from "./routes/searchCompanies.js";
import rfpRoutes from "./routes/rfp.js";
import statusRoutes from "./routes/status.js";

function logRoutes(app: Express) {
  const stack = (app as any)?._router?.stack;
  if (!Array.isArray(stack)) {
    console.log("[routes] no router stack found");
    return;
  }

  const formatPath = (base: string, path: string | string[] | undefined): string => {
    const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
    if (Array.isArray(path)) {
      return path.map((segment) => `${normalizedBase}${segment}`.replace(/\/+$/, "")).join(",");
    }
    if (typeof path === "string") {
      const combined = `${normalizedBase}${path.startsWith("/") ? "" : "/"}${path}`;
      return combined.replace(/\/+$/, "") || "/";
    }
    return normalizedBase || "/";
  };

  const regexToPath = (regex: { source: string } | undefined): string => {
    if (!regex?.source) return "";
    return regex.source
      .replace(/\\\//g, "/")
      .replace(/\^\/?/, "/")
      .replace(/\/?\(\?=\\\/=\|\$\)/, "")
      .replace(/\$|\^/g, "")
      .replace(/\(\?:\(\?=\/\|\$\)\|\$\)/g, "")
      .replace(/\/+$/, "");
  };

  const printLayer = (basePath: string, layer: any): void => {
    if (layer.route?.path) {
      const methods = Object.keys(layer.route.methods || {})
        .filter((method) => layer.route.methods[method])
        .map((method) => method.toUpperCase())
        .join(",");
      const fullPath = formatPath(basePath, layer.route.path);
      console.log("[routes]", methods || "USE", fullPath);
    } else if (layer.name === "router" && Array.isArray(layer.handle?.stack)) {
      const nextBase = `${basePath}${regexToPath(layer.regexp)}`.replace(/\/+$/, "");
      layer.handle.stack.forEach((nested: any) => printLayer(nextBase || "/", nested));
    }
  };

  stack.forEach((layer: any) => printLayer("", layer));
}

const app = express();
app.disable("x-powered-by");

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

app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log("[req]", req.method, req.originalUrl);
  next();
});
app.use("/public/iy", iyRouter);

app.use(statusRoutes);
app.use(publicRoutes);
app.use(searchCompanies);
app.use(getCompanyShipments);
app.use(rfpRoutes);
app.use(campaigns);

logRoutes(app);

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

