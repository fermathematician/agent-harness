export interface User {
  id: number;
  name: string;
  email: string;
  active: boolean;
  age: number;
}

export interface UserSummary {
  total: number;
  active: number;
  inactive: number;
  adults: number;
  averageAge: number | null;
  activeEmails: string[];
}

export function summarizeUsers(users: readonly User[]): UserSummary {
  const total = users.length;
  const activeEmails: string[] = [];

  let active = 0;
  let adults = 0;
  let ageSum = 0;

  for (const user of users) {
    if (user.active) {
      active += 1;
      activeEmails.push(user.email);
    }

    if (user.age >= 18) {
      adults += 1;
    }

    ageSum += user.age;
  }

  return {
    total,
    active,
    inactive: total - active,
    adults,
    averageAge: total === 0 ? null : ageSum / total,
    activeEmails,
  };
}
