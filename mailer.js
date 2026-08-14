const nodemailer = require('nodemailer');

function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    }
  });
}

async function sendMail({ to, subject, text }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('Email not configured (EMAIL_USER / EMAIL_APP_PASSWORD missing) - skipping send');
    return { skipped: true };
  }
  return transporter.sendMail({
    from: `"Hiring Team" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text
  });
}

module.exports = { sendMail };
