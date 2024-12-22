// Initialize Firebase after fetching config
async function setupFirebase() {
    try {
        // Use relative path for API endpoint
        const response = await fetch('/api/config');
        if (!response.ok) {
            throw new Error('Failed to fetch Firebase configuration. Please ensure the server is running.');
        }
        const { firebaseConfig } = await response.json();
        
        // Check if Firebase is already initialized
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        return firebase.auth();
    } catch (error) {
        console.error('Error initializing Firebase:', error);
        const loginButton = document.getElementById('loginButton');
        if (loginButton) {
            loginButton.innerHTML = `<span style="color: #ff0000;">Server connection error: ${error.message}</span>`;
            setTimeout(() => {
                loginButton.innerHTML = '<img src="https://www.google.com/favicon.ico" alt="Google" style="width: 1.25rem; height: 1.25rem;"/><span>Access the Matrix with Google</span>';
            }, 3000);
        }
        throw error;
    }
}

async function setupLoginPage() {
    const loginButton = document.getElementById('loginButton');
    if (!loginButton) return;
    
    try {
        const auth = await setupFirebase();
        const provider = new firebase.auth.GoogleAuthProvider();

        // Check if we're already authenticated via cookie
        try {
            // First check if we have a valid session
            const response = await fetch('/chat.html', {
                credentials: 'include'
            });
            
            // If we can access chat.html, we have a valid session
            if (response.ok) {
                window.location.replace('/chat.html');
                return;
            }
        } catch (error) {
            console.error('Session check failed:', error);
        }

        // Check for redirect result
        try {
            const result = await auth.getRedirectResult();
            if (result.user) {
                const idToken = await result.user.getIdToken();
                // Verify token with server to set secure cookie
                const response = await fetch('/api/verify-token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ token: idToken }),
                    credentials: 'include'
                });
                
                if (!response.ok) {
                    throw new Error('Token verification failed');
                }
                
                window.location.replace('/chat.html');
                return;
            }
        } catch (error) {
            if (error.code !== 'auth/null-redirect-result') {
                console.error('Redirect result error:', error);
            }
        }

        // Check current auth state
        const currentUser = auth.currentUser;
        if (currentUser) {
            const idToken = await currentUser.getIdToken();
            // Verify token with server to set secure cookie
            const response = await fetch('/api/verify-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token: idToken }),
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('Token verification failed');
            }
            
            window.location.replace('/chat.html');
            return;
        }

        loginButton.addEventListener('click', async () => {
            try {
                loginButton.disabled = true;
                loginButton.style.opacity = '0.7';
                loginButton.innerHTML = '<span>Accessing the Matrix...</span>';
                
                // Clear any existing token
                sessionStorage.removeItem('authToken');
                
                // Use redirect instead of popup
                await auth.signInWithRedirect(provider);
                // The page will redirect to Google sign-in
            } catch (error) {
                console.error('Login error:', error);
                loginButton.disabled = false;
                loginButton.style.opacity = '1';
                
                loginButton.innerHTML = `<span style="color: #ff0000;">Access denied: ${error.message}</span>`;
                setTimeout(() => {
                    loginButton.innerHTML = '<img src="https://www.google.com/favicon.ico" alt="Google" style="width: 1.25rem; height: 1.25rem;"/><span>Access the Matrix with Google</span>';
                }, 3000);
            }
        });

    } catch (error) {
        console.error('Setup error:', error);
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.innerHTML = `<span style="color: #ff0000;">System initialization failed: ${error.message}</span>`;
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', setupLoginPage);
