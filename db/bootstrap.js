import { query } from './db.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function tableExists(tableName) {
  try {
    const result = await query(`SHOW TABLES LIKE '${tableName}'`);
    return Array.isArray(result) && result.length > 0;
  } catch (error) {
    console.log(`⚠️  Could not check table ${tableName}:`, error.message);
    return false;
  }
}

// ─── table creators ───────────────────────────────────────────────────────────

async function createUsersTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name                VARCHAR(255) NOT NULL,
        mobile              VARCHAR(20),
        username            VARCHAR(100) NOT NULL UNIQUE,
        email               VARCHAR(255) NOT NULL UNIQUE,
        password            VARCHAR(255) NOT NULL,
        role                ENUM('super admin', 'admin', 'production', 'quality', 'viewer') DEFAULT 'viewer',
        column_array        JSON DEFAULT ('[]'),
        menu_array          JSON DEFAULT ('[]'),
        document_name_array JSON DEFAULT ('[]'),
        mail_types          JSON DEFAULT ('[]'),
        profile_image       VARCHAR(255) DEFAULT NULL,
        is_active           TINYINT(1) DEFAULT 1,
        created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        show_image          VARCHAR(10) DEFAULT 'true',
        INDEX idx_username  (username),
        INDEX idx_email     (email),
        INDEX idx_role      (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ users table created/verified');

    // Seed the default super admin if no users exist yet
    const existing = await query('SELECT id FROM users LIMIT 1');
    if (!existing.length) {
      await query(
        `INSERT INTO users
          (name, mobile, username, email, password, role, column_array, menu_array, document_name_array, profile_image, is_active, show_image)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Krushna',
          '9876543210',
          'krushna_07',
          'krushna.corenova@gmail.com',
          '12345678',                       // ⚠️ hash this before production (e.g. bcrypt)
          'super admin',

          // column_array
          JSON.stringify(['partNumber', 'customer', 'series', 'status']),

          // menu_array
          JSON.stringify(['Dashboard', 'Products', 'Scanned Products', 'User Management']),

          // document_name_array
          JSON.stringify(['PPAP', 'Drawings', 'Test Reports']),

          'uploads/user_profile/profile-1775042275569-KC_logo.jpg',
          1,       // is_active
          'true',  // show_image
        ]
      );
      console.log('✅ users table seeded with default super admin');
    }
  } catch (error) {
    console.error('❌ Error creating users table:', error.message);
    throw error;
  }
}

async function createDynamicFieldsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS dynamic_fields (
        id                          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        product_fields              JSON NOT NULL DEFAULT ('[]'),
        approval_fields             JSON NOT NULL DEFAULT ('[]'),
        quality_verification_fields JSON NOT NULL DEFAULT ('[]'),
        important_fields            JSON NOT NULL DEFAULT ('[]'),
        documents                   JSON NOT NULL DEFAULT ('[]'),
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ dynamic_fields table created/verified');

    const existing = await query('SELECT id FROM dynamic_fields LIMIT 1');
    if (!existing.length) {
      await query(
        `INSERT INTO dynamic_fields
          (product_fields, approval_fields, quality_verification_fields, important_fields, documents)
         VALUES (?, ?, ?, ?, ?)`,
        [
          // ── product_fields (unchanged) ──────────────────────────────────────
          JSON.stringify([
            { name: 'partNumber',              type: 'text'   },
            { name: 'customer',                type: 'text'   },
            { name: 'vendorCode',              type: 'text'   },
            { name: 'partType',                type: 'text'   },
            { name: 'partDescription',         type: 'text'   },
            { name: 'series',                  type: 'text'   },
            { name: 'vehicleType',             type: 'text'   },
            { name: 'status',                  type: 'text'   },
            { name: 'poNumber',                type: 'text'   },
            { name: 'supplyDate',              type: 'date'   },
            { name: 'sampleStatus',            type: 'text'   },
            { name: 'sampleSupplyMode',        type: 'text'   },
            { name: 'acceptedMailDate',        type: 'date'   },
            { name: 'revNo',                   type: 'text'   },
            { name: 'tubeLength',              type: 'number' },
            { name: 'tubeDiameter',            type: 'text'   },
            { name: 'partWeightKg',            type: 'number' },
            { name: 'totalLength',             type: 'number' },
            { name: 'noiseDeadenerLength',     type: 'number' },
            { name: 'availableNoiseDeadener',  type: 'text'   },
            { name: 'rearHousingLength',       type: 'number' },
            { name: 'longForkLength',          type: 'number' },
            { name: 'pdcLength',               type: 'number' },
            { name: 'drawingNumber',           type: 'text'   },
            { name: 'drawingModel',            type: 'text'   },
            { name: 'fepPressHStockPositions',       type: 'text' },
            { name: 'frontEndPieceDetails',          type: 'text' },
            { name: 'sfDetails',                     type: 'text' },
            { name: 'couplingFlangeOrientations',    type: 'text' },
            { name: 'hexBoltNutTighteningTorque',    type: 'text' },
            { name: 'loctiteGradeUse',               type: 'text' },
            { name: 'cbKitDetails',                  type: 'text' },
            { name: 'slipDetails',                   type: 'text' },
            { name: 'greaseableOrNonGreaseable',     type: 'text' },
            { name: 'mountingDetailsFlangeYoke',     type: 'text' },
            { name: 'mountingDetailsCouplingFlange', type: 'text' },
            { name: 'iaBellowDetails',               type: 'text' },
            { name: 'balancingRpm',            type: 'number' },
            { name: 'unbalanceInCmg',          type: 'number' },
            { name: 'unbalanceInGram',         type: 'number' },
            { name: 'unbalanceInGram75Percent',type: 'number' },
            { name: 'trsoDate',  type: 'date' },
            { name: 'trsoModel', type: 'text' },
            { name: 'trsoRev',   type: 'text' },
            { name: 'iqaDate',     type: 'date' },
            { name: 'iqaModel',    type: 'text' },
            { name: 'iqaVcNumber', type: 'text' },
            { name: 'ppapIntimateDate', type: 'date' },
            { name: 'ppapClosingDate',  type: 'date' },
            { name: 'ppapStatus',       type: 'text' },
            { name: 'remarks',          type: 'text' },
          ]),

          // ── approval_fields (unchanged) ─────────────────────────────────────
          JSON.stringify([
            'customer', 'vendorCode', 'poNumber', 'supplyDate',
            'sampleStatus', 'sampleSupplyMode', 'acceptedMailDate',
            'trsoDate', 'trsoModel', 'trsoRev',
            'iqaDate', 'iqaModel', 'iqaVcNumber',
            'ppapIntimateDate', 'ppapClosingDate', 'ppapStatus',
            'drawingNumber', 'drawingModel', 'vehicleType',
            'partNumber', 'partDescription',
          ]),

          // ── quality_verification_fields (unchanged) ─────────────────────────
          JSON.stringify([
            'tubeDiameter', 'series', 'tubeLength', 'partType', 'partWeightKg',
            'noiseDeadenerLength', 'availableNoiseDeadener',
            'fepPressHStockPositions', 'frontEndPieceDetails',
            'rearHousingLength', 'longForkLength', 'sfDetails', 'pdcLength',
            'couplingFlangeOrientations', 'hexBoltNutTighteningTorque',
            'loctiteGradeUse', 'cbKitDetails', 'slipDetails',
            'greaseableOrNonGreaseable',
            'mountingDetailsFlangeYoke', 'mountingDetailsCouplingFlange',
            'iaBellowDetails', 'totalLength',
            'balancingRpm', 'unbalanceInCmg', 'unbalanceInGram',
            'unbalanceInGram75Percent', 'revNo',
          ]),

          // ── important_fields (seed: empty — add what you need via API) ──────
          JSON.stringify([]),

          // ── documents ───────────────────────────────────────────────────────
          JSON.stringify([
            // individual category
            { name: 'PSW',               category: 'individual' },
            { name: 'TRSO',              category: 'individual' },
            { name: 'IQA',               category: 'individual' },
            { name: 'PO COPY',           category: 'individual' },
            { name: 'Drawing',           category: 'individual' },
            { name: 'INSPECTION REPORT', category: 'individual' },
            { name: 'STICKER',           category: 'individual' },
            // ppap category
            { name: 'DRAWING',           category: 'ppap' },
            { name: 'SAMPLE REPORT',     category: 'ppap' },
            { name: 'MR REPORT',         category: 'ppap' },
            { name: 'SPC',               category: 'ppap' },
            { name: 'MSA',               category: 'ppap' },
            { name: 'PIST',              category: 'ppap' },
            { name: 'PFMEA',             category: 'ppap' },
            { name: 'PFD',               category: 'ppap' },
            { name: 'CONTROL PLAN',      category: 'ppap' },
            { name: 'IQA',               category: 'ppap' },
            { name: 'WELDING REPORT',    category: 'ppap' },
          ]),
        ]
      );
      console.log('✅ dynamic_fields seeded with default config');
    }
  } catch (error) {
    console.error('❌ Error creating dynamic_fields table:', error.message);
    throw error;
  }
}

async function createProductsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS products (
        id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        part_number     VARCHAR(100) NOT NULL UNIQUE,
        customer        VARCHAR(255) NOT NULL,

        status          ENUM('draft','active','inactive','pending','rejected') DEFAULT 'draft',
        approved        ENUM('pending','approved','rejected') DEFAULT 'pending',
        quality_verified ENUM('pending','approved','rejected') DEFAULT 'pending',
        remarks         JSON DEFAULT ('[]'),
        edited          TINYINT(1) DEFAULT 0,
        edited_fields   JSON DEFAULT ('[]'),

        specification   JSON NOT NULL DEFAULT ('{}'),
        ppap_documents JSON DEFAULT ('{}'),
        product_images  JSON DEFAULT ('{}'),
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by      VARCHAR(100),
        modified_by     VARCHAR(100),

        INDEX idx_part_number   (part_number),
        INDEX idx_customer      (customer),
        INDEX idx_approved      (approved),
        INDEX idx_quality       (quality_verified),
        INDEX idx_status        (status),
        INDEX idx_created_at    (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ products table created/verified');
  } catch (error) {
    console.error('❌ Error creating products table:', error.message);
    throw error;
  }
}

async function createScannedProductsTable() {
  try {
    if (!(await tableExists('products'))) {
      throw new Error('products table must exist before scanned_products');
    }

    await query(`
      CREATE TABLE IF NOT EXISTS scanned_products (
        id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

        dispatch_date     DATE,
        shift             VARCHAR(10),

        part_no           VARCHAR(100),
        customer_name     VARCHAR(255),
        product_type      VARCHAR(100),

        validation_status ENUM('pass','fail','pending') DEFAULT 'pending',
        remarks           TEXT,
        admin_remarks     TEXT,
        part_sl_no        VARCHAR(100),
        sl_no             VARCHAR(100),
        scanned_text      TEXT,

        plant_location    VARCHAR(100),
        vendorCode     VARCHAR(100),

        is_rejected       TINYINT(1) DEFAULT 0,
        is_remarks_edited TINYINT(1) DEFAULT 0,

        created_by        VARCHAR(100),
        modified_by       VARCHAR(100),

        product_id        INT UNSIGNED NULL,

        scanned_specification JSON DEFAULT ('{}'),
        matched_fields        JSON DEFAULT ('[]'),
        mismatched_fields     JSON DEFAULT ('[]'),
        scanned_text_length   INT GENERATED ALWAYS AS (CHAR_LENGTH(scanned_text)) STORED,

        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        FOREIGN KEY (product_id)
          REFERENCES products(id)
          ON DELETE SET NULL
          ON UPDATE CASCADE,

        INDEX idx_part_no           (part_no),
        INDEX idx_dispatch_date     (dispatch_date),
        INDEX idx_validation_status (validation_status),
        INDEX idx_is_rejected       (is_rejected),
        INDEX idx_product_id        (product_id),
        INDEX idx_created_at        (created_at),
        UNIQUE INDEX idx_unique_part_sl (part_no, part_sl_no, scanned_text_length,validation_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ scanned_products table created/verified');
  } catch (error) {
    console.error('❌ Error creating scanned_products table:', error.message);
    throw error;
  }
}

async function createFieldImagesTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS field_images (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

        -- Which spec field this image belongs to
        -- e.g. "mountingDetailsFlangeYoke", "mountingDetailsCouplingFlange",
        --       "availableNoiseDeadener", "couplingFlangeOrientations"
        field_name    VARCHAR(100) NOT NULL,

        -- The dropdown option this file is associated with
        -- e.g. "F/Y 150 DIA 4 HOLES"
        option_value  VARCHAR(255) NOT NULL,

        -- Relative path to the uploaded image/PDF on disk
        file_path     VARCHAR(500) NOT NULL,

        created_by    VARCHAR(100) DEFAULT NULL,
        modified_by   VARCHAR(100) DEFAULT NULL,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        -- Each (field_name, option_value) pair is unique (upsert behaviour)
        UNIQUE KEY uq_field_option (field_name, option_value),

        INDEX idx_field_name   (field_name),
        INDEX idx_option_value (option_value)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ field_images table created/verified');
  } catch (error) {
    console.error('❌ Error creating field_images table:', error.message);
    throw error;
  }
}

async function createPDIReportTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS pdi_report (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

        name          VARCHAR(255) NOT NULL,
        file_path     TEXT NOT NULL,

        user_id       INT UNSIGNED NULL,

        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      
        INDEX idx_user_id   (user_id)

      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('✅ user_documents table created/verified');
  } catch (error) {
    console.error('❌ Error creating user_documents table:', error.message);
    throw error;
  }
}

// ─── main export ──────────────────────────────────────────────────────────────

export async function runBootstrap() {
  console.log('🚀 Starting database bootstrap...');
  try {
    await query('SELECT 1');
    console.log('✅ Database connection verified');

    await createDynamicFieldsTable();
    await createProductsTable();
    await createScannedProductsTable();
    await createFieldImagesTable();
    await createUsersTable();
    await createPDIReportTable();

    console.log('🎉 Bootstrap completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Bootstrap failed:', error);
    throw error;
  }
}