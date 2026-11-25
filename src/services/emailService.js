const nodemailer = require("nodemailer");

function getEmailConfiguration() {
    const requiredSettings = [
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USER",
        "SMTP_PASS",
        "EMAIL_FROM"
    ];

    const missingSettings = requiredSettings.filter(
        (setting) => !process.env[setting]
    );

    if (missingSettings.length > 0) {
        throw new Error(
            `Missing email settings: ${missingSettings.join(", ")}`
        );
    }

    const port = Number(process.env.SMTP_PORT);

    if (!Number.isInteger(port) || port <= 0) {
        throw new Error("SMTP_PORT must be a valid port number.");
    }

    return {
        host: process.env.SMTP_HOST,
        port,
        secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    };
}

function createEmailTransporter() {
    return nodemailer.createTransport({
        ...getEmailConfiguration(),
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000
    });
}

async function verifyEmailConnection() {
    const transporter = createEmailTransporter();

    await transporter.verify();

    return {
        success: true,
        message: "Email server connection verified successfully."
    };
}

async function sendEmail({ to, subject, text, html }) {
    if (!to || !subject || (!text && !html)) {
        throw new Error("Recipient, subject, and email content are required.");
    }

    const transporter = createEmailTransporter();

    const result = await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        text,
        html
    });

    return {
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected
    };
}

module.exports = {
    verifyEmailConnection,
    sendEmail
};