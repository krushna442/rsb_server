// import { query } from './db.js';

// // ─── helpers ─────────────────────────────────────────────────────────────────

// async function tableExists(tableName) {
//   try {
//     const result = await query(`SHOW TABLES LIKE '${tableName}'`);
//     return Array.isArray(result) && result.length > 0;
//   } catch (error) {
//     console.log(`⚠️  Could not check table ${tableName}:`, error.message);
//     return false;
//   }
// }

// // ─── table creators ───────────────────────────────────────────────────────────

// async function createDynamicFieldsTable() {
//   try {
//     await query(`
//       CREATE TABLE IF NOT EXISTS dynamic_fields (
//         id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
//         product_fields              JSON NOT NULL DEFAULT ('[]'),
//         approval_fields             JSON NOT NULL DEFAULT ('[]'),
//         quality_verification_fields JSON NOT NULL DEFAULT ('[]'),
//         updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
//       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
//     `);
//     console.log('✅ dynamic_fields table created/verified');

//     // Seed the one canonical config row if it doesn't exist yet
//     const existing = await query('SELECT id FROM dynamic_fields LIMIT 1');
//     if (!existing.length) {
//       await query(
//         'INSERT INTO dynamic_fields (product_fields, approval_fields, quality_verification_fields) VALUES (?, ?, ?)',
//         [
//           // ── product_fields ──────────────────────────────────────────────────
//           JSON.stringify([
//             // Identification & Admin
//             { name: 'partNumber',              type: 'text'   },
//             { name: 'customer',                type: 'text'   },
//             { name: 'vendorCode',              type: 'text'   },
//             { name: 'partType',                type: 'text'   },
//             { name: 'partDescription',         type: 'text'   },
//             { name: 'series',                  type: 'text'   },
//             { name: 'vehicleType',             type: 'text'   },
//             { name: 'status',                  type: 'text'   },
//             { name: 'poNumber',                type: 'text'   },
//             { name: 'supplyDate',              type: 'date'   },
//             { name: 'sampleStatus',            type: 'text'   },
//             { name: 'sampleSupplyMode',        type: 'text'   },
//             { name: 'acceptedMailDate',        type: 'date'   },
//             { name: 'revNo', type: 'text' },
//             // Dimensional
//             { name: 'tubeLength',              type: 'number' },
//             { name: 'tubeDiameter',            type: 'text'   },
//             { name: 'partWeightKg',            type: 'number' },
//             { name: 'totalLength',             type: 'number' },
//             { name: 'noiseDeadenerLength',     type: 'number' },
//             { name: 'availableNoiseDeadener',  type: 'text'   },
//             { name: 'rearHousingLength',       type: 'number' },
//             { name: 'longForkLength',          type: 'number' },
//             { name: 'pdcLength',               type: 'number' },
//             // Drawing
//             { name: 'drawingNumber',           type: 'text'   },
//             { name: 'drawingModel',            type: 'text'   },
//             // Assembly / Fitment
//             { name: 'fepPressHStockPositions',       type: 'text' },
//             { name: 'frontEndPieceDetails',          type: 'text' },
//             { name: 'sfDetails',                     type: 'text' },
//             { name: 'couplingFlangeOrientations',    type: 'text' },
//             { name: 'hexBoltNutTighteningTorque',    type: 'text' },
//             { name: 'loctiteGradeUse',               type: 'text' },
//             { name: 'cbKitDetails',                  type: 'text' },
//             { name: 'slipDetails',                   type: 'text' },
//             { name: 'greaseableOrNonGreaseable',     type: 'text' },
//             { name: 'mountingDetailsFlangeYoke',     type: 'text' },
//             { name: 'mountingDetailsCouplingFlange', type: 'text' },
//             { name: 'iaBellowDetails',               type: 'text' },
//             // Balancing
//             { name: 'balancingRpm',            type: 'number' },
//             { name: 'unbalanceInCmg',          type: 'number' },
//             { name: 'unbalanceInGram',         type: 'number' },
//             { name: 'unbalanceInGram75Percent',type: 'number' },
//             // TRSO
//             { name: 'trsoDate',  type: 'date' },
//             { name: 'trsoModel', type: 'text' },
//             { name: 'trsoRev',   type: 'text' },
//             // IQA
//             { name: 'iqaDate',     type: 'date' },
//             { name: 'iqaModel',    type: 'text' },
//             { name: 'iqaVcNumber', type: 'text' },
//             // PPAP
//             { name: 'ppapIntimateDate', type: 'date' },
//             { name: 'ppapClosingDate',  type: 'date' },
//             { name: 'ppapStatus',       type: 'text' },
//           ]),

