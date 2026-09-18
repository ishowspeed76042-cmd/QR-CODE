const TelegramBot = require('node-telegram-bot-api');
const Razorpay = require('razorpay');
const QRCode = require('qrcode');

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
    `नमस्ते ${msg.from.first_name}! 👋\n\nमुझे कोई भी टेक्स्ट या लिंक भेजें। ₹1 का पेमेंट करने के बाद मैं आपके लिए उसका क्यूआर (QR) कोड जनरेट कर दूंगा।`
  );
});

// Handle incoming messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Ignore commands like /start
  if (!text || text.startsWith('/')) return;

  try {
    bot.sendMessage(chatId, "कृपया प्रतीक्षा करें, ₹1 का भुगतान QR कोड जनरेट हो रहा है...");

    // 15 Minutes Close Time (in Unix timestamp)
    const closeBy = Math.floor(Date.now() / 1000) + (15 * 60);

    // Create Razorpay QR Code
    const rzpQr = await razorpay.qrCode.create({
      type: "upi_qr",
      name: "Telegram QR Bot Service",
      usage: "single_use",
      fixed_amount: true,
      payment_amount: 100, // Amount in paise (100 paise = 1 INR)
      description: `QR for: ${text.substring(0, 30)}`,
      close_by: closeBy,
      notes: {
        chat_id: chatId.toString(),
        content: text
      }
    });

    const paymentQrBuffer = await QRCode.toBuffer(rzpQr.image_url);

    // Send Razorpay Payment QR to User
    await bot.sendPhoto(chatId, paymentQrBuffer, {
      caption: `💰 **भुगतान विवरण:**\n\nकस्टम QR कोड पाने के लिए दिए गए QR कोड पर ₹1 का भुगतान करें।\n\n⏰ **समय सीमा:** 15 मिनट\n📍 **QR ID:** \`${rzpQr.id}\``,
      parse_mode: 'Markdown'
    });

    // Start Polling to track payment
    trackPaymentStatus(chatId, rzpQr.id, text);

  } catch (error) {
    console.error("Error creating Razorpay QR:", error);
    bot.sendMessage(chatId, "❌ भुगतान QR जनरेट करने में समस्या आई। कृपया पुनः प्रयास करें।");
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
        "❌ **Your Payment is Unsuccessful or Expired.**\n\n15 मिनट का समय समाप्त हो गया है। कृपया पुनः प्रयास करें।",
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      // Fetch status from Razorpay API
      const qrDetails = await razorpay.qrCode.fetch(qrCodeId);

      // Check if amount is paid or QR status is closed with payment
      if (qrDetails.payments_amount_received >= 100 || qrDetails.status === 'closed') {
        clearInterval(intervalId);

        // Notify user about successful payment
        await bot.sendMessage(chatId, "✅ **Payment Successful!**\n\nआपका पेमेंट प्राप्त हो गया है। आपका क्यूआर कोड तैयार किया जा रहा है...", { parse_mode: 'Markdown' });

        // Generate custom QR Code for user text
        const finalQrBuffer = await QRCode.toBuffer(originalText, {
          width: 300,
          margin: 2
        });

        // Send Final Text QR Code
        await bot.sendPhoto(chatId, finalQrBuffer, {
          caption: "🎉 **यह रहा आपका QR कोड!**"
        });
      }
    } catch (err) {
      console.error("Polling Error:", err.message);
    }
  }, 5000); // 5 Seconds Polling interval
}