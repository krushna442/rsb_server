import { query, queryOne, execute, getConnection } from '../db/db.js';
import fs from "fs";
// ─── helpers ──────────────────────────────────────────────────────────────────

const parseJSON = (data, fallback = '{}') => {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return JSON.parse(fallback);
    }
  }
  return data ?? JSON.parse(fallback);
};

const parseJsonCols = (row) => {
  if (!row) return null;
  return {
    ...row,
    specification: parseJSON(row.specification, '{}'),
    edited_fields: parseJSON(row.edited_fields, '[]'),
  };
};

// ─── READ ─────────────────────────────────────────────────────────────────────

/**
 * Find all products with optional filters
 */
export const findAllProducts = async (filters = {}) => {
  try {
    let sql = 'SELECT * FROM products WHERE 1=1';
    const values = [];

    if (filters.status) {
      sql += ' AND status = ?';
      values.push(filters.status);
    }
    if (filters.approved) {
      sql += ' AND approved = ?';
      values.push(filters.approved);
    }
    if (filters.quality_verified) {
      sql += ' AND quality_verified = ?';
      values.push(filters.quality_verified);
    }
    if (filters.customer) {
      sql += ' AND customer = ?';
      values.push(filters.customer);
    }
    if (filters.search) {
      sql += ' AND part_number LIKE ?';
      values.push(`%${filters.search}%`);
    }

    sql += ' ORDER BY created_at DESC';

    const rows = await query(sql, values);
    return rows.map(parseJsonCols);
  } catch (error) {
    console.error('Error in findAllProducts:', error);
    throw error;
  }
};

/**
 * Find product by database id
 */
export const findProductById = async (id) => {
  try {
    const row = await queryOne('SELECT * FROM products WHERE id = ?', [id]);
    return parseJsonCols(row);
  } catch (error) {
    console.error('Error in findProductById:', error);
    throw error;
  }
};

/**
 * Find product by part_number (used by scanner)
 */
export const findProductByPartNumber = async (partNumber) => {
  try {
    const row = await queryOne(
      'SELECT * FROM products WHERE part_number = ?',
      [partNumber]
    );
    return parseJsonCols(row);
  } catch (error) {
    console.error('Error in findProductByPartNumber:', error);
    throw error;
  }
};

// ─── CREATE ───────────────────────────────────────────────────────────────────

/**
 * Create a new product
 */
