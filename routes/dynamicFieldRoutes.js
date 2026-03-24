// routes/dynamicFieldRoutes.js
import express from 'express';
import { getDynamicFields, putDynamicFields } from '../controllers/dynamicFieldController.js';

const router = express.Router();

router.get('/',  getDynamicFields);
router.put('/',  putDynamicFields);

export default router;