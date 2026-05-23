import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { testConnection, closePool } from "./db/pool.js";
import { runBootstrap } from "./db/bootstrap.js";
import { initSocket } from "./utils/socket.js";

import dynamicFieldRoutes from "./routes/dynamicFieldRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import productImageRoutes from "./routes/productImageRoutes.js";
import scannedProductRoutes from "./routes/scannedProductRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import fieldImageRoutes from "./routes/fieldImageRoutes.js";
import {initShiftReportCrons} from "./utils/Shiftreportcron.js";
import pdiReportRoutes from "./routes/Pdireportroutes.js";
import pdiManualRoute from "./routes/pdiManualRoute.js";
import drawingRoutes from "./routes/drawingRoutes.js";
import standardRoutes from "./routes/standardRoutes.js";
import controlPlanRoutes from "./routes/controlPlanRoutes.js";
import bearingCupRoutes from "./routes/bearingCupRoutes.js";
import hourlyProductionRoutes from "./routes/hourlyProductionRoutes.js";
import skillMatrixRoutes from "./routes/skillMatrixRoutes.js";
import despatchPlanRoutes from "./routes/despatchPlanRoutes.js";
import sopVideoRoutes from "./routes/sopVideoRoutes.js";
import { sendDailyExcelReport } from "./controllers/despatchPlanController.js";
import { sendProductionPendingReminder, sendQualityPendingReminder } from "./utils/productPendingCron.js";
import cron from "node-cron";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ── Allowed origins (same list used for both REST CORS and Socket.IO CORS) ────
const ALLOWED_ORIGINS = [
  "http://192.168.1.3:3000",
  "http://10.88.69.17:3000",
  "http://172.22.39.17:3000",
  "http://10.99.45.17:3000",
  "http://192.168.1.7:3000",
  "http://10.99.45.17:3001",
  "http://192.168.1.10:3000",
  // allow localhost for development
  "http://localhost:3000",
];

// ✅ CORS setup
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ✅ Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Create HTTP server (required to attach Socket.IO) ─────────────────────────
const httpServer = createServer(app);

// ── Socket.IO server ──────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Tune transport settings for long-lived 24x7 connections
  pingTimeout: 60000,      // 60 s before declaring a client disconnected
  pingInterval: 25000,     // send a ping every 25 s to keep connections alive
  transports: ["websocket", "polling"],  // websocket preferred, polling fallback
});

// Register the singleton so controllers can call emitToAll()
initSocket(io);

// ── Socket.IO connection handler ──────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  socket.on("disconnect", (reason) => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id} — ${reason}`);
  });

  socket.on("error", (err) => {
    console.error(`[Socket.IO] Socket error (${socket.id}):`, err.message);
  });
});

// ── Bootstrap + start ─────────────────────────────────────────────────────────
async function startServer() {
  try {
    await runBootstrap();

    const ok = await testConnection();
    if (!ok) {
      console.log("DB connection failed");
      process.exit(1);
    }

    // ── REST routes ─────────────────────────────────────────────────────────
    app.use("/api/dynamic-fields",    dynamicFieldRoutes);
    app.use("/api/products",          productRoutes);
    app.use("/api/product-images",    productImageRoutes);
    app.use("/api/scanned-products",  scannedProductRoutes);
    app.use("/api/users",             userRoutes);
    app.use("/api/field-images",      fieldImageRoutes);
    app.use("/api/pdi-reports",       pdiReportRoutes);
    app.use("/api/pdi-manual",        pdiManualRoute);
    app.use("/api/drawings",          drawingRoutes);
    app.use("/api/standards",         standardRoutes);
    app.use("/api/control-plans",     controlPlanRoutes);
    app.use("/api/bearing-cup-plans", bearingCupRoutes);
    app.use("/api/hourly-production", hourlyProductionRoutes);
    app.use("/api/skill-matrix",      skillMatrixRoutes);
    app.use("/api/despatch-plan",     despatchPlanRoutes);
    app.use("/api/sop-videos",        sopVideoRoutes);

    app.get("/", (req, res) => {
      res.send("API running...");
    });

    // ── Listen on HTTP server (not app.listen) ──────────────────────────────
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`[Socket.IO] WebSocket server ready`);
      // initShiftReportCrons();

      // 6:05 AM IST daily despatch Excel report (IST = UTC+5:30 → UTC 00:35)
      cron.schedule('35 0 * * *', async () => {
        try {
          const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const dateStr = yesterday.toISOString().slice(0, 10);
          console.log(`[CRON] Sending daily despatch report for ${dateStr}`);
          await sendDailyExcelReport(dateStr);
          console.log('[CRON] Despatch report sent');
        } catch (err) {
          console.error('[CRON] Despatch report error:', err.message);
        }
      }, { timezone: 'Asia/Kolkata' });

      // 9:00 AM IST daily — Production pending approval reminder
      cron.schedule('30 3 * * *', async () => {
        try {
          console.log('[CRON] Running production pending approval reminder...');
          await sendProductionPendingReminder();
        } catch (err) {
          console.error('[CRON] Production pending reminder error:', err.message);
        }
      }, { timezone: 'Asia/Kolkata' });

      // 9:05 AM IST daily — Quality pending verification reminder
      cron.schedule('35 3 * * *', async () => {
        try {
          console.log('[CRON] Running quality pending verification reminder...');
          await sendQualityPendingReminder();
        } catch (err) {
          console.error('[CRON] Quality pending reminder error:', err.message);
        }
      }, { timezone: 'Asia/Kolkata' });
    });

  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
}

startServer();

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on("SIGINT", async () => {
  console.log("\n[Shutdown] Closing Socket.IO connections...");
  io.close();
  await closePool();
  process.exit(0);
});