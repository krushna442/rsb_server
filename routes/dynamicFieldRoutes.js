import express from 'express';
import {
  getDynamicFields,
  putDynamicFields,
  postImportantFields,
  deleteImportantFieldsHandler,
  postDocuments,
  deleteDocumentsHandler,
} from '../controllers/dynamicFieldController.js';

const router = express.Router();

// ── config (existing) ───────────────────────────────────────────────────────
router.get('/',  getDynamicFields);
router.put('/',  putDynamicFields);

// ── important_fields ────────────────────────────────────────────────────────
router.post('/',    postImportantFields);          // add
router.delete('/important-fields', deleteImportantFieldsHandler); // remove

// ── documents ───────────────────────────────────────────────────────────────
router.post('/documents',   postDocuments);        // add
router.delete('/documents', deleteDocumentsHandler); // remove

export default router;