import {
  findAllProducts,
  findProductById,
  findProductByPartNumber,
  createProduct,
  updateProduct,
  setApprovalStatus,
  setQualityStatus,
  bulkImportProducts,
  deleteProduct,
  getProductCounts,
    addPpapDocModel,
  deletePpapDocModel,
  getDropdownOptions,
} from '../models/productModel.js';

export const listProducts = async (req, res) => {
  try {
    const data = await findAllProducts(req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('listProducts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const productCounts = async (req, res) => {
  try {
    const data = await getProductCounts();
    res.json({ success: true, data });
  } catch (error) {
    console.error('productCounts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getProduct = async (req, res) => {
  try {
    const data = await findProductById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data });
  } catch (error) {
    console.error('getProduct error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getProductByPartNumber = async (req, res) => {
  try {
    const data = await findProductByPartNumber(req.params.partNumber);
    if (!data) return res.status(404).json({ success: false, message: 'Part number not found' });
    res.json({ success: true, data });
  } catch (error) {
    console.error('getProductByPartNumber error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addProduct = async (req, res) => {
  try {
    const data = await createProduct({ ...req.body, created_by: req.user?.username ?? null });
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('addProduct error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Part number already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const editProduct = async (req, res) => {
  try {
    const data = await updateProduct(req.params.id, req.body, req.user?.username ?? null);
    res.json({ success: true, data });
  } catch (error) {
    console.error('editProduct error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const approveProduct = async (req, res) => {
  try {
    const { status } = req.body;

    const data = await setApprovalStatus(
      req.params.id,
      status,
      req.user?.username ?? null
    );

    // ✅ NEW LOGIC
    if (
      status === "approved" &&
      data.quality_verified === "approved"
    ) {
      await updateProduct(req.params.id, {
        status: "active",
      });
      data.status = "active";
    }
    else if (status === "rejected") {
      await updateProduct(req.params.id, {
        status: "rejected",
      });
      data.status = "rejected";
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error("approveProduct error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const qualityVerifyProduct = async (req, res) => {
  try {
    const { status } = req.body;

    const data = await setQualityStatus(
      req.params.id,
      status,
      req.user?.username ?? null
    );

    // ✅ NEW LOGIC
    if (
      status === "approved" &&
      data.approved === "approved"
    ) {
      await updateProduct(req.params.id, {
        status: "active",
      });
      data.status = "active";
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error("qualityVerifyProduct error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const importProducts = async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ success: false, message: 'rows[] array is required' });
    }
    const data = await bulkImportProducts(rows, req.user?.username ?? null);
    res.json({ success: true, data });
  } catch (error) {
    console.error('importProducts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const removeProduct = async (req, res) => {
  try {
    await deleteProduct(req.params.id);
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('removeProduct error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};



// upload
export const addPpapDocument = async (req, res) => {
  try {
    const id = req.params.id;
    const name = req.body.name;

    const file = req.files?.[0];

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "File required",
      });
    }

    const filePath = file.path;

    const data = await addPpapDocModel(
      id,
      name,
      filePath,
      req.user?.username ?? null
    );

    res.json({ success: true, data });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};


// delete
export const deletePpapDocument = async (req, res) => {
  try {
    const { id, name } = req.params;

    const data = await deletePpapDocModel(
      id,
      name,
      req.user?.username ?? null
    );

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const productDropdownOptions = async (req, res) => {
  try {

    const data = await getDropdownOptions();


    res.json({
      success: true,
      data,
    });

  } catch (error) {
    console.error("productDropdownOptions ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};