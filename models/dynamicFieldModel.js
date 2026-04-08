import { query, queryOne, execute } from '../db/db.js';

const parseJSON = (data, fallback = '[]') => {
  if (typeof data === 'string') {
    try { return JSON.parse(data); }
    catch { return JSON.parse(fallback); }
  }
  return data ?? JSON.parse(fallback);
};

// ─── helpers ────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = ['individual', 'ppap'];

const validateCategory = (category) => {
  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category "${category}". Must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }
};

// ─── getConfig ───────────────────────────────────────────────────────────────

export const getConfig = async () => {
  try {
    const row = await queryOne('SELECT * FROM dynamic_fields LIMIT 1');
    if (!row) throw new Error('dynamic_fields config row missing — run bootstrap.');
    return {
      id:                           row.id,
      product_fields:               parseJSON(row.product_fields, '[]'),
      approval_fields:              parseJSON(row.approval_fields, '[]'),
      quality_verification_fields:  parseJSON(row.quality_verification_fields, '[]'),
      important_fields:             parseJSON(row.important_fields, '[]'),
      documents:                    parseJSON(row.documents, '[]'),
      updated_at:                   row.updated_at,
    };
  } catch (error) {
    console.error('Error in getConfig:', error);
    throw error;
  }
};

// ─── updateConfig (existing — product/approval/quality) ──────────────────────

export const updateConfig = async (patch) => {
  try {
    const current = await getConfig();

    let newProductFields             = [...current.product_fields];
    let newApprovalFields            = [...current.approval_fields];
    let newQualityVerificationFields = [...current.quality_verification_fields];

    // USE CASE 1: product_fields
    if (patch.product_fields !== undefined) {
      if (!Array.isArray(patch.product_fields))
        throw new Error('product_fields must be an array of { name, type } objects');

      for (const fieldObj of patch.product_fields) {
        if (!fieldObj.name) throw new Error('Each field in product_fields must have a name');
        const alreadyExists = newProductFields.some(f => f.name === fieldObj.name);
        if (!alreadyExists) newProductFields.push({ name: fieldObj.name, type: fieldObj.type ?? 'text' });
      }
    }

    // USE CASE 2: approval_fields
    if (patch.approval_fields !== undefined) {
      if (!Array.isArray(patch.approval_fields))
        throw new Error('approval_fields must be an array of field name strings');

      const productFieldNames = newProductFields.map(f => f.name);
      for (const name of patch.approval_fields) {
        if (!productFieldNames.includes(name))
          throw new Error(`Field "${name}" is not in product_fields. Add it to product_fields first.`);
      }
      const addedToApproval = patch.approval_fields.filter(n => !current.approval_fields.includes(n));
      newQualityVerificationFields = newQualityVerificationFields.filter(n => !addedToApproval.includes(n));
      newApprovalFields = patch.approval_fields;
    }

    // USE CASE 3: quality_verification_fields
    if (patch.quality_verification_fields !== undefined) {
      if (!Array.isArray(patch.quality_verification_fields))
        throw new Error('quality_verification_fields must be an array of field name strings');

      const productFieldNames = newProductFields.map(f => f.name);
      for (const name of patch.quality_verification_fields) {
        if (!productFieldNames.includes(name))
          throw new Error(`Field "${name}" is not in product_fields. Add it to product_fields first.`);
      }
      const addedToQuality = patch.quality_verification_fields.filter(n => !current.quality_verification_fields.includes(n));
      newApprovalFields = newApprovalFields.filter(n => !addedToQuality.includes(n));
      newQualityVerificationFields = patch.quality_verification_fields;
    }

    if (
      patch.product_fields === undefined &&
      patch.approval_fields === undefined &&
      patch.quality_verification_fields === undefined
    ) {
      throw new Error('Nothing to update. Send at least one of: product_fields, approval_fields, quality_verification_fields');
    }

    await execute(
      `UPDATE dynamic_fields
       SET product_fields = ?, approval_fields = ?, quality_verification_fields = ?
       WHERE id = 1`,
      [
        JSON.stringify(newProductFields),
        JSON.stringify(newApprovalFields),
        JSON.stringify(newQualityVerificationFields),
      ]
    );

    return getConfig();
  } catch (error) {
    console.error('Error in updateConfig:', error);
    throw error;
  }
};

