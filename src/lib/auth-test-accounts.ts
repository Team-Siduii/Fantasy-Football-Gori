export type AuthTestAccountPreset = {
  id: string;
  label: string;
  role: "manager" | "admin";
  name: string;
  email: string;
  teamName: string;
  password: string;
  inviteCode?: string;
};

export const AUTH_TEST_ACCOUNT_PRESETS: AuthTestAccountPreset[] = [
  {
    id: "johan-swart",
    label: "Johan Swart",
    role: "manager",
    name: "Johan Swart",
    email: "Johan201@hotmail.com",
    teamName: "Kies teamnaam",
    password: "unused-after-setup",
    inviteCode: "WK-JOHAN-2026",
  },
  {
    id: "thomas-bart",
    label: "Thomas",
    role: "manager",
    name: "Thomas",
    email: "Thomasbart91@gmail.com",
    teamName: "Kies teamnaam",
    password: "unused-after-setup",
    inviteCode: "WK-THOMAS-2026",
  },
  {
    id: "jack-van-der-reep",
    label: "Jack",
    role: "manager",
    name: "Jack",
    email: "Jackvandereep@hotmail.com",
    teamName: "Kies teamnaam",
    password: "unused-after-setup",
    inviteCode: "WK-JACK-2026",
  },
  {
    id: "emiel-zomerdijk",
    label: "Emiel Zomerdijk",
    role: "manager",
    name: "Emiel Zomerdijk",
    email: "emielzomerdijk@gmail.com",
    teamName: "Kies teamnaam",
    password: "unused-after-setup",
    inviteCode: "WK-EMIEL-2026",
  },
  {
    id: "sim-duindam-manager",
    label: "Sim",
    role: "manager",
    name: "Sim Duindam",
    email: "s.j.m.duindam@gmail.com",
    teamName: "Kies teamnaam",
    password: "unused-after-setup",
    inviteCode: "WK-SIM-ADMIN-2026",
  },
  {
    id: "sim-duindam-admin",
    label: "Sim Duindam (Admin)",
    role: "admin",
    name: "Sim Duindam",
    email: "s.j.m.duindam@gmail.com",
    teamName: "Admin Console",
    password: "unused-after-setup",
    inviteCode: "WK-SIM-ADMIN-2026",
  },
  {
    id: "admin",
    label: "Test Admin",
    role: "admin",
    name: "League Admin",
    email: "admin@gori.local",
    teamName: "Admin Console",
    password: "admin1234",
  },
];
