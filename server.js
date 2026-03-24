import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { testConnection, closePool } from "./db/pool.js";
import { runBootstrap } from "./db/bootstrap.js";

import dynamicFieldRoutes from "./routes/dynamicFieldRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import scannedProductRoutes from "./routes/scannedProductRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;


// ✅ CORS setup
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
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
    app.use("/api/scanned-products", scannedProductRoutes);

    app.get("/", (req, res) => {
      res.send("API running...");
    });

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
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