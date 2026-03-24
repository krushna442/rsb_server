import { query, queryOne, execute, getConnection } from '../db/db.js';
import fs from "fs";
// ─── helpers ──────────────────────────────────────────────────────────────────

const parseJsonCols = (row) => {
  if (!row) return null;
  return {
    ...row,
    specification: JSON.parse(row.specification  ?? '{}'),
    edited_fields: JSON.parse(row.edited_fields   ?? '[]'),
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
export const updateProduct = async (id, updateData, modified_by = null) => {
  try {
    const existing = await findProductById(id);
    if (!existing) throw new Error(`Product ${id} not found`);

    const fields  = ['updated_at = NOW()', 'modified_by = ?'];
    const values  = [modified_by];

    const allowedFields = ['part_number', 'customer', 'status'];

    // fields which should trigger pending status if edited
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

    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== undefined && allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });

    // Merge + diff specification
    if (updateData.specification) {
      const oldSpec  = existing.specification ?? {};
      const newSpec  = { ...oldSpec, ...updateData.specification };

      const changed  = Object.keys(updateData.specification).filter(
        (k) => String(oldSpec[k] ?? '') !== String(updateData.specification[k] ?? '')
      );

      fields.push('specification = ?');
      values.push(JSON.stringify(newSpec));

      // Track edited fields if product was already approved
      if (changed.length && existing.quality_verified === 'approved') {
        const allEdited = [
          ...new Set([...(existing.edited_fields ?? []), ...changed]),
        ];

        fields.push('edited = 1', 'edited_fields = ?');
        values.push(JSON.stringify(allEdited));
      }

      // ✅ NEW RULE — if any pendingFields edited → set status pending
      const shouldPending = changed.some(f => pendingFields.includes(f));

      if (shouldPending) {
        fields.push("status = 'pending'");
        fields.push("quality_verified = 'pending'");
      }
    }

    values.push(id);

    await execute(
      `UPDATE products SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return findProductById(id);
  } catch (error) {
    console.error('Error in updateProduct:', error);
    throw error;
  }
};

// ─── APPROVAL ─────────────────────────────────────────────────────────────────

/**
 * Set approval status. Clears edit-tracking on re-approval.
 */
export const setApprovalStatus = async (id, status, modified_by = null) => {
  try {
    const valid = ["pending", "approved", "rejected"];

    if (!valid.includes(status)) {
      throw new Error(`Invalid approval status: ${status}`);
    }

    // ✅ if rejected → update all status columns
    if (status === "rejected") {
      await execute(
        `UPDATE products
         SET approved = ?,
             status = ?,
             modified_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [status, status, modified_by, id]
      );
    } else {
      // pending
      await execute(
        `UPDATE products
         SET approved = ?,
             modified_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [status, modified_by, id]
      );
    }

    return await findProductById(id);

  } catch (error) {
    console.error("Error in setApprovalStatus:", error);
    throw error;
  }
};

// ─── QUALITY VERIFICATION ─────────────────────────────────────────────────────

/**
 * Set quality_verified status
 */
export const setQualityStatus = async (id, status, modified_by = null) => {
  try {
    const valid = ["pending", "approved", "rejected"];

    if (!valid.includes(status)) {
      throw new Error(`Invalid quality_verified status: ${status}`);
    }

    // ✅ if rejected → update all status fields
    if (status === "rejected") {
      await execute(
        `UPDATE products
         SET quality_verified = ?, 
             status = ?, 
             modified_by = ?, 
             updated_at = NOW()
         WHERE id = ?`,
        [status, status, modified_by, id]
      );
    } else {
      await execute(
        `UPDATE products
         SET quality_verified = ?, 
             modified_by = ?, 
             updated_at = NOW()
         WHERE id = ?`,
        [status, modified_by, id]
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
        SUM(edited = 1)                                              AS edited
      FROM products
    `);
    return rows[0];
  } catch (error) {
    console.error('Error in getProductCounts:', error);
    throw error;
  }
};



// ─── PPAP DOCUMENTS ───────────────────────────────────────────────────────────



// ADD
export const addPpapDocModel = async (
  id,
  name,
  filePath,
  modified_by
) => {
  const product = await findProductById(id);

  if (!product) throw new Error("Product not found");

const docs =
  typeof product.ppap_documents === "string"
    ? JSON.parse(product.ppap_documents || "{}")
    : product.ppap_documents || {};
  docs[name] = filePath;

  await execute(
    `
    UPDATE products
    SET ppap_documents = ?,
        modified_by = ?,
        updated_at = NOW()
    WHERE id = ?
  `,
    [JSON.stringify(docs), modified_by, id]
  );

  return findProductById(id);
};



// DELETE
export const deletePpapDocModel = async (
  id,
  name,
  modified_by
) => {

  const product = await findProductById(id);

  if (!product) throw new Error("Product not found");


  const docs =
    typeof product.ppap_documents === "string"
      ? JSON.parse(product.ppap_documents || "{}")
      : product.ppap_documents || {};


  if (!docs[name]) {
    throw new Error("Document not found");
  }


  const filePath = docs[name];   // ✅ THIS WAS MISSING


  // delete file from disk
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    console.log("File delete error:", err.message);
  }


  delete docs[name];


  await execute(
    `
    UPDATE products
    SET ppap_documents = ?,
        modified_by = ?,
        updated_at = NOW()
    WHERE id = ?
    `,
    [JSON.stringify(docs), modified_by, id]
  );


  return findProductById(id);
};


export const getDropdownOptions = async () => {
  try {

    const rows = await query(`
      SELECT customer, specification
      FROM products
      WHERE specification IS NOT NULL
    `);

    const customers = new Set();
    const productTypes = new Set();
    const tubeDia = new Set();
    const cFlangeOrientation = new Set();
    const couplingFlange = new Set();
    const jointType = new Set();
    const flangeYoke = new Set();


    for (const row of rows) {

      if (row.customer) {
        customers.add(row.customer);
      }

      if (!row.specification) continue;

      let spec;

      try {
        spec = JSON.parse(row.specification);
      } catch {
        continue;
      }

      if (spec.partType)
        productTypes.add(spec.partType);

      if (spec.tubeDiameter)
        tubeDia.add(spec.tubeDiameter);

      if (spec.couplingFlangeOrientations)
        cFlangeOrientation.add(
          spec.couplingFlangeOrientations
        );

      if (spec.mountingDetailsCouplingFlange)
        couplingFlange.add(
          spec.mountingDetailsCouplingFlange
        );

      if (spec.series)
        jointType.add(spec.series);

      if (spec.mountingDetailsFlangeYoke)
        flangeYoke.add(
          spec.mountingDetailsFlangeYoke
        );
    }


    return {
      CUSTOMER_OPTIONS: [...customers],
      PRODUCT_TYPE_OPTIONS: [...productTypes],
      TUBE_DIA_OPTIONS: [...tubeDia],
      C_FLANGE_ORIENTATION_OPTIONS: [...cFlangeOrientation],
      COUPLING_FLANGE_OPTIONS: [...couplingFlange],
      JOINT_TYPE_OPTIONS: [...jointType],
      FLANGE_YOKE_OPTIONS: [...flangeYoke],
    };

  } catch (error) {
    console.error("getDropdownOptions ERROR:", error);
    throw error;
  }
};