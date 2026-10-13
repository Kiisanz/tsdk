import { createUser } from '@acme/domain';

const user = createUser('Alice');
console.log(`[Acme.Api] Created user: ${user.name} (${user.id})`);
