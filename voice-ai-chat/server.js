import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { verifyToken } from './firebase-admin.js';
import { createOrUpdateUser, saveMessage, getUserMessages } from './lib/prisma.js';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// Initialize middleware
app.use(express.json());
app.use(cookieParser());

// Configure CORS with specific options
app.use(cors({
    origin: true,
    credentials: true
}));

// Serve static files with proper headers
app.use(express.static('.', {
    setHeaders: (res, path) => {
        res.removeHeader('Cross-Origin-Opener-Policy');
    }
}));

// Auth check middleware for protected routes
async function checkAuth(req, res, next) {
    // Skip auth check for static files and auth-related paths
    if (
        req.path.endsWith('.js') || 
        req.path.endsWith('.css') || 
        req.path.endsWith('.svg') ||
        req.path === '/auth.html' || 
        req.path === '/api/config' || 
        req.path === '/api/verify-token'
    ) {
        return next();
    }

    const token = req.cookies.session;

    if (!token) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        return res.redirect('/auth.html');
    }

    try {
        const decodedToken = await verifyToken(token);
        if (!decodedToken) {
            res.clearCookie('session');
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({ error: 'Invalid token' });
            }
            return res.redirect('/auth.html');
        }
        req.userId = decodedToken.uid;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.clearCookie('session');
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Authentication failed' });
        }
        return res.redirect('/auth.html');
    }
}

// Apply auth check to all routes except auth-related ones
app.use(checkAuth);


// Session middleware to set secure cookie on successful token verification
async function setSessionCookie(res, token) {
    try {
        const decodedToken = await verifyToken(token);
        if (decodedToken) {
            // Set cookie with path to ensure it's sent for all requests
            res.cookie('session', token, {
                httpOnly: true,
                secure: false, // Allow non-HTTPS in development
                path: '/',
                maxAge: 3600000 // 1 hour
            });
            return decodedToken;
        }
        return null;
    } catch (error) {
        console.error('Session error:', error);
        return null;
    }
}

// Authentication middleware
async function authenticateToken(req, res, next) {
    const token = req.cookies.session;

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decodedToken = await verifyToken(token);
        if (!decodedToken) {
            res.clearCookie('session');
            return res.status(403).json({ error: 'Invalid token' });
        }

        // Create or update user in database
        await createOrUpdateUser({
            uid: decodedToken.uid,
            email: decodedToken.email,
            displayName: decodedToken.name || decodedToken.email?.split('@')[0]
        });

        req.userId = decodedToken.uid;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.clearCookie('session');
        return res.status(403).json({ error: 'Authentication failed' });
    }
}

// Redirect root to auth page
app.get('/', (req, res) => {
    res.redirect('/auth.html');
});

// API Routes
app.post('/api/verify-token', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decodedToken = await verifyToken(token);
        if (!decodedToken) {
            return res.status(403).json({ error: 'Invalid token' });
        }

        // Set session cookie
        await setSessionCookie(res, token);
        res.json({ success: true });
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(403).json({ error: 'Token verification failed' });
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('session');
    res.json({ success: true });
});

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
    if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

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

// Handle 404s
app.use((req, res) => {
    if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'API endpoint not found' });
    } else {
        res.status(404).sendFile('auth.html', { root: '.' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
