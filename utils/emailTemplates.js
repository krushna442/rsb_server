export const newProductTemplate = (products) => {
  // products = array of objects with: customerName, partNumber, partDescription, tubeLength, revNo

  const formattedDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const rows = products.map(p => `
    <tr>
      <td style="padding: 10px; text-align: center; border: 1px solid #000;">${p.customerName || "—"}</td>
      <td style="padding: 10px; text-align: center; border: 1px solid #000;">${p.partNumber || "—"}</td>
      <td style="padding: 10px; text-align: center; border: 1px solid #000;">${p.partDescription || "—"}</td>
      <td style="padding: 10px; text-align: center; border: 1px solid #000;">${p.tubeLength || "—"}</td>
      <td style="padding: 10px; text-align: center; border: 1px solid #000;">${p.revNo || "—"}</td>
    </tr>
  `).join("");

  return `
    <div style="font-family: Arial, sans-serif; color: #000000; max-width: 100%; margin: 0 auto; padding: 24px;">

      <p style="margin: 0 0 10px; font-size: 14px;">Dear Sir,</p>
      <p style="margin: 0 0 10px; font-size: 14px;">
        New products have been added to the system on Date <strong>${formattedDate}</strong>.
      </p>
      <p style="margin: 0 0 20px; font-size: 14px;">Please find the details below:</p>

      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Customer Name</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Part No.</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Part Description</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Tube Length</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Rev No</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <p style="margin: 24px 0 4px; font-size: 14px;">Regards,</p>
      <p style="margin: 0; font-size: 14px;"><strong>Product Management System</strong></p>
    </div>
  `;
};

export const productActiveTemplate = (partNumber) => {
  return `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <div style="background-color: #10b981; padding: 20px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 24px;">Product Approved & Active</h2>
      </div>
      <div style="padding: 30px;">
        <p style="font-size: 16px; line-height: 1.5; color: #555;">Hello Admin,</p>
        <p style="font-size: 16px; line-height: 1.5; color: #555;">
          A product has been successfully approved by both the Production and Quality teams and is now <strong>Active</strong> in the system.
        </p>
        <div style="margin: 25px 0; padding: 20px; background-color: #f0fdf4; border-left: 5px solid #10b981; border-radius: 4px;">
          <p style="margin: 0; font-size: 16px; color: #065f46;">Part Number: <strong style="font-size: 18px;">${partNumber}</strong></p>
        </div>
        <p style="font-size: 16px; line-height: 1.5; color: #555;">
          All necessary verifications are complete. You can now track or manage this product in the master list.
        </p>
        <div style="margin-top: 30px; text-align: center;">
          <a href="#" style="background-color: #10b981; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: bold; display: inline-block;">View Product</a>
        </div>
      </div>
      <div style="background-color: #f9fafb; padding: 15px; text-align: center; border-top: 1px solid #ddd; font-size: 12px; color: #aaa;">
        <p style="margin: 0;">This is an automated message. Please do not reply to this email.</p>
        <p style="margin: 5px 0 0 0;">&copy; ${new Date().getFullYear()} Product Management System</p>
      </div>
    </div>
  `;
};

// ============================================================
// PRODUCTION APPROVAL EMAIL TEMPLATE
// ============================================================
export const productionApprovalTemplate = (data) => {
  const {
    partNumber,
    customerName,
    vendorCode,
    partDescription,
    series,
    tubeLength,
    partType,
    revNo,
    productionBy,
    productionStatus,
    productionTime,
    productionRemark,
  } = data;

  const formattedDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  return `
    <div style="font-family: Arial, sans-serif; color: #000000; max-width: 100%; margin: 0 auto; padding: 24px;">

      <p style="margin: 0 0 10px; font-size: 14px;">Dear Sir,</p>
      <p style="margin: 0 0 10px; font-size: 14px;">
        You have received one part approved from Production on Date <strong>${formattedDate}</strong>!
      </p>
      <p style="margin: 0 0 6px; font-size: 14px;">See the below PartNumbers-</p>
      <p style="margin: 0 0 20px; font-size: 14px;">${partNumber}</p>

      <!-- Horizontal Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #ffffff;">
            <th style="padding: 10px 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Customer<br/>Name</th>
            <th style="padding: 10px 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Vendor<br/>Code</th>
            <th style="padding: 10px 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Part No.</th>
            <th style="padding: 10px 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Part Description</th>
            <th style="padding: 10px 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Series</th>
            <th style="padding: 10px 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Tube<br/>Length</th>
            <th style="padding: 10px 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Part<br/>Type</th>
            <th style="padding: 10px 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Rev<br/>No</th>
            <th style="padding: 10px 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Production<br/>By</th>
            <th style="padding: 10px 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Production<br/>Status</th>
            <th style="padding: 10px 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Production<br/>Time</th>
            <th style="padding: 10px 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Production<br/>Remark</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #ffffff;">
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${customerName || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${vendorCode || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${partNumber || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${partDescription || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${series || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${tubeLength || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${partType || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${revNo || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${productionBy || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${productionStatus || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000; white-space: nowrap;">${productionTime || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${productionRemark || "—"}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin: 24px 0 4px; font-size: 14px;">Regards,</p>
      <p style="margin: 0; font-size: 14px;"><strong>${productionBy}</strong></p>
    </div>
  `;
};


