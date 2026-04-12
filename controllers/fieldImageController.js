import {
  findAllFieldImages,
  findFieldImagesByField,
  findFieldImageById,
  upsertFieldImage,
  deleteFieldImage,
  VALID_FIELD_NAMES,
} from '../models/fieldImageModel.js';
import { getDropdownOptions } from '../models/productModel.js';

// ---------------------------------------------------------------------------
// Map each valid field_name to its dropdown option key in getDropdownOptions()
// ---------------------------------------------------------------------------
const FIELD_TO_DROPDOWN_KEY = {
  mountingDetailsFlangeYoke:       'FLANGE_YOKE_OPTIONS',
  mountingDetailsCouplingFlange:   'COUPLING_FLANGE_OPTIONS',
  availableNoiseDeadener:          null, // fixed: Yes / No
  couplingFlangeOrientations:      'C_FLANGE_ORIENTATION_OPTIONS',
};

// Fixed options for fields not covered by getDropdownOptions()
const FIXED_OPTIONS = {
  availableNoiseDeadener: ['Yes', 'No'],
};

// ─── GET all valid field names + their available options ───────────────────────
/**
 * GET /api/field-images/fields
 * Returns the 4 supported field definitions along with their dropdown options.
 */
export const listFields = async (req, res) => {
  try {
    const dropdownData = await getDropdownOptions();

    const fields = VALID_FIELD_NAMES.map((fieldName) => {
      const dropdownKey = FIELD_TO_DROPDOWN_KEY[fieldName];
      const options = dropdownKey
        ? (dropdownData[dropdownKey] ?? [])
        : (FIXED_OPTIONS[fieldName] ?? []);

      return { field_name: fieldName, options };
    });

    res.json({ success: true, data: fields });
  } catch (error) {
    console.error('listFields error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET all field image records (optionally filtered by field_name) ──────────
/**
 * GET /api/field-images
 * GET /api/field-images?field_name=mountingDetailsFlangeYoke
 */
export const listFieldImages = async (req, res) => {
  try {
    const { field_name } = req.query;
    const data = await findAllFieldImages(field_name || null);
    res.json({ success: true, data });
  } catch (error) {
    console.error('listFieldImages error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET all records for a specific field ─────────────────────────────────────
/**
 * GET /api/field-images/by-field/:fieldName
 * Returns all option→file_path mappings for a given field.
 */
export const getByField = async (req, res) => {
  try {
    const fieldName = decodeURIComponent(req.params.fieldName);

    if (!VALID_FIELD_NAMES.includes(fieldName)) {
      return res.status(400).json({
        success: false,
        message: `Invalid field_name. Must be one of: ${VALID_FIELD_NAMES.join(', ')}`,
      });
    }

    const data = await findFieldImagesByField(fieldName);
    res.json({ success: true, data });
  } catch (error) {
    console.error('getByField error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET single record by id ──────────────────────────────────────────────────
/**
 * GET /api/field-images/:id
 */
export const getFieldImage = async (req, res) => {
  try {
    const data = await findFieldImageById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
    res.json({ success: true, data });
  } catch (error) {
    console.error('getFieldImage error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── UPLOAD / UPSERT (POST) ───────────────────────────────────────────────────
/**
 * POST /api/field-images
 * Body (multipart/form-data):
 *   - field_name   : string  e.g. "mountingDetailsFlangeYoke"
 *   - option_value : string  e.g. "F/Y 150 DIA 4 HOLES"
 *   - file         : file    (image or PDF)
 *
 * If a record for the same (field_name, option_value) already exists,
 * it is replaced (old file deleted from disk).
 */
export const uploadFieldImageHandler = async (req, res) => {
  try {
    const field_name   = (req.body.field_name   || '').trim();
    const option_value = (req.body.option_value || '').trim();

    if (!field_name) {
      return res.status(400).json({ success: false, message: 'field_name is required' });
    }
    if (!option_value) {
      return res.status(400).json({ success: false, message: 'option_value is required' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'A file must be attached (field name: file)' });
    }

    const filePath = req.file.path.replace(/\\/g, '/');

    const data = await upsertFieldImage(
      field_name,
      option_value,
      filePath,
      req.user?.name ?? null
    );

    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('uploadFieldImageHandler error:', error);
    const status = error.message.startsWith('Invalid field_name') ? 400 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
/**
 * DELETE /api/field-images/:id
 */
export const removeFieldImage = async (req, res) => {
  try {
    await deleteFieldImage(req.params.id);
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('removeFieldImage error:', error);
    const status = error.message === 'Record not found' ? 404 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};
