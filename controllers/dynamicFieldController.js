import {
  getConfig,
  updateConfig,
  addImportantFields,
  deleteImportantFields,
  addDocuments,
  deleteDocuments,
} from '../models/dynamicFieldModel.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const isValidationError = (msg) =>
  ['not in product_fields', 'Nothing to update', 'must be', 'field_category',
   'Invalid category', 'non-empty array', 'must have a name']
    .some(s => msg.includes(s));

const handleError = (res, error) => {
  console.error(error);
  res.status(isValidationError(error.message) ? 400 : 500)
     .json({ success: false, message: error.message });
};

// ─── existing handlers ───────────────────────────────────────────────────────

export const getDynamicFields = async (req, res) => {
  try {
    res.json({ success: true, data: await getConfig() });
  } catch (error) {
    handleError(res, error);
  }
};

export const putDynamicFields = async (req, res) => {
  try {
    res.json({ success: true, data: await updateConfig(req.body) });
  } catch (error) {
    handleError(res, error);
  }
};

// ─── important_fields handlers ───────────────────────────────────────────────

/**
 * POST /dynamic-fields/important-fields
 * Body: { names: ["fieldName", ...] }
 */
export const postImportantFields = async (req, res) => {
  try {
    const { names } = req.body;
    if (!names) return res.status(400).json({ success: false, message: 'names array is required' });
    res.json({ success: true, data: await addImportantFields(names) });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * DELETE /dynamic-fields/important-fields
 * Body: { names: ["fieldName", ...] }
 */
export const deleteImportantFieldsHandler = async (req, res) => {
  try {
    const { names } = req.body;
    if (!names) return res.status(400).json({ success: false, message: 'names array is required' });
    res.json({ success: true, data: await deleteImportantFields(names) });
  } catch (error) {
    handleError(res, error);
  }
};

// ─── documents handlers ──────────────────────────────────────────────────────

/**
 * POST /dynamic-fields/documents
 * Body: { docs: [{ name, category }, ...] }
 */
export const postDocuments = async (req, res) => {
  try {
    const { docs } = req.body;
    if (!docs) return res.status(400).json({ success: false, message: 'docs array is required' });
    res.json({ success: true, data: await addDocuments(docs) });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * DELETE /dynamic-fields/documents
 * Body: { docs: [{ name, category }, ...] }
 */
export const deleteDocumentsHandler = async (req, res) => {
  try {
    const { docs } = req.body;
    if (!docs) return res.status(400).json({ success: false, message: 'docs array is required' });
    res.json({ success: true, data: await deleteDocuments(docs) });
  } catch (error) {
    handleError(res, error);
  }
};