export const qualityApprovalTemplate = (data) => {
  const {
    partNumber,
    customerName,
    vendorCode,
    partDescription,
    series,
    tubeLength,
    partType,
    revNo,
    qualityBy,
    qualityStatus,
    qualityTime,
    qualityRemark,
  } = data;

  const formattedDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  return `
    <div style="font-family: Arial, sans-serif; color: #000000; max-width: 100%; margin: 0 auto; padding: 24px;">

      <p style="margin: 0 0 10px; font-size: 14px;">Dear Sir,</p>
      <p style="margin: 0 0 10px; font-size: 14px;">
        You have received one part approved from Quality on Date <strong>${formattedDate}</strong>!
      </p>
      <p style="margin: 0 0 6px; font-size: 14px;">See the below PartNumbers-</p>
      <p style="margin: 0 0 20px; font-size: 14px;">${partNumber}</p>

      <!-- Horizontal Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #ffffff;">
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Customer<br/>Name</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Vendor<br/>Code</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Part No.</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Part Description</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Series</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Tube<br/>Length</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Part<br/>Type</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Rev<br/>No</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Quality<br/>By</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Quality<br/>Status</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Quality<br/>Time</th>
            <th style="padding: 10px; font-weight: 700; text-align: center; border: 1px solid #000; white-space: nowrap;">Quality<br/>Remark</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #ffffff;">
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${customerName || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${vendorCode || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${partNumber || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${partDescription || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${series || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${tubeLength || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${partType || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${revNo || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${qualityBy || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${qualityStatus || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000; white-space: nowrap;">${qualityTime || "—"}</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #000;">${qualityRemark || "—"}</td>
          </tr>
        </tbody>
      </table>

      <p style="margin: 24px 0 4px; font-size: 14px;">Regards,</p>
      <p style="margin: 0; font-size: 14px;"><strong>${qualityBy}</strong></p>
    </div>
  `;
};

