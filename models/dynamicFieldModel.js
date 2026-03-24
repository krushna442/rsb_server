import { query, queryOne, execute } from '../db/db.js';

// ─── always row id=1 (single config row) ─────────────────────────────────────

/**
 * Get the active dynamic fields config
 */
export const getConfig = async () => {
  try {
    const row = await queryOne('SELECT * FROM dynamic_fields LIMIT 1');
    if (!row) throw new Error('dynamic_fields config row missing — run bootstrap.');
    return {
      id:                           row.id,
      product_fields:               JSON.parse(row.product_fields               ?? '[]'),
      approval_fields:              JSON.parse(row.approval_fields              ?? '[]'),
      quality_verification_fields:  JSON.parse(row.quality_verification_fields  ?? '[]'),
      updated_at:                   row.updated_at,
    };
  } catch (error) {
    console.error('Error in getConfig:', error);
    throw error;
  }
};

/**
 * Update any subset of the three JSON columns
 * @param {Object} patch - { product_fields?, approval_fields?, quality_verification_fields? }
 */
export const updateConfig = async (patch) => {
  try {
    // Load current config first — we need it for all the logic below
    const current = await getConfig();
 
    let newProductFields             = [...current.product_fields];
    let newApprovalFields            = [...current.approval_fields];
    let newQualityVerificationFields = [...current.quality_verification_fields];
 
    // ── USE CASE 1: Adding new field(s) to product_fields ────────────────────
    if (patch.product_fields !== undefined) {
      const incomingFields = patch.product_fields; // array of { name, type }
 
      if (!Array.isArray(incomingFields)) {
        throw new Error('product_fields must be an array of { name, type } objects');
      }
 
      // field_category tells us which verification stage the new field belongs to
      const category = patch.field_category; // "approval_fields" | "quality_verification_fields" | undefined
 
      if (category !== undefined) {
        // Validate category value
        if (!['approval_fields', 'quality_verification_fields'].includes(category)) {
          throw new Error('field_category must be "approval_fields" or "quality_verification_fields"');
        }
 
        for (const fieldObj of incomingFields) {
          if (!fieldObj.name) throw new Error('Each field in product_fields must have a name');
 
          // Append to product_fields only if not already present
          const alreadyInProduct = newProductFields.some(f => f.name === fieldObj.name);
          if (!alreadyInProduct) {
            newProductFields.push({ name: fieldObj.name, type: fieldObj.type ?? 'text' });
          }
 
          // Add to the specified category (avoid duplicates)
          if (category === 'approval_fields') {
            if (!newApprovalFields.includes(fieldObj.name)) {
              newApprovalFields.push(fieldObj.name);
            }
            // Remove from the other category if it was there
            newQualityVerificationFields = newQualityVerificationFields.filter(
              f => f !== fieldObj.name
            );
          } else {
            if (!newQualityVerificationFields.includes(fieldObj.name)) {
              newQualityVerificationFields.push(fieldObj.name);
            }
            // Remove from the other category if it was there
            newApprovalFields = newApprovalFields.filter(f => f !== fieldObj.name);
          }
        }
      } else {
        // No field_category — just replace product_fields as-is (USE CASE 3)
        newProductFields = incomingFields;
      }
    }
 
    // ── USE CASE 2: Moving fields between approval ↔ quality_verification ────
    if (patch.approval_fields !== undefined) {
      if (!Array.isArray(patch.approval_fields)) {
        throw new Error('approval_fields must be an array of field name strings');
      }
 
      // Validate all names exist in product_fields
      const productFieldNames = newProductFields.map(f => f.name);
      for (const name of patch.approval_fields) {
        if (!productFieldNames.includes(name)) {
          throw new Error(
            `Field "${name}" is not in product_fields. Add it to product_fields first.`
          );
        }
      }
 
      // Find newly added fields (not in current approval_fields)
      const addedToApproval = patch.approval_fields.filter(
        name => !current.approval_fields.includes(name)
      );
 
      // Remove those from quality_verification_fields (mutual exclusion)
      newQualityVerificationFields = newQualityVerificationFields.filter(
        name => !addedToApproval.includes(name)
      );
 
      newApprovalFields = patch.approval_fields;
    }
 
    if (patch.quality_verification_fields !== undefined) {
      if (!Array.isArray(patch.quality_verification_fields)) {
        throw new Error('quality_verification_fields must be an array of field name strings');
      }
 
      // Validate all names exist in product_fields
      const productFieldNames = newProductFields.map(f => f.name);
      for (const name of patch.quality_verification_fields) {
        if (!productFieldNames.includes(name)) {
          throw new Error(
            `Field "${name}" is not in product_fields. Add it to product_fields first.`
          );
        }
      }
 
      // Find newly added fields (not in current quality_verification_fields)
      const addedToQuality = patch.quality_verification_fields.filter(
        name => !current.quality_verification_fields.includes(name)
      );
 
      // Remove those from approval_fields (mutual exclusion)
      newApprovalFields = newApprovalFields.filter(
        name => !addedToQuality.includes(name)
      );
 
      newQualityVerificationFields = patch.quality_verification_fields;
    }
 
    // ── Nothing changed at all ────────────────────────────────────────────────
    if (
      patch.product_fields === undefined &&
      patch.approval_fields === undefined &&
      patch.quality_verification_fields === undefined
    ) {
      throw new Error('Nothing to update. Send at least one of: product_fields, approval_fields, quality_verification_fields');
    }
 
    // ── Persist ───────────────────────────────────────────────────────────────
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
 

/**
 * Convenience: return only field names for a given stage
 * @param {'approval'|'quality_verification'} stage
 * @returns {Promise<string[]>}
 */
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