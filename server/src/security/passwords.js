import bcrypt from "bcryptjs";
export const commonPasswords = new Set(["password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop", "letmein123", "welcome123", "iloveyou", "admin123", "secret123", "abc12345"]);
export function passwordError(password) {
  if (typeof password !== "string" || [...password].length < 8) return "Password must be at least 8 characters";
  if (Buffer.byteLength(password, "utf8") > 72) return "Password must be at most 72 UTF-8 bytes";
  if (commonPasswords.has(password.toLowerCase().trim())) return "Choose a less common password";
  return null;
}
// Fixed non-user input, generated once per process with the same cost as new accounts.
export const dummyHash = bcrypt.hashSync("not-a-user-password-dummy-comparison", 12);
