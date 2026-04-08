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