require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const express = require('express');
const bot = new Telegraf(process.env.BOT_TOKEN);

const DB_PATH = path.join(__dirname, 'data', 'db.json');
let db = { applications: [] };

if (fs.existsSync(DB_PATH)) {
  db = JSON.parse(fs.readFileSync(DB_PATH));
  if (!db.applications) db.applications = [];
} else {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

const branches = ['Oxford (Chorsu)', 'Oxford (Kosonsoy)', 'Oxford (Uychi)'];

const positions = [
  'IELTS Instructor', 'General English Teacher', 'Support Teacher',
  'Administrator', 'Call Operator', 'Rus tili ustoz',
  'IT (Dasturlash)', 'Matematika', 'Boshqa DTM fanlar'
];

const userData = {};
const adminData = {};

function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function formatApplication(app) {
  return [
    `📅 Sana: ${app.date || ''}`,
    `🏢 Filial: ${app.branch || ''}`,
    `📝 Lavozim: ${app.position || ''}`,
    `1️⃣ Ism: ${app.name || ''}`,
    `2️⃣ Yosh: ${app.age || ''}`,
    `3️⃣ Telefon: ${app.phone || ''}`,
    `4️⃣ Qo'shimcha ma'lumot: ${app.experience || ''}`
  ].join('\n');
}

function todayDate() {
  const t = new Date();
  return `${String(t.getDate()).padStart(2,'0')}-${String(t.getMonth()+1).padStart(2,'0')}-${t.getFullYear()}`;
}

/* ================== SUBSCRIBE CHECK ================== */

async function checkSubscription(ctx) {
  const channel = process.env.REQUIRED_CHANNEL;
  if (!channel) return true;

  try {
    const member = await ctx.telegram.getChatMember(channel, ctx.from.id);
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch (err) {
    console.log('Subscription error:', err.message);
    return false;
  }
}

/* ===================================================== */

bot.start(async (ctx) => {
  const chatId = ctx.chat.id.toString();

  if (chatId === process.env.ADMIN_ID) {
    return ctx.reply('Admin panelga xush kelibsiz', Markup.inlineKeyboard([
      [Markup.button.callback('Yangi arizalar', 'admin_new')],
      [Markup.button.callback('Qabul qilinganlar', 'admin_accepted')],
      [Markup.button.callback('Rad etilganlar', 'admin_rejected')],
      [Markup.button.callback('Umumiy arizalar', 'admin_all')],
      [Markup.button.callback('Export Excel', 'admin_export')]
    ]));
  }

  const subscribed = await checkSubscription(ctx);

  if (!subscribed) {
    return ctx.reply(
      'Botdan foydalanish uchun avval kanalga a’zo bo‘ling 👇',
      Markup.inlineKeyboard([
        [Markup.button.url('Kanalga o‘tish', `https://t.me/${process.env.REQUIRED_CHANNEL.replace('@','')}`)],
        [Markup.button.callback('Tekshirish ✅', 'check_sub')]
      ])
    );
  }

  ctx.reply(
    "Assalomu alaykum!\nOxford oilasiga qo‘shilish uchun ariza qoldiring! (1–2 daqiqa vaqt oladi)",
    Markup.inlineKeyboard([[Markup.button.callback('Ariza yuborish', 'start_application')]])
  );
});

bot.on('callback_query', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const data = ctx.callbackQuery.data;

/* ================== SUBSCRIBE BUTTON ================== */

  if (data === 'check_sub') {
    const subscribed = await checkSubscription(ctx);

    if (!subscribed) {
      return ctx.answerCbQuery('Siz hali kanalga a’zo emassiz ❌', { show_alert: true });
    }

    await ctx.editMessageText(
      'Rahmat! Endi ariza yuborishingiz mumkin ✅',
      Markup.inlineKeyboard([
        [Markup.button.callback('Ariza yuborish', 'start_application')]
      ])
    );

    return ctx.answerCbQuery();
  }

/* ====================================================== */

  if (data === 'start_application') {

    const subscribed = await checkSubscription(ctx);
    if (!subscribed) {
      return ctx.answerCbQuery('Avval kanalga a’zo bo‘ling ❌', { show_alert: true });
    }

    userData[chatId] = { step: 'name', data: {} };
    return ctx.editMessageText('Ism va familiyangizni kiriting: \n (Masalan: Aliyev Azizbek)');
  }

  if (data === 'edit_menu') {
    return ctx.editMessageText('Qaysi bo‘limni tahrirlamoqchisiz?', Markup.inlineKeyboard([
      [Markup.button.callback('Ism', 'edit_name')],
      [Markup.button.callback('Yosh', 'edit_age')],
      [Markup.button.callback('Telefon', 'edit_phone')],
      [Markup.button.callback('Filial', 'edit_branch')],
      [Markup.button.callback('Lavozim', 'edit_position')],
      [Markup.button.callback('Tajriba', 'edit_experience')]
    ]));
  }

  if (data.startsWith('edit_')) {
    const field = data.split('_')[1];
    if (!userData[chatId]) return;

    userData[chatId].editing = field;

    if (field === 'branch') {
      return ctx.editMessageText('Yangi filialni tanlang:',
        Markup.inlineKeyboard(branches.map(b => [Markup.button.callback(b, b)]))
      );
    }

    if (field === 'position') {
      return ctx.editMessageText('Yangi lavozimni tanlang:',
        Markup.inlineKeyboard(positions.map(p => [Markup.button.callback(p, p)]))
      );
    }

    return ctx.editMessageText(`Yangi ${field} ni kiriting:`);
  }

  if (branches.includes(data) && userData[chatId]) {
    if (userData[chatId].editing === 'branch') {
      userData[chatId].data.branch = data;
      delete userData[chatId].editing;
    } else {
      userData[chatId].data.branch = data;
      userData[chatId].step = 'position';
      return ctx.editMessageText('Qaysi lavozim?',
        Markup.inlineKeyboard(positions.map(p => [Markup.button.callback(p, p)]))
      );
    }
  }

  if (positions.includes(data) && userData[chatId]) {
    if (userData[chatId].editing === 'position') {
      userData[chatId].data.position = data;
      delete userData[chatId].editing;
    } else {
      userData[chatId].data.position = data;
      userData[chatId].step = 'experience';
      return ctx.editMessageText("Sertifikatingiz, qaysi vaqtlarda ishlay olishingiz va tajribangiz haqida qisqacha yozing: \n\n (Masalan: IELTS: 7; To'liq kunlik / Tushlikgacha / Tushlikdan keyin; 2 yil o'qitishda tajribam bor)");
    }
  }

  if (data === 'submit_application' && userData[chatId]) {

    const app = {
      id: Date.now().toString(),
      userId: chatId,
      date: todayDate(),
      status: 'Yangi',
      ...userData[chatId].data
    };

    db.applications.push(app);
    saveDB();

    if (app.photo) {
      await ctx.replyWithPhoto(app.photo, { caption: formatApplication(app) });
      if (process.env.HR_GROUP_ID)
        await ctx.telegram.sendPhoto(process.env.HR_GROUP_ID, app.photo, { caption: formatApplication(app) });
    } else {
      await ctx.reply(formatApplication(app));
    }

    delete userData[chatId];

    return ctx.reply("Rahmat! Arizangiz muvaffaqiyatli qabul qilindi. \n 3 ish kuni ichida natija bo‘yicha siz bilan bog‘lanamiz.");
  }

  await ctx.answerCbQuery();
});

bot.on('text', async (ctx) => {

  if (!ctx.message || !ctx.message.text) return; // ✅ FIX

  const chatId = ctx.chat.id.toString();
  const text = ctx.message.text;

  if (userData[chatId]) {

    const step = userData[chatId].step;

    if (step === 'name') {
      userData[chatId].data.name = text;
      userData[chatId].step = 'age';
      return ctx.reply('Yoshingiz nechida? \n (Faqat raqam kiriting!)');
    }

    if (step === 'age') {
      if (isNaN(text)) return ctx.reply('Faqat raqam kiriting!');
      userData[chatId].data.age = text;
      userData[chatId].step = 'phone';
      return ctx.reply('Telefon raqamingizni kiriting: \n (Masalan: +998901234567)');
    }

    if (step === 'phone') {
      userData[chatId].data.phone = text;
      userData[chatId].step = 'branch';
      return ctx.reply('Qaysi filialda ishlamoqchisiz?',
        Markup.inlineKeyboard(branches.map(b => [Markup.button.callback(b, b)]))
      );
    }

    if (step === 'experience') {
      userData[chatId].data.experience = text;
      userData[chatId].step = 'photo';
      return ctx.reply("O‘zingizning rasm (foto)ingizni yuklang! \n (Rasm yubormasangiz arizangiz ko'rib chiqilmaydi!)");
    }

    if (userData[chatId].editing) {
      userData[chatId].data[userData[chatId].editing] = text;
      delete userData[chatId].editing;

      if (userData[chatId].data.photo) {
        await ctx.replyWithPhoto(userData[chatId].data.photo, {
          caption: formatApplication(userData[chatId].data)
        });
      } else {
        await ctx.reply(formatApplication(userData[chatId].data));
      }

      return ctx.reply('Ariza yangilandi ✅', Markup.inlineKeyboard([
        [Markup.button.callback('Yuborish', 'submit_application')],
        [Markup.button.callback('Tahrirlash', 'edit_menu')]
      ]));
    }
  }

  if (adminData[chatId]) {

  const { appId, action } = adminData[chatId];
  const app = db.applications.find(a => a.id === appId);
  if (!app) return;

  const actionText = action === 'Qabul qilingan'
    ? 'Tabriklaymiz, sizning arizangiz qabul qilindi!'
    : 'Afsuski sizning arizangiz rad qilindi!';

  try {
    await ctx.telegram.sendMessage(app.userId, `${actionText}\n\n${text}`);
    app.status = action;
    app.adminComment = text;
    saveDB();
    delete adminData[chatId];
    return ctx.reply('Javob yuborildi ✅');
  } catch (err) {
    console.log(err);
    return ctx.reply('Xabar yuborishda xatolik.');
  }
}

});

bot.on('photo', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  if (!userData[chatId] || userData[chatId].step !== 'photo') return;

  userData[chatId].data.photo = ctx.message.photo.at(-1).file_id;

  await ctx.replyWithPhoto(userData[chatId].data.photo, {
    caption: formatApplication(userData[chatId].data)
  });

  await ctx.reply('Arizangiz tayyor ✅', Markup.inlineKeyboard([
    [Markup.button.callback('Yuborish', 'submit_application')],
    [Markup.button.callback('Tahrirlash', 'edit_menu')]
  ]));
});

function exportExcel(ctx) {
  const data = db.applications.map(a => ({
    Sana: a.date,
    Filial: a.branch,
    Lavozim: a.position,
    Ism: a.name,
    Yosh: a.age,
    Telefon: a.phone,
    Malumot: a.experience,
    Status: a.status,
    Admin_Izoh: a.adminComment || ''
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Applications');

  const filePath = path.join(__dirname, 'data', `applications.xlsx`);
  XLSX.writeFile(wb, filePath);

  ctx.telegram.sendDocument(process.env.ADMIN_ID, { source: filePath });
}

bot.catch((err) => {
  console.error("BOT ERROR:", err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const app = express();

app.get('/', (req, res) => {
  res.send('Bot ishlayapti 🚀');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

bot.launch();
console.log('HR bot ishlayapti 🚀');
