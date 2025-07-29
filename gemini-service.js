const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('Gemini API key is required');
        }
        
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: {
                temperature: 0.7,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 1024,
            }
        });
        
        // System prompt for the chatbot
        this.systemPrompt = `You are a helpful WhatsApp AI assistant. Your responses should be:
- Friendly and conversational
- Concise but informative (keep responses under 200 words when possible)
- Use emojis appropriately to make conversations engaging
- Be helpful and try to provide practical solutions
- If you don't know something, admit it honestly
- Avoid overly technical language unless specifically asked
- Remember this is a WhatsApp chat, so format responses accordingly`;
    }

    async generateResponse(userMessage, context = {}) {
        try {
            // Prepare the conversation context
            let prompt = this.systemPrompt + "\n\n";
            
            if (context.userName) {
                prompt += `User's name: ${context.userName}\n`;
            }
            
            if (context.chatType) {
                prompt += `Chat type: ${context.chatType}\n`;
            }
            
            if (context.previousMessages && context.previousMessages.length > 0) {
                prompt += "Recent conversation context:\n";
                context.previousMessages.forEach(msg => {
                    prompt += `${msg.sender}: ${msg.text}\n`;
                });
                prompt += "\n";
            }
            
            prompt += `Current user message: ${userMessage}\n\nPlease respond as the AI assistant:`;
            
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            return {
                success: true,
                response: text.trim(),
                usage: {
                    promptTokens: result.response.usageMetadata?.promptTokenCount || 0,
                    completionTokens: result.response.usageMetadata?.candidatesTokenCount || 0,
                    totalTokens: result.response.usageMetadata?.totalTokenCount || 0
                }
            };
            
        } catch (error) {
            console.error('Gemini API Error:', error);
            
            // Handle specific error types
            if (error.message.includes('API_KEY')) {
                return {
                    success: false,
                    error: 'Invalid API key. Please check your Gemini API configuration.',
                    fallbackResponse: '❌ Sorry, there\'s an issue with the AI service configuration.'
                };
            } else if (error.message.includes('QUOTA_EXCEEDED')) {
                return {
                    success: false,
                    error: 'API quota exceeded.',
                    fallbackResponse: '⚠️ AI service is temporarily unavailable due to quota limits.'
                };
            } else if (error.message.includes('SAFETY')) {
                return {
                    success: false,
                    error: 'Content filtered by safety settings.',
                    fallbackResponse: '🚫 Sorry, I cannot respond to that type of content.'
                };
            } else {
                return {
                    success: false,
                    error: error.message,
                    fallbackResponse: '😅 Sorry, I\'m having trouble processing that right now. Please try again!'
                };
            }
        }
    }

    async generateSmartReply(messageType, content) {
        try {
            let prompt = '';
            
            switch (messageType) {
                case 'image':
                    prompt = 'The user sent an image. Generate a friendly response acknowledging the image and asking if they need help with anything related to it.';
                    break;
                case 'document':
                    prompt = 'The user sent a document. Generate a helpful response offering to help them with document-related questions.';
                    break;
                case 'audio':
                    prompt = 'The user sent an audio message. Generate a friendly response acknowledging the audio and offering assistance.';
                    break;
                case 'video':
                    prompt = 'The user sent a video. Generate an engaging response about the video and offer help if needed.';
                    break;
                default:
                    prompt = `Generate a helpful response to this message: "${content}"`;
            }
            
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
            
        } catch (error) {
            console.error('Smart reply generation error:', error);
            return '👋 Thanks for sharing! How can I help you today?';
        }
    }

    // Method to analyze message sentiment and intent
    async analyzeMessage(message) {
        try {
            const prompt = `Analyze this message and return a JSON object with sentiment (positive/negative/neutral) and intent (question/request/greeting/complaint/other):
            
Message: "${message}"

Return only valid JSON in this format:
{
  "sentiment": "positive|negative|neutral",
  "intent": "question|request|greeting|complaint|other",
  "confidence": 0.0-1.0
}`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().trim();
            
            // Try to parse JSON response
            try {
                return JSON.parse(text);
            } catch (parseError) {
                // Fallback if JSON parsing fails
                return {
                    sentiment: 'neutral',
                    intent: 'other',
                    confidence: 0.5
                };
            }
            
        } catch (error) {
            console.error('Message analysis error:', error);
            return {
                sentiment: 'neutral',
                intent: 'other',
                confidence: 0.0
            };
        }
    }
}

module.exports = GeminiService;