// ============================================================
// PRODUCT REJECTION EMAIL TEMPLATE
// ============================================================
export const productRejectionTemplate = (data) => {
  const {
    partNumber,
    customerName,
    vendorCode,
    partDescription,
    series,
    tubeLength,
    partType,
    revNo,
    rejectedBy,
    rejectedByRole,   // 'production' or 'quality'
    rejectionRemark,
  } = data;

  const formattedDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const formattedTime = new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

  const roleLabel = rejectedByRole === "quality" ? "Quality" : "Production";

  return `
    <div style="font-family: Arial, sans-serif; color: #000000; max-width: 100%; margin: 0 auto; padding: 24px;">

      <div style="background-color: #dc2626; padding: 16px 24px; border-radius: 6px 6px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">⚠ Product Rejected by ${roleLabel}</h2>
      </div>

      <div style="border: 1px solid #dc2626; border-top: none; border-radius: 0 0 6px 6px; padding: 24px; background: #fff5f5;">
        <p style="margin: 0 0 10px; font-size: 14px;">Dear Sir,</p>
        <p style="margin: 0 0 10px; font-size: 14px;">
          A product has been <strong style="color:#dc2626;">REJECTED</strong> by the ${roleLabel} team on
          <strong>${formattedDate}</strong> at <strong>${formattedTime}</strong>.
        </p>

        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 16px;">
          <thead>
            <tr style="background: #dc2626; color: #fff;">
              <th style="padding: 10px; text-align: center; border: 1px solid #dc2626;">Customer</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #dc2626;">Vendor Code</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #dc2626;">Part No.</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #dc2626;">Part Description</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #dc2626;">Series</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #dc2626;">Tube Length</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #dc2626;">Part Type</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #dc2626;">Rev No</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #dc2626;">Rejected By</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #dc2626;">Rejection Remark</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background: #ffffff;">
              <td style="padding: 10px; text-align: center; border: 1px solid #fca5a5;">${customerName || "—"}</td>
              <td style="padding: 10px; text-align: center; border: 1px solid #fca5a5;">${vendorCode || "—"}</td>
              <td style="padding: 10px; text-align: center; border: 1px solid #fca5a5; font-weight: bold;">${partNumber || "—"}</td>
              <td style="padding: 10px; text-align: center; border: 1px solid #fca5a5;">${partDescription || "—"}</td>
              <td style="padding: 10px; text-align: center; border: 1px solid #fca5a5;">${series || "—"}</td>
              <td style="padding: 10px; text-align: center; border: 1px solid #fca5a5;">${tubeLength || "—"}</td>
              <td style="padding: 10px; text-align: center; border: 1px solid #fca5a5;">${partType || "—"}</td>
              <td style="padding: 10px; text-align: center; border: 1px solid #fca5a5;">${revNo || "—"}</td>
              <td style="padding: 10px; text-align: center; border: 1px solid #fca5a5;">${rejectedBy || "—"}</td>
              <td style="padding: 10px; text-align: center; border: 1px solid #fca5a5; color: #dc2626; font-style: italic;">${rejectionRemark || "No remark provided"}</td>
            </tr>
          </tbody>
        </table>

        <p style="margin: 20px 0 4px; font-size: 14px; color: #555;">Please take necessary action on this rejection.</p>
        <p style="margin: 4px 0 4px; font-size: 14px;">Regards,</p>
        <p style="margin: 0; font-size: 14px;"><strong>${rejectedBy}</strong> (${roleLabel} Team)</p>
      </div>
    </div>
  `;
};

// ============================================================
// PENDING APPROVAL REMINDER EMAIL TEMPLATE
// ============================================================
export const pendingApprovalReminderTemplate = (data) => {
  const {
    pendingType,   // 'Production Approval' or 'Quality Verification'
    products,      // array of { partNumber, customerName, daysPending, createdAt }
  } = data;

  const formattedDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const rows = products.map(p => `
    <tr style="background: #ffffff;">
      <td style="padding: 10px; text-align: center; border: 1px solid #fcd34d; font-weight: bold;">${p.partNumber || "—"}</td>
      <td style="padding: 10px; text-align: center; border: 1px solid #fcd34d;">${p.customerName || "—"}</td>
      <td style="padding: 10px; text-align: center; border: 1px solid #fcd34d;">${p.createdAt || "—"}</td>
      <td style="padding: 10px; text-align: center; border: 1px solid #fcd34d; color: #dc2626; font-weight: bold;">${p.daysPending} day(s)</td>
    </tr>
  `).join("");

  return `
    <div style="font-family: Arial, sans-serif; color: #000000; max-width: 100%; margin: 0 auto; padding: 24px;">

      <div style="background-color: #d97706; padding: 16px 24px; border-radius: 6px 6px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">⏳ Pending ${pendingType} Reminder</h2>
      </div>

      <div style="border: 1px solid #d97706; border-top: none; border-radius: 0 0 6px 6px; padding: 24px; background: #fffbeb;">
        <p style="margin: 0 0 10px; font-size: 14px;">Dear Sir/Ma'am,</p>
        <p style="margin: 0 0 16px; font-size: 14px;">
          The following <strong>${products.length}</strong> product(s) have been pending
          <strong>${pendingType}</strong> for <strong style="color:#dc2626;">more than 3 days</strong>
          as of <strong>${formattedDate}</strong>. Please take immediate action.
        </p>

        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background: #d97706; color: #fff;">
              <th style="padding: 10px; text-align: center; border: 1px solid #d97706;">Part Number</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #d97706;">Customer</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #d97706;">Added On</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #d97706;">Days Pending</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <p style="margin: 20px 0 4px; font-size: 14px; color: #555;">
          Please log in to the system and complete the ${pendingType.toLowerCase()} at the earliest.
        </p>
        <p style="margin: 4px 0 4px; font-size: 14px;">Regards,</p>
        <p style="margin: 0; font-size: 14px;"><strong>Product Management System</strong></p>
      </div>
    </div>
  `;
};