import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { verifyToken } from './firebase-admin.js';
import { createOrUpdateUser, saveMessage, getUserMessages } from './lib/prisma.js';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Configure CORS with specific options
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));

app.use(express.json());

// Add security headers middleware
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
});

app.use(express.static('.')); // Serve static files

// Handle client-side routing
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: '.' });
});

app.get('/chat.html', (req, res) => {
    res.sendFile('chat.html', { root: '.' });
});

// Handle 404s by redirecting to index.html
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        next();
    } else {
        res.sendFile('index.html', { root: '.' });
    }
});

if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set in environment variables');
    process.exit(1);
}

// Authentication middleware
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decodedToken = await verifyToken(token);
        if (!decodedToken) {
            return res.status(403).json({ error: 'Invalid token' });
        }

        // Create or update user in database
        await createOrUpdateUser({
            uid: decodedToken.uid,
            email: decodedToken.email,
            displayName: decodedToken.name || decodedToken.email?.split('@')[0]
        });

        req.userId = decodedToken.uid;
    } catch (error) {
        console.error('Auth error:', error);
        return res.status(403).json({ error: 'Authentication failed' });
    }
    next();
}

// Serve Firebase configuration
app.get('/api/config', (req, res) => {
    res.json({
        firebaseConfig: {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID,
            measurementId: process.env.FIREBASE_MEASUREMENT_ID
        }
    });
});

// Get chat history
app.get('/api/messages', authenticateToken, async (req, res) => {
    try {
        const messages = await getUserMessages(req.userId);
        res.json({ messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/chat', authenticateToken, async (req, res) => {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful AI assistant engaging in voice conversation. Keep responses concise and natural."
                    },
                    {
                        role: "user",
                        content: req.body.message
                    }
                ],
                max_tokens: 150
            })
        });

        if (!response.ok) {
            throw new Error('OpenAI API request failed');
        }

            const data = await response.json();
            const aiResponse = data.choices[0].message.content;
            
            // Save both user message and AI response
            await saveMessage(req.userId, req.body.message, 'user');
            await saveMessage(req.userId, aiResponse, 'assistant');
            
            res.json({ response: aiResponse });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
