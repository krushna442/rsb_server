import express from 'express';
import {
  getDynamicFields,
  putDynamicFields,
  postImportantFields,
  deleteImportantFieldsHandler,
  postDocuments,
  deleteDocumentsHandler,
  postCustomerNames,
  deleteCustomerNamesHandler,
  postStandardNames,
  deleteStandardNamesHandler,
  postControlPlanNames,
  deleteControlPlanNamesHandler,
  postBearingJTTypes,
  deleteBearingJTTypesHandler,
} from '../controllers/dynamicFieldController.js';

const router = express.Router();

// ── config (existing) ───────────────────────────────────────────────────────
router.get('/',  getDynamicFields);
router.put('/',  putDynamicFields);

// ── important_fields ────────────────────────────────────────────────────────
router.post('/important-fields',    postImportantFields);          // add
router.delete('/important-fields', deleteImportantFieldsHandler); // remove

// ── documents ───────────────────────────────────────────────────────────────
router.post('/documents',   postDocuments);        // add
router.delete('/documents', deleteDocumentsHandler); // remove

// ── customer_names ──────────────────────────────────────────────────────────
router.post('/customer-names',   postCustomerNames);        // add
router.delete('/customer-names', deleteCustomerNamesHandler); // remove

// ── standard_names ──────────────────────────────────────────────────────────
router.post('/standard-names',   postStandardNames);        // add
router.delete('/standard-names', deleteStandardNamesHandler); // remove

// ── control_plan_names ──────────────────────────────────────────────────────
router.post('/control-plan-names',   postControlPlanNames);        // add
router.delete('/control-plan-names', deleteControlPlanNamesHandler); // remove

// ── bearing_JT_types ────────────────────────────────────────────────────────
router.post('/bearing-jt-types',   postBearingJTTypes);        // add
router.delete('/bearing-jt-types', deleteBearingJTTypesHandler); // remove

export default router;