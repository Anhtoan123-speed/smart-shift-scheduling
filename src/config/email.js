/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · NODEMAILER EMAIL TRANSPORTER CONFIGURATION
 * ==============================================================================
 */
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verify kết nối SMTP bất đồng bộ (không block tiến trình server)
if (process.env.SMTP_USER && process.env.SMTP_PASS && process.env.NODE_ENV !== 'test') {
  transporter.verify().then(() => {
    console.log('✅ [EMAIL TRANSPORTER] Đã kết nối thành công đến SMTP Server:', process.env.SMTP_HOST);
  }).catch((error) => {
    console.warn('ℹ️ [EMAIL TRANSPORTER] Chế độ phát triển (Dev/Offline): Email sẽ được ghi log console an toàn.');
  });
}

module.exports = transporter;
