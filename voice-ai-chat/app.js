// Initialize Firebase after fetching config
async function setupFirebase() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) {
            throw new Error('Failed to fetch Firebase configuration');
        }
        const { firebaseConfig } = await response.json();
        
        // Check if Firebase is already initialized
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        return firebase.auth();
    } catch (error) {
        console.error('Error initializing Firebase:', error);
        alert('Failed to initialize application. Please try again later.');
        throw error;
    }
}

class VoiceAIChat {
    constructor(auth) {
        this.auth = auth;
        
        // Check authentication and handle token persistence
        this.auth.onAuthStateChanged(async (user) => {
            try {
                // First check if we have a valid session
                const response = await fetch('/chat.html', {
                    credentials: 'include'
                });
                
                if (!response.ok) {
                    // No valid session, check if we have a user to get a new token
                    if (!user) {
                        window.location.replace('/auth.html');
                        return;
                    }

                    // Get fresh token and verify with server
                    const token = await user.getIdToken(true);
                    const verifyResponse = await fetch('/api/verify-token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ token }),
                        credentials: 'include'
                    });
                    
                    if (!verifyResponse.ok) {
                        throw new Error('Token verification failed');
                    }
                }

                // Set up token refresh if we have a user
                if (user) {
                    this.setupTokenRefresh(user);
                }
                
                // Load chat history
                await this.loadChatHistory();
            } catch (error) {
                console.error('Auth state error:', error);
                await this.auth.signOut();
                window.location.replace('/auth.html');
            }
        });

        // Initialize UI elements
        this.startButton = document.getElementById('startButton');
        this.logoutButton = document.getElementById('logoutButton');
        this.chatContainer = document.getElementById('chatContainer');
        this.statusDiv = document.getElementById('status');
        
        // Initialize Web Speech API
        this.recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        
        this.setupEventListeners();
    }

    setupTokenRefresh(user) {
        // Refresh token and cookie every 30 minutes
        setInterval(async () => {
            try {
                const token = await user.getIdToken(true);
                const response = await fetch('/api/verify-token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ token }),
                    credentials: 'include'
                });
                
                if (!response.ok) {
                    throw new Error('Token refresh failed');
                }
            } catch (error) {
                console.error('Token refresh error:', error);
                window.location.replace('/auth.html');
            }
        }, 30 * 60 * 1000);
    }

    setupEventListeners() {
        // Logout button event listener
        this.logoutButton.addEventListener('click', async () => {
            try {
                this.logoutButton.disabled = true;
                // Clear server-side session first
                const response = await fetch('/api/logout', {
                    method: 'POST',
                    credentials: 'include'
                });
                
                if (!response.ok) {
                    throw new Error('Failed to clear session');
                }
                
                // Then sign out of Firebase
                await this.auth.signOut();
                window.location.replace('/auth.html');
            } catch (error) {
                console.error('Logout error:', error);
                alert('Failed to logout. Please try again.');
                this.logoutButton.disabled = false;
            }
        });

        this.startButton.addEventListener('click', () => this.toggleListening());
        
        this.recognition.onstart = () => {
            this.isListening = true;
            this.startButton.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path>
                </svg>
                <span>Stop Neural Link</span>`;
            this.startButton.classList.remove('bg-primary', 'hover:bg-primary-dark');
            this.startButton.classList.add('bg-red-500', 'hover:bg-red-600');
            this.updateStatus('Neural link active...', 'text-primary');
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this.startButton.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                </svg>
                <span>Initialize Neural Link</span>`;
            this.startButton.classList.remove('bg-red-500', 'hover:bg-red-600');
            this.startButton.classList.add('bg-primary', 'hover:bg-primary-dark');
            this.updateStatus('Neural link ready...');
        };

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            this.addMessage('user', transcript);
            this.getAIResponse(transcript);
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.updateStatus(`Neural link error: ${event.error}`, 'text-red-500');
            this.isListening = false;
            this.startButton.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                </svg>
                <span>Initialize Neural Link</span>`;
            this.startButton.classList.remove('bg-red-500', 'hover:bg-red-600');
            this.startButton.classList.add('bg-primary', 'hover:bg-primary-dark');
        };
    }

    updateStatus(message, colorClass = '') {
        this.statusDiv.className = 'text-center mb-4 transition-all duration-300';
        if (colorClass) {
            this.statusDiv.classList.add(colorClass, 'font-medium');
        } else {
            this.statusDiv.classList.add('text-gray-600');
        }
        this.statusDiv.textContent = message;
    }

    async loadChatHistory() {
        try {
            this.updateStatus('Loading neural archive...', 'text-primary');
            const response = await fetch('/api/messages', {
                credentials: 'include'
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    // Token expired or invalid, try to refresh
                    const token = await this.auth.currentUser?.getIdToken(true);
                    if (token) {
                        // Verify new token with server
                        const verifyResponse = await fetch('/api/verify-token', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ token }),
                            credentials: 'include'
                        });
                        
                        if (verifyResponse.ok) {
                            return this.loadChatHistory(); // Retry with new token
                        }
                    }
                }
                throw new Error('Failed to load neural archive');
            }

            const { messages } = await response.json();
            this.chatContainer.innerHTML = ''; // Clear existing messages
            
            messages.forEach(message => {
                this.addMessage(message.role === 'user' ? 'user' : 'ai', message.content);
            });
            this.updateStatus('Neural link ready...');
        } catch (error) {
            console.error('Error loading chat history:', error);
            this.updateStatus('Neural archive access denied', 'text-red-500');
            if (error.message.includes('authentication')) {
                setTimeout(() => {
                    window.location.replace('/auth.html');
                }, 2000);
            }
        }
    }

    toggleListening() {
        if (this.isListening) {
            this.recognition.stop();
        } else {
            this.recognition.start();
        }
    }

    addMessage(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${sender}-message`);
        messageDiv.textContent = text;
        this.chatContainer.appendChild(messageDiv);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    async getAIResponse(userInput) {
        this.startButton.disabled = true;
        this.updateStatus('Processing neural input...', 'text-primary');
        
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    message: userInput
                })
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    // Token expired or invalid, try to refresh
                    const token = await this.auth.currentUser?.getIdToken(true);
                    if (token) {
                        // Verify new token with server
                        const verifyResponse = await fetch('/api/verify-token', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ token }),
                            credentials: 'include'
                        });
                        
                        if (verifyResponse.ok) {
                            return this.getAIResponse(userInput); // Retry with new token
                        }
                    }
                }
                throw new Error('Neural processing failed');
            }

            const data = await response.json();
            const aiResponse = data.response;
            
            this.addMessage('ai', aiResponse);
            this.speak(aiResponse);
            
        } catch (error) {
            console.error('Error details:', error);
            this.updateStatus('Neural processing error: ' + error.message, 'text-red-500');
            this.addMessage('ai', 'Neural link disrupted. Please reinitialize connection.');
            
            if (error.message.includes('authentication')) {
                setTimeout(() => {
                    window.location.replace('/auth.html');
                }, 2000);
            } else {
                setTimeout(() => {
                    this.updateStatus('Neural link ready...');
                }, 3000);
            }
        } finally {
            this.startButton.disabled = false;
        }
    }

    speak(text) {
        // Stop any ongoing speech
        this.synthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => {
            this.updateStatus('Neural link ready...');
        };
        this.synthesis.speak(utterance);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const auth = await setupFirebase();
        new VoiceAIChat(auth);
    } catch (error) {
        console.error('Initialization error:', error);
    }
});
