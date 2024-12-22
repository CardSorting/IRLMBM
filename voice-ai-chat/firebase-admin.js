import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountPath = join(__dirname, '..', 'cred', 'irlmbm-firebase-adminsdk-p4dxq-35e9808542.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

const admin = initializeApp({
    credential: cert(serviceAccount)
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
