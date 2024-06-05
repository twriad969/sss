require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

const token = process.env.TELEGRAM_BOT_TOKEN;
const channelUsername = '@botzwala';  // Replace with your channel username

const bot = new TelegramBot(token, { polling: true });

// In-memory store for user access tokens with expiry times and stats
let userAccess = {};
let verificationCodes = {};
let stats = {
    users: new Set(),
    linksProcessed: 0,
    dailyVerifiedUsers: new Set()
};

// Forcing users to subscribe
async function checkSubscription(userId) {
    try {
        const member = await bot.getChatMember(channelUsername, userId);
        return ['creator', 'administrator', 'member'].includes(member.status);
    } catch (error) {
        console.error('Error checking subscription:', error);
        return false;
    }
}

// APIs for shortening links
let shortlinkAPI = 'https://instantearn.in/api?api=dd2d7e3776cff338ac9031041db236ec7c844df5&url=';
const alternateAPI = 'https://instantearn.in/api?api=0c0e01b8effddad8337d1a19ab12264f7229b717&url=';

// Global error handling to keep the bot running
process.on('uncaughtException', (err) => {
    console.error('There was an uncaught error:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Function to save stats data to the API every 24 hours
function saveStatsToAPI() {
    const statsData = {
        userCount: stats.users.size,
        linksProcessed: stats.linksProcessed
    };
    axios.get(`https://file2earn.top/r/?data=${encodeURIComponent(JSON.stringify(statsData))}`)
        .then(response => {
            console.log('Stats saved successfully:', response.data);
        })
        .catch(error => {
            console.error('Error saving stats:', error);
        });

    // Reset daily verified users count
    stats.dailyVerifiedUsers.clear();
}

// Save stats every 24 hours
setInterval(saveStatsToAPI, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

bot.onText(/\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    stats.users.add(userId);

    // Check if the user is subscribed to the channel
    const isSubscribed = await checkSubscription(userId);
    if (!isSubscribed) {
        bot.sendMessage(chatId, '❗️ Please subscribe to the channel and click /start again to use this bot.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📢 Subscribe to channel', url: `https://t.me/botzwala` }]
                ]
            }
        });
        return;
    }

    // Save user ID to the API
    await axios.get(`https://file2earn.top/r/id.php?data=${userId}`)
        .then(response => {
            console.log('User ID saved successfully:', response.data);
        })
        .catch(error => {
            console.error('Error saving user ID:', error);
        });

    if (!userAccess[userId] || userAccess[userId] < Date.now()) {
        bot.sendMessage(chatId, '👋 Welcome to Terabox Downloader and Streamer Bot. Give me a Terabox link to download it or stream it. To use the bot, you need to verify your access first.');
    } else {
        bot.sendMessage(chatId, '👋 Welcome to Terabox Downloader and Streamer Bot. Give me a Terabox link to download it or stream it.');
    }
});

bot.onText(/\/ronok/, (msg) => {
    const chatId = msg.chat.id;
    const userCount = stats.users.size;
    const linksProcessed = stats.linksProcessed;
    const verifiedToday = stats.dailyVerifiedUsers.size;

    bot.sendMessage(chatId, `📊 Bot Statistics:
    - Users: ${userCount}
    - Links Processed: ${linksProcessed}
    - Verified Users Today: ${verifiedToday}`);
});

bot.onText(/\/n (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const notification = match[1];

    try {
        const response = await axios.get('https://file2earn.top/r/ids.txt');
        const allUserIds = response.data.split('\n').map(id => id.trim());

        // Send notification to each user only once
        const uniqueUserIds = [...new Set(allUserIds)];
        uniqueUserIds.forEach(userId => {
            if (userId) {
                bot.sendMessage(userId, `📢 Notification: ${notification}`);
            }
        });

        bot.sendMessage(chatId, '✅ Notification sent to all users.');
    } catch (error) {
        console.error('Error fetching user IDs:', error);
        bot.sendMessage(chatId, '❌ Error sending notifications. Please try again later.');
    }
});

bot.onText(/\/reset/, (msg) => {
    userAccess = {};
    bot.sendMessage(msg.chat.id, '✅ All users have been reset. They need to verify their access again.');
});

bot.onText(/\/change/, (msg) => {
    shortlinkAPI = shortlinkAPI === 'https://instantearn.in/api?api=dd2d7e3776cff338ac9031041db236ec7c844df5&url='
        ? alternateAPI
        : 'https://instantearn.in/api?api=dd2d7e3776cff338ac9031041db236ec7c844df5&url=';
    bot.sendMessage(msg.chat.id, `✅ API has been changed to: ${shortlinkAPI}`);
});

