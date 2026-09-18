const TelegramBot = require('node-telegram-bot-api');
const Razorpay = require('razorpay');
const QRCode = require('qrcode');
const axios = require('axios');
const http = require('http');

// Dummy HTTP server for Render deployment port detection
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Telegram Bot is running smoothly!\n');
}).listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

// API Credentials
const TELEGRAM_TOKEN = '8712759180:AAEf1kFAwcMGBZLGLOKOJSDF_RuonPNAGo8';
const RZP_KEY = 'rzp_live_T3XuB57BqqsNzz';
const RZP_SECRET = 'rOuZhvU3USFwBB0PsHr8ZKzo';

// Initialize Telegram Bot & Razorpay
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const razorpay = new Razorpay({
  key_id: RZP_KEY,
  key_secret: RZP_SECRET
});

// Command: /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `Hello ${msg.from.first_name}! 👋\n\nSend me any text or link. Pay ₹2 via UPI to generate your custom QR code.`
  );
});

// Admin Command: Direct Skip Payment
bot.onText(/\/admins_payment_skip(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const contentToEncode = match[1] ? match[1].trim() : '';

  if (!contentToEncode) {
    bot.sendMessage(
      chatId,
      "⚠️ Please provide text after the command.\n\nExample: `/admins_payment_skip Hello World`",
      { parse_mode: 'Markdown' }
    );
    return;
  }

  try {
    bot.sendMessage(chatId, "⚡ Admin payment bypass activated. Generating your final QR code directly...");

    // Generate custom QR Code directly without any payment
    const finalQrBuffer = await QRCode.toBuffer(contentToEncode, {
      width: 300,
      margin: 2
    });

    await bot.sendPhoto(chatId, finalQrBuffer, {
      caption: "🎉 **Here is your QR Code!** (Admin Bypassed)"
    });
  } catch (err) {
    console.error("Admin QR Generation Error:", err);
    bot.sendMessage(chatId, "❌ Failed to generate QR code.");
  }
});

// Handle Normal User Messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Ignore commands like /start or /admins_payment_skip
  if (!text || text.startsWith('/')) return;

  // Normal User Flow with ₹2 Payment
  try {
    bot.sendMessage(chatId, "Please wait, generating ₹2 payment QR code...");

    // 15 Minutes Close Time (Unix timestamp)
    const closeBy = Math.floor(Date.now() / 1000) + (15 * 60);

    // Create Razorpay UPI QR Code
    const rzpQr = await razorpay.qrCode.create({
      type: "upi_qr",
      name: "Telegram QR Bot Service",
      usage: "single_use",
      fixed_amount: true,
      payment_amount: 200, // Amount in paise (200 paise = ₹2)
      description: `QR for: ${text.substring(0, 30)}`,
      close_by: closeBy,
      notes: {
        chat_id: chatId.toString(),
        content: text
      }
    });

    // Fetch the actual payment QR image directly from Razorpay URL
    const response = await axios.get(rzpQr.image_url, { responseType: 'arraybuffer' });
    const realPaymentQrBuffer = Buffer.from(response.data, 'utf-8');

    // Send Direct Payment QR to User
    await bot.sendPhoto(chatId, realPaymentQrBuffer, {
      caption: `💰 **Payment Details:**\n\nScan this QR code using Google Pay, PhonePe, or Paytm to pay **₹2** and unlock your custom QR code.\n\n⏰ **Time Limit:** 15 Minutes\n📍 **QR ID:** \`${rzpQr.id}\``,
      parse_mode: 'Markdown'
    });

    // Start Polling to track payment
    trackPaymentStatus(chatId, rzpQr.id, text);

  } catch (error) {
    console.error("Error creating Razorpay QR:", error);
    bot.sendMessage(chatId, "❌ Failed to generate payment QR. Please try again.");
  }
});

// Function for Polling Payment Status every 5 seconds
function trackPaymentStatus(chatId, qrCodeId, originalText) {
  const startTime = Date.now();
  const timeoutMs = 15 * 60 * 1000; // 15 Minutes limit

  const intervalId = setInterval(async () => {
    // Check if 15 minutes expired
    if (Date.now() - startTime > timeoutMs) {
      clearInterval(intervalId);
      bot.sendMessage(
        chatId,
        "❌ **Your Payment is Unsuccessful or Expired.**\n\n15 minutes time limit has ended. Please try again.",
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      // Fetch status from Razorpay API
      const qrDetails = await razorpay.qrCode.fetch(qrCodeId);

      // Check if amount is paid or QR status is closed with payment
      if (qrDetails.payments_amount_received >= 200 || qrDetails.status === 'closed') {
        clearInterval(intervalId);

        // Notify user about successful payment
        await bot.sendMessage(chatId, "✅ **Payment Successful!**\n\nPayment received. Generating your custom QR code...", { parse_mode: 'Markdown' });

        // Generate custom QR Code for user text
        const finalQrBuffer = await QRCode.toBuffer(originalText, {
          width: 300,
          margin: 2
        });

        // Send Final Text QR Code
        await bot.sendPhoto(chatId, finalQrBuffer, {
          caption: "🎉 **Here is your QR Code!**"
        });
      }
    } catch (err) {
      console.error("Polling Error:", err.message);
    }
  }, 5000); // 5 Seconds Polling interval
}
