// Initialize Firebase after fetching config
async function setupFirebase() {
    try {
        const response = await fetch('http://localhost:3000/api/config');
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
        throw error;
    }
}

async function setupLoginPage() {
    const loginButton = document.getElementById('loginButton');
    
    try {
        const auth = await setupFirebase();
        const provider = new firebase.auth.GoogleAuthProvider();

        // Check if user is already logged in
        auth.onAuthStateChanged((user) => {
            if (user) {
                window.location.href = '/chat.html';
            }
        });

        loginButton.addEventListener('click', async () => {
            loginButton.disabled = true;
            
            try {
                const result = await auth.signInWithPopup(provider);
                if (result.user) {
                    window.location.href = '/chat.html';
                }
            } catch (error) {
                console.error('Login error:', error);
                loginButton.disabled = false;
                
                // Only show alert for actual errors, not when user closes popup
                if (error.code !== 'auth/popup-closed-by-user') {
                    alert('Login failed. Please try again.');
                }
            }
        });

    } catch (error) {
        console.error('Setup error:', error);
        // Don't show alert on initial setup error
        loginButton.disabled = false;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', setupLoginPage);
