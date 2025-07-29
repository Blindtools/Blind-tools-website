const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const GeminiService = require('./gemini-service');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI service
let geminiService = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    try {
        geminiService = new GeminiService(process.env.GEMINI_API_KEY);
        console.log('✅ Gemini AI service initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize Gemini AI service:', error.message);
    }
} else {
    console.warn('⚠️ Gemini API key not found. AI features will be disabled.');
}

// Store conversation context (in production, use a database)
const conversationContext = new Map();

// Middleware
app.use(express.json());

// Initialize WhatsApp client with local authentication
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "whatsapp-chatbot"
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

// QR Code generation for authentication
client.on('qr', (qr) => {
    console.log('QR Code received, scan it with your phone:');
    qrcode.generate(qr, { small: true });
});

// Client ready event
client.on('ready', () => {
    console.log('WhatsApp client is ready!');
});

// Handle authentication
client.on('authenticated', () => {
    console.log('WhatsApp client authenticated successfully!');
});

client.on('auth_failure', (msg) => {
    console.error('Authentication failed:', msg);
});

// Handle disconnection
client.on('disconnected', (reason) => {
    console.log('WhatsApp client disconnected:', reason);
});

// Message handler
client.on('message', async (message) => {
    try {
        console.log(`Received message from ${message.from}: ${message.body}`);
        
        // Ignore messages from status broadcast
        if (message.from === 'status@broadcast') {
            return;
        }

        // Ignore messages sent by the bot itself
        if (message.fromMe) {
            return;
        }

        // Get contact info
        const contact = await message.getContact();
        const chat = await message.getChat();
        const chatId = message.from;
        
        // Basic command handling
        const messageBody = message.body.toLowerCase().trim();
        
        // Handle special commands first
        if (messageBody === '!ping') {
            await message.reply('🏓 Pong! Bot is working!');
            return;
        } 
        
        if (messageBody === '!help') {
            const helpMessage = `🤖 *WhatsApp AI Chatbot Commands:*\n\n` +
                `• !ping - Test if bot is working\n` +
                `• !help - Show this help message\n` +
                `• !info - Get chat information\n` +
                `• !time - Get current time\n` +
                `• !clear - Clear conversation context\n` +
                `• !status - Check AI service status\n\n` +
                `💬 *Just send any message and I'll respond with AI!*`;
            await message.reply(helpMessage);
            return;
        }
        
        if (messageBody === '!info') {
            const chatInfo = `📊 *Chat Information:*\n\n` +
                `• Chat Name: ${chat.name || 'N/A'}\n` +
                `• Contact Name: ${contact.name || contact.pushname || 'Unknown'}\n` +
                `• Phone Number: ${contact.number}\n` +
                `• Is Group: ${chat.isGroup ? 'Yes' : 'No'}\n` +
                `• Message Type: ${message.type}\n` +
                `• AI Service: ${geminiService ? '✅ Active' : '❌ Disabled'}`;
            await message.reply(chatInfo);
            return;
        }
        
        if (messageBody === '!time') {
            const currentTime = new Date().toLocaleString();
            await message.reply(`🕐 Current time: ${currentTime}`);
            return;
        }
        
        if (messageBody === '!clear') {
            conversationContext.delete(chatId);
            await message.reply('🗑️ Conversation context cleared!');
            return;
        }
        
        if (messageBody === '!status') {
            const statusMessage = `🔧 *Bot Status:*\n\n` +
                `• WhatsApp Client: ✅ Connected\n` +
                `• AI Service: ${geminiService ? '✅ Active' : '❌ Disabled'}\n` +
                `• Server Uptime: ${Math.floor(process.uptime())} seconds\n` +
                `• Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`;
            await message.reply(statusMessage);
            return;
        }

        // Handle different message types
        if (message.type === 'image') {
            if (geminiService) {
                const response = await geminiService.generateSmartReply('image');
                await message.reply(response);
            } else {
                await message.reply('📸 Nice image! Unfortunately, AI features are currently disabled.');
            }
            return;
        }

        if (message.type === 'document') {
            if (geminiService) {
                const response = await geminiService.generateSmartReply('document');
                await message.reply(response);
            } else {
                await message.reply('📄 Thanks for the document! AI analysis is currently unavailable.');
            }
            return;
        }

        if (message.type === 'ptt' || message.type === 'audio') {
            if (geminiService) {
                const response = await geminiService.generateSmartReply('audio');
                await message.reply(response);
            } else {
                await message.reply('🎵 Got your audio message! AI features are currently disabled.');
            }
            return;
        }

        if (message.type === 'video') {
            if (geminiService) {
                const response = await geminiService.generateSmartReply('video');
                await message.reply(response);
            } else {
                await message.reply('🎥 Thanks for the video! AI analysis is currently unavailable.');
            }
            return;
        }

        // Handle text messages with AI
        if (message.type === 'chat' && message.body.trim()) {
            if (!geminiService) {
                await message.reply('🤖 AI service is currently disabled. Please configure your Gemini API key.');
                return;
            }

            try {
                // Show typing indicator
                await chat.sendStateTyping();

                // Get or create conversation context
                if (!conversationContext.has(chatId)) {
                    conversationContext.set(chatId, {
                        messages: [],
                        userName: contact.name || contact.pushname || 'User',
                        chatType: chat.isGroup ? 'group' : 'individual'
                    });
                }

                const context = conversationContext.get(chatId);
                
                // Add user message to context
                context.messages.push({
                    sender: context.userName,
                    text: message.body,
                    timestamp: new Date()
                });

                // Keep only last 10 messages for context
                if (context.messages.length > 10) {
                    context.messages = context.messages.slice(-10);
                }

                // Generate AI response
                const aiResult = await geminiService.generateResponse(message.body, {
                    userName: context.userName,
                    chatType: context.chatType,
                    previousMessages: context.messages.slice(-5) // Last 5 messages for context
                });

                if (aiResult.success) {
                    // Add AI response to context
                    context.messages.push({
                        sender: 'AI Assistant',
                        text: aiResult.response,
                        timestamp: new Date()
                    });

                    await message.reply(aiResult.response);
                    
                    // Log usage for monitoring
                    console.log(`AI Response generated for ${chatId}:`, {
                        tokens: aiResult.usage,
                        responseLength: aiResult.response.length
                    });
                } else {
                    await message.reply(aiResult.fallbackResponse || '😅 Sorry, I\'m having trouble right now. Please try again!');
                    console.error('AI Generation failed:', aiResult.error);
                }

            } catch (error) {
                console.error('Error in AI message handling:', error);
                await message.reply('❌ Sorry, there was an error processing your message. Please try again!');
            }
        }
        
    } catch (error) {
        console.error('Error handling message:', error);
        await message.reply('❌ Sorry, there was an unexpected error.');
    }
});

// Express routes for health check and status
app.get('/', (req, res) => {
    res.json({
        status: 'WhatsApp Chatbot Server Running',
        timestamp: new Date().toISOString(),
        clientReady: client.info ? true : false
    });
});

app.get('/status', (req, res) => {
    res.json({
        clientState: client.info ? 'ready' : 'not ready',
        clientInfo: client.info || null,
        uptime: process.uptime()
    });
});

// Start the Express server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

// Initialize WhatsApp client
client.initialize();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await client.destroy();
    process.exit(0);
});

