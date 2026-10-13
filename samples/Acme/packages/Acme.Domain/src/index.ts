export interface User {
  id: string;
  name: string;
}

export function createUser(name: string): User {
  return { id: 'usr_1', name };
}
