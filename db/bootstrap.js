import { json } from 'express';
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
        nav_array           JSON DEFAULT ('[]'),
        profile_image       VARCHAR(255) DEFAULT NULL,
        is_active           TINYINT(1) DEFAULT 1,
        despatch_mail       TINYINT(1) DEFAULT 0,
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
          (name, mobile, username, email, password, role, column_array, menu_array, document_name_array, nav_array, profile_image, is_active, show_image)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Krushna',
          '9876543210',
          'krushna_07',
          'krushna.corenova@gmail.com',
          '12345678',
          'super admin',

          // column_array
          JSON.stringify(['partNumber', 'customer', 'series', 'status']),

          // menu_array
          JSON.stringify(['Dashboard', 'Products', 'Scanned Products', 'User Management']),

          // document_name_array
          JSON.stringify(['PPAP', 'Drawings', 'Test Reports']),

          // nav_array
          JSON.stringify(['Dashboard',
  'Product Master',
  'Production Approval',
  'Product Scanning',
  'Quality Approval',
  'Documents',
  'Drawings',
  'Standards',
  'Control Plan',
  'Bearing Cup Plan',
  'Hourly Production',
  'Despatch Plan',
  'Skill Matrix',
  'Product Specifications',
  'Dynamic Fields',
  'Scanned Products',
  'PDI Report',
  'Users',
  'Settings']),

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
        customer_names              JSON NOT NULL DEFAULT ('[]'),
        standard_names              JSON NOT NULL DEFAULT ('[]'),
        control_plan_names          JSON NOT NULL DEFAULT ('[]'),
        bearing_JT_types            JSON NOT NULL DEFAULT ('[]'),
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ dynamic_fields table created/verified');

    const existing = await query('SELECT id FROM dynamic_fields LIMIT 1');
    if (!existing.length) {
      await query(
        `INSERT INTO dynamic_fields
          (product_fields, approval_fields, quality_verification_fields, important_fields, documents,customer_names,standard_names,control_plan_names, bearing_JT_types)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          JSON.stringify([
            "ALL ALW",
            "ALL PNR",
            "TML"
          ]),
          JSON.stringify([
            "SS/TS",
            "ISO",
            "DIN",
            "MANUAL"
          ]),
          JSON.stringify([
            "FRONT LINE",
            "REAR LINE",
            "COMMON LINE",
            "SOP / Quality Alert"
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

// ─── drawings ─────────────────────────────────────────────────────────────────

async function createDrawingsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS drawings (
        id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        drawing_number    VARCHAR(100) NOT NULL,
        shaft             VARCHAR(255),
        joint             VARCHAR(100),
        part_number       TEXT,
        customer          VARCHAR(255),
        modification_number VARCHAR(100),
        modification_date DATE,
        bom               VARCHAR(255),
        file_path         VARCHAR(500),
        version           INT UNSIGNED DEFAULT 1,
        parent_id         INT UNSIGNED NULL,
        is_latest         TINYINT(1) DEFAULT 1,
        remarks           TEXT,
        created_by        VARCHAR(100),
        updated_by        VARCHAR(100),
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_drawing_number (drawing_number),
        INDEX idx_customer       (customer),
        INDEX idx_is_latest      (is_latest),
        INDEX idx_parent_id      (parent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ drawings table created/verified');
  } catch (error) {
    console.error('❌ Error creating drawings table:', error.message);
    throw error;
  }
}

// ─── standards ────────────────────────────────────────────────────────────────

async function createStandardsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS standards (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        standard_no   VARCHAR(150) NOT NULL,
        description   TEXT,
        rev_number    VARCHAR(50),
        rev_date      DATE,
        comment       TEXT,
        file_path     VARCHAR(500),
        category      VARCHAR(150) DEFAULT 'MANUAL',
        version       INT UNSIGNED DEFAULT 1,
        parent_id     INT UNSIGNED NULL,
        is_latest     TINYINT(1) DEFAULT 1,
        remarks       TEXT,
        created_by    VARCHAR(100),
        updated_by    VARCHAR(100),
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_standard_no (standard_no),
        INDEX idx_category    (category),
        INDEX idx_is_latest   (is_latest),
        INDEX idx_parent_id   (parent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ standards table created/verified');
  } catch (error) {
    console.error('❌ Error creating standards table:', error.message);
    throw error;
  }
}

// ─── control_plans ────────────────────────────────────────────────────────────

async function createControlPlansTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS control_plans (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        line        VARCHAR(150) NOT NULL DEFAULT 'FRONT LINE',
        rev_no      VARCHAR(50),
        rev_date    DATE,
        file_path   VARCHAR(500),
        is_active   TINYINT(1) DEFAULT 1,
        language    ENUM('English','Hindi') DEFAULT 'English',
        version     INT UNSIGNED DEFAULT 1,
        parent_id   INT UNSIGNED NULL,
        is_latest   TINYINT(1) DEFAULT 1,
        sequence_number INT DEFAULT 0,
        created_by  VARCHAR(100),
        updated_by  VARCHAR(100),
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_line      (line),
        INDEX idx_is_latest (is_latest),
        INDEX idx_is_active (is_active),
        INDEX idx_parent_id (parent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ control_plans table created/verified');
  } catch (error) {
    console.error('❌ Error creating control_plans table:', error.message);
    throw error;
  }
}

// ─── bearing_cup_plans ────────────────────────────────────────────────────────

async function createBearingCupPlansTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS bearing_cup_plans (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        plan_date   DATE NOT NULL,
        jt_type     VARCHAR(50) NOT NULL,
        type        ENUM('G','NG') NOT NULL DEFAULT 'G',
        shift1_qty  INT DEFAULT 0,
        shift2_qty  INT DEFAULT 0,
        shift3_qty  INT DEFAULT 0,
        target      INT DEFAULT 0,
        total_qty   INT DEFAULT 0,
        previous_diff INT DEFAULT 0,
        created_by  VARCHAR(100),
        updated_by  VARCHAR(100),
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_plan_jt_type (plan_date, jt_type, type),
        INDEX idx_plan_date (plan_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ bearing_cup_plans table created/verified');
  } catch (error) {
    console.error('❌ Error creating bearing_cup_plans table:', error.message);
    throw error;
  }
}

// ─── hourly_production ────────────────────────────────────────────────────────

async function createHourlyProductionTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hourly_production (
        id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        production_date  DATE NOT NULL,
        hour_slot        TINYINT UNSIGNED NOT NULL COMMENT '6–29 maps to 06:00–05:00 next day',
        part_type        ENUM('front','rear','ia') NOT NULL,
        tube_length      VARCHAR(100),
        quantity         INT DEFAULT 0,
        remarks          TEXT,
        created_by       VARCHAR(100),
        updated_by       VARCHAR(100),
        created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_prod_date  (production_date),
        INDEX idx_hour_slot  (hour_slot),
        INDEX idx_part_type  (part_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ hourly_production table created/verified');
  } catch (error) {
    console.error('❌ Error creating hourly_production table:', error.message);
    throw error;
  }
}

// ─── Skill Matrix Tables ───────────────────────────────────────────────────────

async function createSkillMatrixTables() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS skill_matrix_machines (
        id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        machine_name VARCHAR(255) NOT NULL,
        machine_no   VARCHAR(100),
        created_by   VARCHAR(255),
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS skill_matrix_persons (
        id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        machine_id            INT UNSIGNED NOT NULL,
        name                  VARCHAR(255) NOT NULL,
        department            VARCHAR(255),
        date_of_joining       DATE,
        skill_level           TINYINT UNSIGNED DEFAULT 0,
        last_skill_update_date DATE,
        authorised_for        TEXT,
        photo_path            VARCHAR(500),
        created_by            VARCHAR(255),
        created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_machine (machine_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ skill_matrix tables created/verified');
  } catch (error) {
    console.error('❌ Error creating skill_matrix tables:', error.message);
    throw error;
  }
}

// ─── Despatch Plan Tables ──────────────────────────────────────────────────────

async function createDespatchPlanTables() {
  try {
    // One plan per 6am-to-6am "day"
    await query(`
      CREATE TABLE IF NOT EXISTS despatch_plans (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        plan_date   DATE NOT NULL,
        created_by  VARCHAR(255),
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_plan_date (plan_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS despatch_vehicles (
        id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        plan_id        INT UNSIGNED NOT NULL,
        vehicle_label  VARCHAR(10) NOT NULL,
        customer       VARCHAR(255),
        priority_number INT DEFAULT NULL,
        is_completed   TINYINT(1) DEFAULT 0,
        completed_at   DATETIME DEFAULT NULL,
        INDEX idx_plan (plan_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS despatch_pallets (
        id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        vehicle_id     INT UNSIGNED NOT NULL,
        pallet_label   VARCHAR(50) NOT NULL,
        part_number    VARCHAR(100) DEFAULT NULL,
        tube_length    VARCHAR(50) DEFAULT NULL,
        target_qty     INT DEFAULT 0,
        filled_quantity INT DEFAULT 0,
        scanned_qty    INT DEFAULT 0,
        is_fulfilled   TINYINT(1) DEFAULT 0,
        INDEX idx_vehicle (vehicle_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ despatch_plan tables created/verified');
  } catch (error) {
    console.error('❌ Error creating despatch_plan tables:', error.message);
    throw error;
  }
}

// ─── SOP Videos ───────────────────────────────────────────────────────────────

async function createSopVideosTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS sop_videos (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        title       VARCHAR(255) NOT NULL,
        file_path   VARCHAR(500) NOT NULL,
        mime_type   VARCHAR(100) DEFAULT 'video/mp4',
        file_size   BIGINT DEFAULT 0,
        created_by  VARCHAR(100),
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ sop_videos table created/verified');
  } catch (error) {
    console.error('❌ Error creating sop_videos table:', error.message);
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
    await createDrawingsTable();
    await createStandardsTable();
    await createControlPlansTable();
    await createBearingCupPlansTable();
    await createHourlyProductionTable();
    await createSkillMatrixTables();
    await createDespatchPlanTables();
    await createSopVideosTable();
    
    // Migration to make control_plans line column dynamic (VARCHAR instead of ENUM)
    // try { await query(`ALTER TABLE control_plans MODIFY COLUMN line VARCHAR(255) NOT NULL DEFAULT 'FRONT LINE'`); } catch (_) {}

    // // New Migrations
    // try { await query(`ALTER TABLE drawings ADD COLUMN remarks TEXT`); } catch (_) {}
    // try { await query(`ALTER TABLE standards ADD COLUMN remarks TEXT`); } catch (_) {}
    // try { await query(`ALTER TABLE control_plans ADD COLUMN sequence_number INT DEFAULT 0`); } catch (_) {}
    // try { await query(`ALTER TABLE dynamic_fields ADD COLUMN bearing_JT_types JSON NOT NULL DEFAULT ('[]')`); } catch (_) {}
    // try { await query(`ALTER TABLE bearing_cup_plans ADD COLUMN previous_diff INT DEFAULT 0`); } catch (_) {}
    try { await query(`ALTER TABLE standards MODIFY COLUMN category VARCHAR(150) DEFAULT 'MANUAL'`); } catch (_) {}
    try { await query(`ALTER TABLE control_plans MODIFY COLUMN line VARCHAR(150) DEFAULT 'FRONT LINE'`); } catch (_) {}

    // // Bearing Cup extra shift columns migration
    // for (let i = 4; i <= 6; i++) {
    //   try {
    //     await query(`ALTER TABLE bearing_cup_plans ADD COLUMN shift${i}_qty INT DEFAULT 0`);
    //   } catch (_) { /* already exists — safe to ignore */ }
    // }

    // Despatch Plan Migrations
    // try { await query(`ALTER TABLE users ADD COLUMN despatch_mail TINYINT(1) DEFAULT 0`); } catch (_) {}
    // try { await query(`ALTER TABLE drawings ADD COLUMN serial_number VARCHAR(100) AFTER customer`); } catch (_) {}
    // try { await query(`ALTER TABLE despatch_vehicles ADD COLUMN priority_number INT DEFAULT NULL`); } catch (_) {}
    // try { await query(`ALTER TABLE despatch_pallets ADD COLUMN filled_quantity INT DEFAULT 0 AFTER target_qty`); } catch (_) {}

    console.log('🎉 Bootstrap completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Bootstrap failed:', error);
    throw error;
  }
}