import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function createOrUpdateUser(userData) {
    return prisma.user.upsert({
        where: { id: userData.uid },
        update: {
            email: userData.email,
            name: userData.displayName
        },
        create: {
            id: userData.uid,
            email: userData.email,
            name: userData.displayName
        }
    });
}

export async function saveMessage(userId, content, role) {
    return prisma.message.create({
        data: {
            content,
            role,
            userId
        }
    });
}

export async function getUserMessages(userId) {
    return prisma.message.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' }
    });
}

export default prisma;
