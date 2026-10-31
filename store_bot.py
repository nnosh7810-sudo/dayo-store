import os
import logging
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

load_dotenv()
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)

STORE_TOKEN = os.getenv("STORE_BOT_TOKEN")
WEBAPP_URL = "https://dayo-store.onrender.com/"

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("🛍️ افتح المتجر", web_app=WebAppInfo(url=WEBAPP_URL))],
        [InlineKeyboardButton("📢 قناتنا", url="https://t.me/TucosProfit")]
    ]
    await update.message.reply_text(
        "🛍️ **أهلاً بك في متجر DAYO**\n\n"
        "اضغط الزر أدناه لفتح المتجر:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )

async def shop(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("🛍️ افتح المتجر", web_app=WebAppInfo(url=WEBAPP_URL))]
    ]
    await update.message.reply_text(
        "اضغط الزر لفتح المتجر:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )

def main():
    if not STORE_TOKEN:
        print("❌ يرجى تعيين STORE_BOT_TOKEN")
        return

    app = ApplicationBuilder().token(STORE_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("shop", shop))

    print("✅ بوت المتجر يعمل...")
    app.run_polling()

if __name__ == '__main__':
    main()