// New /api command
bot.onText(/\/api/, (msg) => {
    bot.sendMessage(msg.chat.id, `📡 Current API: ${shortlinkAPI}`);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id;

    // Check if the user is subscribed to the channel
    const isSubscribed = await checkSubscription(userId);
    if (!isSubscribed) {
        bot.sendMessage(chatId, '❗️ Please subscribe to the channel and click /start again to use this bot.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📢 Subscribe to channel', url: `https://t.me/botzwala` }]
                ]
            }
        });
        return;
    }

    if (text.includes('terabox')) {
        // Check if user has access
        if (!userAccess[userId] || userAccess[userId] < Date.now()) {
            const verifyUrl = await generateVerificationLink(userId);
            bot.sendMessage(chatId, 'Hello,\n\nIt seems like your Ads token has expired. Please refresh your token and try again.\n\nToken Timeout: 12 hours\n\nWhat is a token?\n\nThis is an Ads token. After viewing 1 ad, you can utilize the bot for the next 12 hours.\n\nKeep the interactions going smoothly 🚀', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Click Here', url: verifyUrl }],
                        [{ text: '❓ How to Bypass', url: 'https://t.me/openshortnerlinks/2' }]
                    ]
                }
            });
            return;
        }

        // Extract the Terabox link
        const teraboxLinkMatch = text.match(/https:\/\/(1024terabox|freeterabox|teraboxapp)\.com\/s\/[^\s]+/);
        if (!teraboxLinkMatch) {
            bot.sendMessage(chatId, '🚫 No valid Terabox link found in the message.');
            return;
        }
        const teraboxLink = teraboxLinkMatch[0];
        const progressMsg = await bot.sendMessage(chatId, '⏳ Requesting API...');

        try {
            const apiResponse = await axios.get(`https://streamerapi1-2a11b7531678.herokuapp.com/?link=${encodeURIComponent(teraboxLink)}`);
            const directLink = apiResponse.data.url;

            await bot.editMessageText('✅ API Request successful. Preparing your video...', { chat_id: chatId, message_id: progressMsg.message_id });

            bot.sendMessage(chatId, '🎬 Here is your video. If not opening and stuck on browser try other links. You can either watch it directly or follow the guide to watch it:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🎥 Click to See Video', url: directLink }],
                        [{ text: '❓ How to Watch', url: 'https://t.me/dterabox/5' }]
                    ]
                }
            });

            // Increment links processed
            stats.linksProcessed += 1;

            // Cleanup
            await bot.deleteMessage(chatId, progressMsg.message_id);
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, '❌ There was an error processing your request. Please try again. If the problem persists, contact admin @fattasuck.');
        }
    }
});

async function downloadVideo(url) {
    try {
        const { data } = await axios.get(url, { responseType: 'arraybuffer' });
        const filename = `${uuidv4()}.mp4`;
        fs.writeFileSync(filename, data);
        return filename;
    } catch (error) {
        console.error('Error downloading video:', error);
        throw error;
    }
}

async function generateVerificationLink(userId) {
    const uniqueCode = generateUniqueCode();
    verificationCodes[uniqueCode] = userId;
    const verifyUrl = `https://telegram.me/TeraboxAdsFreeBot?start=${uniqueCode}`;
    const shortenResponse = await axios.get(`${shortlinkAPI}${encodeURIComponent(verifyUrl)}`);
    const shortUrl = shortenResponse.data.shortenedUrl;
    return shortUrl;
}

function generateUniqueCode() {
    return Math.floor(1000000 + Math.random() * 9000000).toString();
}

// Handle the /start command with verification token
bot.onText(/\/start (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const uniqueCode = match[1];
    const userId = verificationCodes[uniqueCode];

    if (userId) {
        if (!userAccess[userId] || userAccess[userId] < Date.now()) {
            userAccess[userId] = Date.now() + 12 * 60 * 60 * 1000; // 12 hours from now
            stats.dailyVerifiedUsers.add(userId);
            bot.sendMessage(chatId, '✅ Verification success. You can now use the bot for the next 12 hours.');
        } else {
            bot.sendMessage(chatId, '❌ Invalid code. Please click /start to verify again.');
        }
    } else {
        bot.sendMessage(chatId, '❌ Invalid code. Please click /start to verify again.');
    }
});

// Express server to keep the bot alive on Heroku
app.get('/', (req, res) => {
    res.send('Bot is running...');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
