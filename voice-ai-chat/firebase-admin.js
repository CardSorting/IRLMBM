import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize with service account from file
const admin = initializeApp({
    credential: cert('../cred/irlmbm-firebase-adminsdk-p4dxq-35e9808542.json')
});

export const auth = getAuth(admin);

export async function verifyToken(token) {
    try {
        const decodedToken = await auth.verifyIdToken(token);
        const { uid, email, name } = decodedToken;
        return {
            uid,
            email,
            name: name || email?.split('@')[0] // Fallback to username from email if name is not present
        };
    } catch (error) {
        console.error('Error verifying token:', error);
        return null;
    }
}
