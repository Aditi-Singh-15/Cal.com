import express from "express";
import availabilityRouter from "./routes/availability.js";
import bookingsRouter from "./routes/bookings.js";
import eventTypesRouter from "./routes/event-types.js";
import publicRouter from "./routes/public.js";
import authRouter from "./routes/auth.js";
import { attachUser, requireAuth } from "./middleware/auth.js";
import { config } from "./config.js";

export function createApp() {
  const app = express();

  const allowedOrigins = config.frontendOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      if (req.method === "OPTIONS") {
        return res.sendStatus(204);
      }
    }
    return next();
  });

  app.use(express.json());
  app.use(attachUser);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/event-types", requireAuth, eventTypesRouter);
  app.use("/api/availability", requireAuth, availabilityRouter);
  app.use("/api/public", publicRouter);
  app.use("/api/bookings", requireAuth, bookingsRouter);

  app.use((error, _req, res, _next) => {
    // Keep logs simple for assignment evaluation.
    console.error(error);
    res.status(500).json({ code: "INTERNAL_SERVER_ERROR" });
  });

  return app;
}