//           // ── approval_fields (23 fields) ─────────────────────────────────────
//           JSON.stringify([
//             'customer', 'vendorCode', 'poNumber', 'supplyDate',
//             'sampleStatus', 'sampleSupplyMode', 'acceptedMailDate',
//             'trsoDate', 'trsoModel', 'trsoRev',
//             'iqaDate', 'iqaModel', 'iqaVcNumber',
//             'ppapIntimateDate', 'ppapClosingDate', 'ppapStatus',
//             'drawingNumber', 'drawingModel', 'vehicleType',
//             'partNumber', 'partDescription'
//           ]),

//           // ── quality_verification_fields (26 fields) ─────────────────────────
//           JSON.stringify([
//             'tubeDiameter', 'series', 'tubeLength', 'partType', 'partWeightKg',
//             'noiseDeadenerLength', 'availableNoiseDeadener',
//             'fepPressHStockPositions', 'frontEndPieceDetails',
//             'rearHousingLength', 'longForkLength', 'sfDetails', 'pdcLength',
//             'couplingFlangeOrientations', 'hexBoltNutTighteningTorque',
//             'loctiteGradeUse', 'cbKitDetails', 'slipDetails',
//             'greaseableOrNonGreaseable',
//             'mountingDetailsFlangeYoke', 'mountingDetailsCouplingFlange',
//             'iaBellowDetails', 'totalLength',
//             'balancingRpm', 'unbalanceInCmg', 'unbalanceInGram',
//             'unbalanceInGram75Percent', 'revNo'
//           ]),
//         ]
//       );
//       console.log('✅ dynamic_fields seeded with default config');
//     }
//   } catch (error) {
//     console.error('❌ Error creating dynamic_fields table:', error.message);
//     throw error;
//   }
// }

// async function createProductsTable() {
//   try {
//     await query(`
//       CREATE TABLE IF NOT EXISTS products (
//         id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
//         part_number     VARCHAR(100) NOT NULL UNIQUE,
//         customer        VARCHAR(255) NOT NULL,

//         status          ENUM('draft','active','inactive','pending','rejected') DEFAULT 'draft',
//         approved        ENUM('pending','approved','rejected') DEFAULT 'pending',
//         quality_verified ENUM('pending','approved','rejected') DEFAULT 'pending',

//         edited          TINYINT(1) DEFAULT 0,
//         edited_fields   JSON DEFAULT ('[]'),

//         specification   JSON NOT NULL DEFAULT ('{}'),
//         ppap_documents JSON DEFAULT ('{}'),
//         created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
//         updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//         created_by      VARCHAR(100),
//         modified_by     VARCHAR(100),

//         INDEX idx_part_number   (part_number),
//         INDEX idx_customer      (customer),
//         INDEX idx_approved      (approved),
//         INDEX idx_quality       (quality_verified),
//         INDEX idx_status        (status),
//         INDEX idx_created_at    (created_at)
//       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
//     `);
//     console.log('✅ products table created/verified');
//   } catch (error) {
//     console.error('❌ Error creating products table:', error.message);
//     throw error;
//   }
// }

// async function createScannedProductsTable() {
//   try {
//     if (!(await tableExists('products'))) {
//       throw new Error('products table must exist before scanned_products');
//     }

//     await query(`
//       CREATE TABLE IF NOT EXISTS scanned_products (
//         id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

//         dispatch_date     DATE,
//         shift             VARCHAR(10),

//         part_no           VARCHAR(100),
//         customer_name     VARCHAR(255),
//         product_type      VARCHAR(100),

//         validation_status ENUM('pass','fail','pending') DEFAULT 'pending',
//         remarks           TEXT,

//         part_sl_no        VARCHAR(100),
//         sl_no             VARCHAR(100),
//         scanned_text      TEXT,

//         plant_location    VARCHAR(100),
//         vendorCode     VARCHAR(100),

//         is_rejected       TINYINT(1) DEFAULT 0,

//         created_by        VARCHAR(100),
//         modified_by       VARCHAR(100),

//         product_id        INT UNSIGNED NULL,

//         scanned_specification JSON DEFAULT ('{}'),
//         matched_fields        JSON DEFAULT ('[]'),
//         mismatched_fields     JSON DEFAULT ('[]'),

//         created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
//         updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

//         FOREIGN KEY (product_id)
//           REFERENCES products(id)
//           ON DELETE SET NULL
//           ON UPDATE CASCADE,

//         INDEX idx_part_no           (part_no),
//         INDEX idx_dispatch_date     (dispatch_date),
//         INDEX idx_validation_status (validation_status),
//         INDEX idx_is_rejected       (is_rejected),
//         INDEX idx_product_id        (product_id),
//         INDEX idx_created_at        (created_at)
//       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
//     `);
//     console.log('✅ scanned_products table created/verified');
//   } catch (error) {
//     console.error('❌ Error creating scanned_products table:', error.message);
//     throw error;
//   }
// }