export const createProduct = async (productData) => {
  try {
    const {
      part_number,
      customer,
      specification = {},
      status = 'pending',
      created_by = null,
    } = productData;

    if (!part_number) throw new Error('part_number is required');
    if (!customer)    throw new Error('customer is required');

    const result = await execute(
      `INSERT INTO products
        (part_number, customer, status, approved, quality_verified,
         edited, edited_fields, specification, created_by, modified_by)
       VALUES (?, ?, ?, 'pending', 'pending', 0, '[]', ?, ?, ?)`,
      [
        part_number,
        customer,
        status,
        JSON.stringify(specification),
        created_by,
        created_by,
      ]
    );

    return findProductById(result.insertId);
  } catch (error) {
    console.error('Error in createProduct:', error);
    throw error;
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

/**
 * Update a product. Auto-tracks which spec fields changed.
 */
export const updateProduct = async (
  id,
  updateData,
  modified_by = null,
  role = null
) => {
  try {
    const existing = await findProductById(id);
    if (!existing) throw new Error(`Product ${id} not found`);

    const normalizedRole = role?.toLowerCase();
    const isSuperAdmin = normalizedRole === 'super admin';
    const isAdmin      = normalizedRole === 'admin';
    const isPrivileged = isSuperAdmin || isAdmin;

    const fields = ['updated_at = NOW()', 'modified_by = ?'];
    const values = [modified_by];

    const allowedFields = ['part_number', 'customer', 'status'];

    // Fields which should trigger pending status if edited
    const pendingFields = [
      "drawingNumber",
      "drawingModel",
      "vehicleType",
      "customerName",
      "vendorCode",
      "partNo",
      "partDescription",
      "tubeDiameter",
      "series",
      "tubeLength",
      "partType",
      "noiseDeadenerLength",
      "availableNoiseDeadener",
      "fepPressHStockPositions",
      "frontEndPieceDetails",
      "rearHousingLength",
      "longForkLength",
      "sfDetails",
      "pdcLength",
      "couplingFlangeOrientations",
      "hexBoltNutTighteningTorque",
      "loctiteGradeUse",
      "cbKitDetails",
      "slipDetails",
      "greaseableOrNonGreaseable",
      "mountingDetailsFlangeYoke",
      "mountingDetailsCouplingFlange",
      "iaBellowDetails",
      "totalLength",
      "balancingRpm",
      "unbalanceInCmg",
      "unbalanceInGram",
      "unbalanceInGram75Percent",
      "revNo",
      "partWeightKg"
    ];

    // ── Helper: human-readable field label ──────────────────────────────────
    const toLabel = (key) =>
      key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (c) => c.toUpperCase())
        .trim();

    // ── Normal top-level field updates ──────────────────────────────────────
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== undefined && allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });

    // ── Specification logic ──────────────────────────────────────────────────
    if (updateData.specification) {
      const oldSpec = existing.specification ?? {};
      const newSpec = { ...oldSpec, ...updateData.specification };

      // Collect changed fields and build change-log remarks
      const changed = [];
      const changeRemarks = [];

      Object.keys(updateData.specification).forEach((k) => {
        const oldVal = String(oldSpec[k] ?? '').trim();
        const newVal = String(updateData.specification[k] ?? '').trim();
        if (oldVal !== newVal) {
          changed.push(k);
          changeRemarks.push(
            `${toLabel(k)} changed from "${oldVal || 'N/A'}" to "${newVal || 'N/A'}"`
          );
        }
      });

      fields.push('specification = ?');
      values.push(JSON.stringify(newSpec));

      // ── Append change-log remarks to the JSON array ──────────────────────
      if (changeRemarks.length > 0) {
        // Build one remark entry per changed field using JSON_ARRAY_APPEND
        // chained via a subquery so all entries are appended in one statement.
        // We use a reduce approach: add each remark one field at a time.
        // Simpler: collect all into one combined remark string.
        const combinedRemark = changeRemarks.join('; ');

        fields.push(
          `remarks = JSON_ARRAY_APPEND(COALESCE(remarks, JSON_ARRAY()), '$', ?)`
        );
        values.push(combinedRemark);
      }

      // ── Track edited fields (only non-privileged users) ──────────────────
      if (
        !isPrivileged &&
        changed.length > 0 &&
        existing.quality_verified === 'approved'
      ) {
        const allEdited = [
          ...new Set([...(existing.edited_fields ?? []), ...changed]),
        ];
        fields.push('edited = 1', 'edited_fields = ?');
        values.push(JSON.stringify(allEdited));
      }

      // ── Pending logic (only non-privileged users) ────────────────────────
      if (!isPrivileged) {
        const shouldPending = changed.some((f) => pendingFields.includes(f));
        if (shouldPending) {
          fields.push("status = 'pending'");
          fields.push("quality_verified = 'pending'");
        }
      }
    }

    values.push(id);

    await execute(
      `UPDATE products SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return await findProductById(id);
  } catch (error) {
    console.error('Error in updateProduct:', error);
    throw error;
  }
};
// ─── APPROVAL ─────────────────────────────────────────────────────────────────

/**
 * Set approval status. Clears edit-tracking on re-approval.
 */
export const setApprovalStatus = async (id, status, modified_by = null, remarks = null) => {
  try {
    const valid = ["pending", "approved", "rejected"];

    if (!valid.includes(status)) {
      throw new Error(`Invalid approval status: ${status}`);
    }

    if (status === "rejected") {
      await execute(
        `UPDATE products
         SET approved = ?,
             status = ?,
             remarks = JSON_ARRAY_APPEND(
               COALESCE(remarks, JSON_ARRAY()),
               '$',
               ?
             ),
             modified_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [status, status, remarks || "Rejected", modified_by, id]
      );
    } else {
      await execute(
        `UPDATE products
         SET approved = ?,
             remarks = JSON_ARRAY_APPEND(
               COALESCE(remarks, JSON_ARRAY()),
               '$',
               ?
             ),
             modified_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [status, remarks || "Approval status updated", modified_by, id]
      );
    }

    return await findProductById(id);

  } catch (error) {
    console.error("Error in setApprovalStatus:", error);
    throw error;
  }
};


// ─── QUALITY VERIFICATION ─────────────────────────────────────────────────────

export const setQualityStatus = async (id, status, modified_by = null, remarks = null) => {
  try {
    const valid = ["pending", "approved", "rejected"];

    if (!valid.includes(status)) {
      throw new Error(`Invalid quality_verified status: ${status}`);
    }

    if (status === "rejected") {
      await execute(
        `UPDATE products
         SET quality_verified = ?,
             status = ?,
             remarks = JSON_ARRAY_APPEND(
               COALESCE(remarks, JSON_ARRAY()),
               '$',
               ?
             ),
             modified_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [status, status, remarks || "Rejected by quality", modified_by, id]
      );
    } else {
      await execute(
        `UPDATE products
         SET quality_verified = ?,
             remarks = JSON_ARRAY_APPEND(
               COALESCE(remarks, JSON_ARRAY()),
               '$',
               ?
             ),
             modified_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [status, remarks || "Quality status updated", modified_by, id]
      );
    }

    // ✅ clear edited fields if approved
    if (status === "approved") {
      const product = await findProductById(id);

      if (product.edited_fields && product.edited_fields.length > 0) {
        await execute(
          `UPDATE products
           SET edited_fields = ?, edited = 0
           WHERE id = ?`,
          [JSON.stringify([]), id]
        );
      }
    }

    return await findProductById(id);

  } catch (error) {
    console.error("Error in setQualityStatus:", error);
    throw error;
  }
};


// ─── INACTIVE ────────────────────────────────────────────────────────────────

export const setInactiveProduct = async (id, modified_by = null, remarks = null) => {
  try {
    await execute(
      `UPDATE products
       SET status = ?,
           remarks = JSON_ARRAY_APPEND(
             COALESCE(remarks, JSON_ARRAY()),
             '$',
             ?
           ),
           modified_by = ?,
           updated_at = NOW()
       WHERE id = ?`,
      ["inactive", remarks || "Marked inactive", modified_by, id]
    );

    return await findProductById(id);

  } catch (error) {
    console.error("Error in setInactiveProduct:", error);
    throw error;
  }
};

// ─── BULK IMPORT ──────────────────────────────────────────────────────────────

/**
 * Insert many products in one transaction. Skips existing part_numbers.
 * @returns {{ inserted: number, skipped: number }}
 */
export const bulkImportProducts = async (rows, created_by = null) => {
  const conn = await getConnection();
  let inserted = 0;
  let skipped  = 0;

  try {
    await conn.beginTransaction();

    for (const row of rows) {

      await conn.execute(
        `INSERT INTO products
          (part_number, customer, status, approved, quality_verified,
           edited, edited_fields, specification, created_by, modified_by)
         VALUES (?, ?, ?, 'pending', 'pending', 0, '[]', ?, ?, ?)`,
        [
          row.part_number,
          row.customer ?? '',
          row.status   ?? 'draft',
          JSON.stringify(row.specification ?? {}),
          created_by,
          created_by,
        ]
      );
      inserted++;
    }

    await conn.commit();
    return { inserted, skipped };
  } catch (error) {
    await conn.rollback();
    console.error('Error in bulkImportProducts:', error);
    throw error;
  } finally {
    conn.release();
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────

export const deleteProduct = async (id) => {
  try {
    await execute('DELETE FROM products WHERE id = ?', [id]);
    return true;
  } catch (error) {
    console.error('Error in deleteProduct:', error);
    throw error;
  }
};

// ─── STATS ────────────────────────────────────────────────────────────────────

export const getProductCounts = async () => {
  try {
    const rows = await query(`
      SELECT
        COUNT(*)                                                     AS total,
        SUM(approved = 'approved')                                   AS approved,
        SUM(approved = 'pending')                                    AS approval_pending,
        SUM(approved = 'rejected')                                   AS approval_rejected,
        SUM(quality_verified = 'approved')                           AS qv_approved,
        SUM(quality_verified = 'pending')                            AS qv_pending,
        SUM(quality_verified = 'rejected')                           AS qv_rejected,
        Sum(status = 'active')                                           AS active,
        Sum(status = 'pending')                                          AS pending,
        Sum(status = 'rejected')                                          AS rejected,
        SUM(status = 'inactive')                                     AS inactive,
        SUM(edited = 1)                                              AS edited
      FROM products
    `);
    return rows[0];
  } catch (error) {
    console.error('Error in getProductCounts:', error);
    throw error;
  }
};



// ─── DOCUMENTS (categorized: individual / ppap) ──────────────────────────────

const VALID_CATEGORIES = ["individual", "ppap"];

/**
 * Parse the ppap_documents column into `{ individual: {}, ppap: {} }`.
 * Handles backward-compat: if existing data is a flat object (old format),
 * it gets migrated into the `individual` bucket.
 */
const parseCategorizedDocs = (raw) => {
  let parsed = {};

  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw || "{}"); } catch { parsed = {}; }
  } else {
    parsed = raw || {};
  }

  // Already in new format?
  if (parsed.individual || parsed.ppap) {
    return {
      individual: parsed.individual || {},
      ppap: parsed.ppap || {},
    };
  }

  // Old flat format → migrate everything into `individual`
  return { individual: parsed, ppap: {} };
};

// ADD
export const addDocumentModel = async (
  id,
  category,
  name,
  filePath,
  modified_by
) => {
  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${category}. Must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }
  if (!name) throw new Error("Document name is required");

  const product = await findProductById(id);
  if (!product) throw new Error("Product not found");

  const docs = parseCategorizedDocs(product.ppap_documents);
  docs[category][name] = filePath;

  await execute(
    `UPDATE products
     SET ppap_documents = ?,
         modified_by    = ?,
         updated_at     = NOW()
     WHERE id = ?`,
    [JSON.stringify(docs), modified_by, id]
  );

  return findProductById(id);
};

// DELETE
export const deleteDocumentModel = async (
  id,
  category,
  name,
  modified_by
) => {
  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${category}. Must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }

  const product = await findProductById(id);
  if (!product) throw new Error("Product not found");

  const docs = parseCategorizedDocs(product.ppap_documents);

  if (!docs[category] || !docs[category][name]) {
    throw new Error(`Document "${name}" not found in category "${category}"`);
  }

  const diskPath = docs[category][name];

  // delete file from disk
  try {
    fs.unlinkSync(diskPath);
  } catch (err) {
    console.log("File delete error:", err.message);
  }

  delete docs[category][name];

  await execute(
    `UPDATE products
     SET ppap_documents = ?,
         modified_by    = ?,
         updated_at     = NOW()
     WHERE id = ?`,
    [JSON.stringify(docs), modified_by, id]
  );

  return findProductById(id);
};


// MARK NOT REQUIRED
export const markDocumentNotRequiredModel = async (
  id,
  category,
  name,
  modified_by
) => {
  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${category}. Must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }
  if (!name) throw new Error("Document name is required");

  const product = await findProductById(id);
  if (!product) throw new Error("Product not found");

  const docs = parseCategorizedDocs(product.ppap_documents);

  // If a real file exists for this doc, delete it from disk first
  const existing = docs[category]?.[name];
  if (existing && existing !== "not_required") {
    try {
      fs.unlinkSync(existing);
    } catch (err) {
      console.log("File delete error:", err.message);
    }
  }

  docs[category][name] = "not_required";

  await execute(
    `UPDATE products
     SET ppap_documents = ?,
         modified_by    = ?,
         updated_at     = NOW()
     WHERE id = ?`,
    [JSON.stringify(docs), modified_by, id]
  );

  return findProductById(id);
};

export const getDropdownOptions = async () => {
  try {

    const rows = await query(`
      SELECT
        GROUP_CONCAT(DISTINCT customer) AS customers,

        GROUP_CONCAT(
          DISTINCT JSON_UNQUOTE(JSON_EXTRACT(specification, '$.partType'))
        ) AS productTypes,

        GROUP_CONCAT(
          DISTINCT JSON_UNQUOTE(JSON_EXTRACT(specification, '$.tubeDiameter'))
        ) AS tubeDia,

        GROUP_CONCAT(
          DISTINCT JSON_UNQUOTE(JSON_EXTRACT(specification, '$.couplingFlangeOrientations'))
        ) AS cFlangeOrientation,

        GROUP_CONCAT(
          DISTINCT JSON_UNQUOTE(JSON_EXTRACT(specification, '$.mountingDetailsCouplingFlange'))
        ) AS couplingFlange,

        GROUP_CONCAT(
          DISTINCT JSON_UNQUOTE(JSON_EXTRACT(specification, '$.series'))
        ) AS jointType,

        GROUP_CONCAT(
          DISTINCT JSON_UNQUOTE(JSON_EXTRACT(specification, '$.mountingDetailsFlangeYoke'))
        ) AS flangeYoke

      FROM products
      WHERE specification IS NOT NULL
    `);


    const r = rows[0] || {};


    const split = (str) => {
      if (!str) return [];
      return str.split(",").map(s => s.trim()).filter(Boolean);
    };

    const result = {
      CUSTOMER_OPTIONS: split(r.customers),
      PRODUCT_TYPE_OPTIONS: split(r.productTypes),
      TUBE_DIA_OPTIONS: split(r.tubeDia),
      C_FLANGE_ORIENTATION_OPTIONS: split(r.cFlangeOrientation),
      COUPLING_FLANGE_OPTIONS: split(r.couplingFlange),
      JOINT_TYPE_OPTIONS: split(r.jointType),
      FLANGE_YOKE_OPTIONS: split(r.flangeYoke),
    };


    return result;

  } catch (error) {
    console.error("getDropdownOptions ERROR:", error);
    throw error;
  }
};