import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { testConnection, closePool } from "./db/pool.js";
import { runBootstrap } from "./db/bootstrap.js";

import dynamicFieldRoutes from "./routes/dynamicFieldRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import productImageRoutes from "./routes/productImageRoutes.js";
import scannedProductRoutes from "./routes/scannedProductRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import fieldImageRoutes from "./routes/fieldImageRoutes.js";
import {initShiftReportCrons} from "./utils/Shiftreportcron.js";
import pdiReportRoutes from "./routes/Pdireportroutes.js";
import pdiManualRoute from "./routes/pdiManualRoute.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;


// ✅ CORS setup
app.use(
  cors({
    origin: ["http://192.168.1.8:3000", "http://172.22.39.17:3000","http://10.99.45.17:3000","http://192.168.1.10:3000","http://10.99.45.17:3001","http://192.168.1.10:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
// ✅ middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


// bootstrap + connection test
async function startServer() {
  try {
    await runBootstrap();

    const ok = await testConnection();
    if (!ok) {
      console.log("DB connection failed");
      process.exit(1);
    }

    // routes
    app.use("/api/dynamic-fields", dynamicFieldRoutes);
    app.use("/api/products", productRoutes);
    app.use("/api/product-images", productImageRoutes);
    app.use("/api/scanned-products", scannedProductRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/field-images", fieldImageRoutes);
    app.use("/api/pdi-reports", pdiReportRoutes);
    app.use("/api/pdi-manual", pdiManualRoute);
    app.get("/", (req, res) => {
      res.send("API running...");
    });

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initShiftReportCrons(); // ✅ moved here
});
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
}

startServer();

// graceful shutdown
process.on("SIGINT", async () => {
  await closePool();
  process.exit(0);
});