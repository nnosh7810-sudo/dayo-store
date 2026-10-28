import os
import logging
import time
from collections import defaultdict, deque
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, ContextTypes, CommandHandler,
    MessageHandler, CallbackQueryHandler, ConversationHandler, filters
)
from google import genai

load_dotenv()
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=GEMINI_API_KEY)

# حالات المحادثة
ASK_GENDER, ASK_LENGTH = range(2)

# سجل المحادثة: كل chat_id يحتفظ بقائمة من (timestamp, role, text)
history_store = defaultdict(list)

def clean_history(chat_id):
    """حذف السجلات التي تتجاوز 24 ساعة"""
    now = time.time()
    history_store[chat_id] = [
        (ts, r, t) for ts, r, t in history_store[chat_id]
        if now - ts < 86400  # 24 ساعة
    ]

# ========== /start وعملية الأسئلة ==========
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("ذكر", callback_data="male"),
         InlineKeyboardButton("أنثى", callback_data="female")]
    ]
    await update.message.reply_text(
        "أهلاً بك! أنا مساعدك الذكي.\nهل تفضّل أن أكون **ذكرًا** أم **أنثى**؟",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )
    return ASK_GENDER

async def gender_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    gender = query.data  # "male" أو "female"
    context.user_data["gender"] = gender
    # حفظ فوري في ملف دائم (اختياري، هنا نستخدم user_data الذي يستمر خلال الجلسة)

    keyboard = [
        [InlineKeyboardButton("مختصر", callback_data="short"),
         InlineKeyboardButton("مفصل", callback_data="detailed")]
    ]
    await query.edit_message_text(
        f"تم الحفظ: سأكون **{'ذكرًا' if gender == 'male' else 'أنثى'}**.\n"
        f"هل تريد أن تكون إجاباتي **مختصرة** أم **مفصلة**؟",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )
    return ASK_LENGTH

async def length_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    length = query.data  # "short" أو "detailed"
    context.user_data["length"] = length

    gender_text = "ذكر" if context.user_data.get("gender") == "male" else "أنثى"
    length_text = "مختصر" if length == "short" else "مفصل"
    await query.edit_message_text(
        f"تم الحفظ!\n"
        f"الجنس: {gender_text}\n"
        f"الأسلوب: {length_text}\n\n"
        f"يمكنك الآن إرسال أي سؤال، وسأجيبك بالطريقة التي اخترتها.",
        parse_mode="Markdown"
    )
    return ConversationHandler.END

# ========== معالجة الرسائل العادية ==========
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_text = update.message.text
    chat_id = update.effective_chat.id
    logging.info(f"رسالة [{chat_id}]: {user_text}")

    # التحقق من وجود إعدادات
    if "gender" not in context.user_data or "length" not in context.user_data:
        await update.message.reply_text("يرجى إرسال /start أولاً لإعداد تفضيلاتك.")
        return

    await context.bot.send_chat_action(chat_id=chat_id, action="typing")

    # تنظيف السجل القديم
    clean_history(chat_id)

    # بناء محتوى المحادثة
    contents = []
    for ts, role, text in history_store[chat_id]:
        contents.append({"role": role, "parts": [{"text": text}]})
    contents.append({"role": "user", "parts": [{"text": user_text}]})

    # بناء system_instruction بناءً على التفضيلات
    gender = context.user_data["gender"]
    length = context.user_data["length"]
    gender_str = "ذكر" if gender == "male" else "أنثى"
    if length == "short":
        length_rule = "أجب بإيجاز شديد، لا تتجاوز 3 جمل."
    else:
        length_rule = "أجب بتفصيل كافٍ وواضح."

    system_instruction = (
        f"أنت مساعد {gender_str}. {length_rule} "
        f"تحدث بالعربية الفصحى المبسطة. لا تذكر أنك نموذج ذكاء اصطناعي."
    )

    try:
        response = gemini_client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=contents,
            config={
                "system_instruction": system_instruction,
            }
        )
        reply = response.text
        await update.message.reply_text(reply)

        # حفظ في السجل مع طابع زمني
        now = time.time()
        history_store[chat_id].append((now, "user", user_text))
        history_store[chat_id].append((now, "model", reply))

    except Exception as e:
        logging.error(f"فشل: {e}", exc_info=True)
        await update.message.reply_text("خطأ مؤقت، حاول لاحقًا.")

# ========== إلغاء / إعادة البدء ==========
async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("تم الإلغاء. أرسل /start للبدء من جديد.")
    return ConversationHandler.END

def main():
    if not TELEGRAM_TOKEN or not GEMINI_API_KEY:
        print("يرجى تعيين TELEGRAM_TOKEN و GEMINI_API_KEY")
        return

    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()

    # معالج المحادثة التفاعلية
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            ASK_GENDER: [CallbackQueryHandler(gender_chosen)],
            ASK_LENGTH: [CallbackQueryHandler(length_chosen)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
        per_user=True,
        per_chat=True,
    )
    app.add_handler(conv_handler)

    # معالج الرسائل العادية (بعد انتهاء الإعداد)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    print("البوت يعمل...")
    app.run_polling()

if __name__ == '__main__':
    main()