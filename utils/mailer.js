import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASSWORD,
  },
});

export const sendMail = async ({ to, subject, html, attachments = []}) => {
  try {
    // If no recipients, return early
    if (!to || to.length === 0) return;

    const mailOptions = {
      from: process.env.MAIL_USER, // Will use MAIL_USER as sender
      to: Array.isArray(to) ? to.join(",") : to,
      subject,
      html,
      attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Message sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending email: ", error);
  }
};
