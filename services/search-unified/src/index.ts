// services/search-unified/src/index.ts

import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

import campaigns from "./routes/campaigns.js";
import getCompanyShipments from "./routes/getCompanyShipments.js";
import iyRouter from "./routes/iy.js";
import publicRoutes from "./routes/public.js";
import searchCompanies from "./routes/searchCompanies.js";
import statusRoutes from "./routes/status.js";
import aiRoutes from "./routes/ai.js";

const app = express();

app.disable("x-powered-by");

// Body parsing
app.use(
  express.json({
    limit: "2mb",
  }),
);
app.use(
  express.urlencoded({
    extended: true,
  }),
);

// CORS – simple but enough behind Gateway
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Key, x-api-key",
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Core public/status/search routes
// Each of these route modules defines its own paths, e.g.:
//   /public/status
//   /public/getFilterOptions
//   /public/searchCompanies
//   /public/getCompanyShipments
app.use(statusRoutes);
app.use(publicRoutes);
app.use(searchCompanies);
app.use(getCompanyShipments);

// ImportYeti routes
// IMPORTANT: routes/iy.ts defines:
//
//   router.post("/searchShippers", ...)
//   router.post("/companyBols", ...)
//   router.get("/bol", ...)
//
// Mounting at /public/iy gives:
//
//   POST /public/iy/searchShippers
//   POST /public/iy/companyBols
//   GET  /public/iy/bol
//
app.use("/public/iy", iyRouter);

// AI / Gemini routes
app.use("/ai", aiRoutes);

// Campaign / CRM routes
app.use(campaigns);

// Central error handler
app.use(
  (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    const error = err as {
      status?: number;
      code?: string;
      error_code?: string;
      message?: string;
    };

    const status = typeof error.status === "number" ? error.status : 500;
    const errorCode =
      error.error_code || error.code || (status >= 500 ? "internal_error" : "");
    const message =
      error.message ||
      (status >= 500 ? "Internal server error" : "Request failed");

    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error("search-unified error:", err);
    }

    res.status(status).json({
      ok: false,
      error_code: errorCode,
      message,
    });
  },
);

// Start server (Cloud Run entrypoint)
const port = Number(process.env.PORT ?? 8080);

if (process.env.NODE_ENV !== "test") {
  app.listen(port, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`search-unified listening on :${port}`);
  });
}

export default app;
