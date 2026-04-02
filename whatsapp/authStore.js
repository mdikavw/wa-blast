import { prisma } from '../lib/prisma';

export async function getKey(id) {
	const data = await prisma.whatsAppAuth.findUnique({
		where: { id },
	});

	return data?.value || null;
}

export async function setKey(id, value) {
	await prisma.whatsAppAuth.upsert({
		where: { id },
		update: { value },
		create: { id, value },
	});
}