// ─── important_fields ────────────────────────────────────────────────────────

/**
 * Add field names to important_fields.
 * Only accepts names that already exist in product_fields.
 * Silently skips duplicates.
 * @param {string[]} names
 */
export const addImportantFields = async (names) => {
  try {
    if (!Array.isArray(names) || names.length === 0)
      throw new Error('names must be a non-empty array of field name strings');

    const current = await getConfig();
    const productFieldNames = current.product_fields.map(f => f.name);

    for (const name of names) {
      if (!productFieldNames.includes(name))
        throw new Error(`Field "${name}" is not in product_fields. Add it to product_fields first.`);
    }

    const updated = [...current.important_fields];
    for (const name of names) {
      if (!updated.includes(name)) updated.push(name);
    }

    await execute(
      'UPDATE dynamic_fields SET important_fields = ? WHERE id = 1',
      [JSON.stringify(updated)]
    );

    return getConfig();
  } catch (error) {
    console.error('Error in addImportantFields:', error);
    throw error;
  }
};

/**
 * Remove field names from important_fields.
 * Silently ignores names that are not present.
 * @param {string[]} names
 */
export const deleteImportantFields = async (names) => {
  try {
    if (!Array.isArray(names) || names.length === 0)
      throw new Error('names must be a non-empty array of field name strings');

    const current = await getConfig();
    const updated = current.important_fields.filter(n => !names.includes(n));

    await execute(
      'UPDATE dynamic_fields SET important_fields = ? WHERE id = 1',
      [JSON.stringify(updated)]
    );

    return getConfig();
  } catch (error) {
    console.error('Error in deleteImportantFields:', error);
    throw error;
  }
};

// ─── documents ───────────────────────────────────────────────────────────────

/**
 * Add documents. Each entry must have { name, category }.
 * category must be 'individual' or 'ppap'.
 * Duplicate (name + category) pairs are silently skipped.
 * @param {{ name: string, category: string }[]} docs
 */
export const addDocuments = async (docs) => {
  try {
    if (!Array.isArray(docs) || docs.length === 0)
      throw new Error('docs must be a non-empty array of { name, category } objects');

    for (const doc of docs) {
      if (!doc.name) throw new Error('Each document must have a name');
      validateCategory(doc.category);
    }

    const current = await getConfig();
    const updated = [...current.documents];

    for (const doc of docs) {
      const exists = updated.some(d => d.name === doc.name && d.category === doc.category);
      if (!exists) updated.push({ name: doc.name, category: doc.category });
    }

    await execute(
      'UPDATE dynamic_fields SET documents = ? WHERE id = 1',
      [JSON.stringify(updated)]
    );

    return getConfig();
  } catch (error) {
    console.error('Error in addDocuments:', error);
    throw error;
  }
};

/**
 * Delete documents by name + category pair(s).
 * Silently ignores pairs that don't exist.
 * @param {{ name: string, category: string }[]} docs
 */
export const deleteDocuments = async (docs) => {
  try {
    if (!Array.isArray(docs) || docs.length === 0)
      throw new Error('docs must be a non-empty array of { name, category } objects');

    for (const doc of docs) {
      if (!doc.name) throw new Error('Each document must have a name');
      validateCategory(doc.category);
    }

    const current = await getConfig();
    const updated = current.documents.filter(
      d => !docs.some(del => del.name === d.name && del.category === d.category)
    );

    await execute(
      'UPDATE dynamic_fields SET documents = ? WHERE id = 1',
      [JSON.stringify(updated)]
    );

    return getConfig();
  } catch (error) {
    console.error('Error in deleteDocuments:', error);
    throw error;
  }
};

// ─── convenience ─────────────────────────────────────────────────────────────

export const getFieldNamesForStage = async (stage) => {
  try {
    const config = await getConfig();
    return stage === 'approval'
      ? config.approval_fields
      : config.quality_verification_fields;
  } catch (error) {
    console.error('Error in getFieldNamesForStage:', error);
    throw error;
  }
};