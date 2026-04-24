export type AuthTestAccountPreset = {
  id: string;
  label: string;
  role: "manager" | "admin";
  name: string;
  email: string;
  teamName: string;
  password: string;
};

export const AUTH_TEST_ACCOUNT_PRESETS: AuthTestAccountPreset[] = [
  {
    id: "manager",
    label: "Test Manager",
    role: "manager",
    name: "Manager",
    email: "manager@gori.local",
    teamName: "FC Slot",
    password: "gori1234",
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
