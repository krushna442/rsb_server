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
  addDocumentModel,
  deleteDocumentModel,
  getDropdownOptions,
  setInactiveProduct,
  markDocumentNotRequiredModel,
} from '../models/productModel.js';
import { findEmailsByRoles } from '../models/userModel.js';
import { sendMail } from '../utils/mailer.js';
import { newProductTemplate, productActiveTemplate, productionApprovalTemplate, qualityApprovalTemplate } from '../utils/emailTemplates.js';

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

    // Send email to production and quality users
    try {
      const emails = await findEmailsByRoles(['production', 'quality']);
      if (emails.length > 0) {
        await sendMail({
          to: emails,
          subject: 'New Product Added',
          html: newProductTemplate([
            {
              customerName: data.customer,
              partNumber: data.part_number,
              partDescription: data.specification?.partDescription,
              tubeLength: data.specification?.tubeLength,
              revNo: data.specification?.revNo,
            }
          ]),
        });
      }
    } catch (mailErr) {
      console.error('Error sending new product email:', mailErr);
    }

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
    const data = await updateProduct(req.params.id, req.body, req.user?.username ?? null, req.user?.role ?? null);
    res.json({ success: true, data });
  } catch (error) {
    console.error('editProduct error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


const formatDateTime = (dateInput, onlyDate = false) => {
  if (!dateInput) return "-";
  
  // ✅ Handle both Date objects and strings
  const dateString = dateInput instanceof Date ? dateInput.toISOString() : String(dateInput);
  
  const cleanDate = dateString.endsWith('Z') ? dateString.slice(0, -1) : dateString;
  const d = new Date(cleanDate);
  if (isNaN(d.getTime())) return dateString;

  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();

  if (onlyDate) return `${day} ${month} ${year}`;

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strTime = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;

  return `${day} ${month} ${year}, ${strTime}`;
};

export const approveProduct = async (req, res) => {
  try {
    const { status, remarks, remark } = req.body;
    let finalRemarks = remarks || remark || null;
    if (finalRemarks) {
      finalRemarks = `${finalRemarks} (production)`;
    }

    const data = await setApprovalStatus(
      req.params.id,
      status,
      req.user?.username ?? null,
      finalRemarks
    );

    if (status === "approved" && data.quality_verified === "approved") {
      await updateProduct(req.params.id, { status: "active" });
      data.status = "active";
    } else if (status === "rejected") {
      await updateProduct(req.params.id, { status: "rejected" });
      data.status = "rejected";
    }
if(status=="approved"){
    try {
      const emails = await findEmailsByRoles(["admin", "super admin"]);
      if (emails.length > 0) {
        await sendMail({
          to: emails,
          subject: "Part Production Approved",
          html: productionApprovalTemplate({
            partNumber: data.part_number,
            customerName: data.customer,
            vendorCode: data.specification?.vendorCode,
            partDescription: data.specification?.partDescription,
            series: data.specification?.series,
            tubeLength: data.specification?.tubeLength,
            partType: data.specification?.partType,
            revNo: data.specification?.revNo,
            productionBy: req.user?.name,
            productionStatus: status,
            productionTime: formatDateTime(data.updated_at), // ✅ clean call
            productionRemark: remark,
          }),
        });
      }
    } catch (mailErr) {
      console.error("Error sending production approval email:", mailErr);
    }
  }

    res.json({ success: true, data });
  } catch (error) {
    console.error("approveProduct error:", error);
    res.status(400).json({ success: false, message: error.message });
  }

};

export const qualityVerifyProduct = async (req, res) => {
  try {
    const { status, remarks, remark } = req.body;
    let finalRemarks = remarks || remark || null;
    if (finalRemarks) {
      finalRemarks = `${finalRemarks} (quality)`;
    }

    const data = await setQualityStatus(
      req.params.id,
      status,
      req.user?.username ?? null,
      finalRemarks
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

if(status=="approved"){
  try {
      const emails = await findEmailsByRoles(["admin", "super admin"]);
      if (emails.length > 0) {
        await sendMail({
          to: emails,
          subject: "Part Quality Approved",
          html: qualityApprovalTemplate({
            partNumber: data.part_number,
            customerName: data.customer,
            vendorCode: data.specification?.vendorCode,
            partDescription: data.specification?.partDescription,
            series: data.specification?.series,
            tubeLength: data.specification?.tubeLength,
            partType: data.specification?.partType,
            revNo: data.specification?.revNo,
            qualityBy: req.user?.name,
            qualityStatus: status,
            qualityTime: formatDateTime(data.updated_at), // ✅ clean call
            qualityRemark: remark,
          }),
        });
      }
    } catch (mailErr) {
      console.error("Error sending production approval email:", mailErr);
    }
}

    res.json({ success: true, data });
  } catch (error) {
    console.error("qualityVerifyProduct error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};


export const inactiveProduct = async (req, res) => {
  try {
    const { remarks, remark } = req.body;
    const finalRemarks = remarks || remark || null;

    const data = await setInactiveProduct(
      req.params.id,
      req.user?.username ?? null,
      finalRemarks
    );

    // (Optional) Send email notification
    try {
      const emails = await findEmailsByRoles(['admin', 'super admin']);
      if (emails.length > 0) {
        await sendMail({
          to: emails,
          subject: 'Product Marked Inactive',
          html: `<p>Product ${data.part_number} has been marked as inactive.</p>`
        });
      }
    } catch (mailErr) {
      console.error('Error sending inactive email:', mailErr);
    }

    res.json({ success: true, data });

  } catch (error) {
    console.error("inactiveProduct error:", error);
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

    try {
      if (data.inserted > 0) {
        const emails = await findEmailsByRoles(['production', 'quality']);
        if (emails.length > 0) {
          const products = rows.map(r => ({
            customerName: r.customer,
            partNumber: r.part_number,
            partDescription: r.specification?.partDescription,
            tubeLength: r.specification?.tubeLength,
            revNo: r.specification?.revNo,
          }));

          await sendMail({
            to: emails,
            subject: 'New Products Added via Import',
            html: newProductTemplate(products),
          });
        }
      }
    } catch (mailErr) {
      console.error('Error sending bulk import email:', mailErr);
    }

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



// ─── Document upload (categorized: individual / ppap) ────────────────────────
export const addDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category = "individual" } = req.body;

    const file = req.files?.[0];
    if (!file) {
      return res.status(400).json({ success: false, message: "File required" });
    }

    const data = await addDocumentModel(
      id,
      category,
      name,
      file.path,
      req.user?.username ?? null
    );

    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    const status = err.message.includes("Invalid category") ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// ─── Document delete ─────────────────────────────────────────────────────────
export const deleteDocument = async (req, res) => {
  try {
    const { id, category, name } = req.params;

    const data = await deleteDocumentModel(
      id,
      category,
      name,
      req.user?.username ?? null
    );

    res.json({ success: true, data });
  } catch (err) {
    const status = err.message.includes("Invalid category") ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};
// ─── Mark document as not required ───────────────────────────────────────────
export const markDocumentNotRequired = async (req, res) => {
  try {
    const { id, category, name } = req.params;

    const data = await markDocumentNotRequiredModel(
      id,
      category,
      name,
      req.user?.username ?? null
    );

    res.json({ success: true, data });
  } catch (err) {
    const status = err.message.includes("Invalid category") ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
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