// // ─── main export ──────────────────────────────────────────────────────────────

// export async function runBootstrap() {
//   console.log('🚀 Starting database bootstrap...');
//   try {
//     await query('SELECT 1');
//     console.log('✅ Database connection verified');

//     await createDynamicFieldsTable();
//     await createProductsTable();
//     await createScannedProductsTable();

//     console.log('🎉 Bootstrap completed successfully');
//     return true;
//   } catch (error) {
//     console.error('❌ Bootstrap failed:', error);
//     throw error;
//   }
// }



import { query } from "./db.js";

// ───────────────── helpers ─────────────────

async function tableExists(tableName) {
  try {
    const result = await query(`SHOW TABLES LIKE '${tableName}'`);
    return result.length > 0;
  } catch (err) {
    console.log("table check error", err.message);
    return false;
  }
}

// ───────────────── dynamic_fields ─────────────────

async function createDynamicFieldsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS dynamic_fields (

        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

        product_fields LONGTEXT NOT NULL,
        approval_fields LONGTEXT NOT NULL,
        quality_verification_fields LONGTEXT NOT NULL,

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP

      ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci;
    `);

    console.log("✅ dynamic_fields created");

    const existing = await query(
      "SELECT id FROM dynamic_fields LIMIT 1"
    );

    if (!existing.length) {
      await query(
        `INSERT INTO dynamic_fields
        (product_fields, approval_fields, quality_verification_fields)
        VALUES (?, ?, ?)`,
        [
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([])
        ]
      );

      console.log("✅ dynamic_fields seeded");
    }

  } catch (err) {
    console.log("dynamic_fields error", err.message);
    throw err;
  }
}

// ───────────────── products ─────────────────

async function createProductsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS products (

        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

        part_number VARCHAR(100) NOT NULL UNIQUE,
        customer VARCHAR(255) NOT NULL,

        status ENUM(
          'draft','active','inactive','pending','rejected'
        ) DEFAULT 'draft',

        approved ENUM(
          'pending','approved','rejected'
        ) DEFAULT 'pending',

        quality_verified ENUM(
          'pending','approved','rejected'
        ) DEFAULT 'pending',

        edited TINYINT(1) DEFAULT 0,

        edited_fields LONGTEXT,
        specification LONGTEXT NOT NULL,
        ppap_documents LONGTEXT,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP
        created_by VARCHAR(100),
        modified_by VARCHAR(100),

        INDEX idx_part_number (part_number),
        INDEX idx_customer (customer),
        INDEX idx_status (status),
        INDEX idx_approved (approved),
        INDEX idx_quality (quality_verified)

      ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci;
    `);

    console.log("✅ products created");

  } catch (err) {
    console.log("products error", err.message);
    throw err;
  }
}

// ───────────────── scanned_products ─────────────────

async function createScannedProductsTable() {
  try {

    if (!(await tableExists("products"))) {
      throw new Error(
        "products must exist before scanned_products"
      );
    }

    await query(`
      CREATE TABLE IF NOT EXISTS scanned_products (

        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

        dispatch_date DATE,
        shift VARCHAR(10),

        part_no VARCHAR(100),
        customer_name VARCHAR(255),
        product_type VARCHAR(100),

        validation_status ENUM(
          'pass','fail','pending'
        ) DEFAULT 'pending',

        remarks TEXT,

        part_sl_no VARCHAR(100),
        sl_no VARCHAR(100),
        scanned_text TEXT,

        plant_location VARCHAR(100),
        vendorCode VARCHAR(100),

        is_rejected TINYINT(1) DEFAULT 0,

        created_by VARCHAR(100),
        modified_by VARCHAR(100),

        product_id INT UNSIGNED,

        scanned_specification LONGTEXT,
        matched_fields LONGTEXT,
        mismatched_fields LONGTEXT,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

        FOREIGN KEY (product_id)
        REFERENCES products(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE

      ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci;
    `);

    console.log("✅ scanned_products created");

  } catch (err) {
    console.log("scanned_products error", err.message);
    throw err;
  }
}

// ───────────────── bootstrap ─────────────────

export async function runBootstrap() {

  console.log("🚀 bootstrap start");

  try {

    await query("SELECT 1");

    console.log("✅ DB connected");

    await createDynamicFieldsTable();
    await createProductsTable();
    await createScannedProductsTable();

    console.log("🎉 bootstrap done");

  } catch (err) {

    console.log("❌ bootstrap failed", err);

    throw err;
  }
}