import { getConfig, updateConfig } from '../models/dynamicFieldModel.js';

export const getDynamicFields = async (req, res) => {
  try {
    const data = await getConfig();
    res.json({ success: true, data });
  } catch (error) {
    console.error('getDynamicFields error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const putDynamicFields = async (req, res) => {
  try {
    const data = await updateConfig(req.body);
    res.json({ success: true, data });
  } catch (error) {
    console.error('putDynamicFields error:', error);
    // 400 for validation errors, 500 for unexpected DB errors
    const status = error.message.includes('not in product_fields') ||
                   error.message.includes('Nothing to update') ||
                   error.message.includes('must be') ||
                   error.message.includes('field_category')
      ? 400
      : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};