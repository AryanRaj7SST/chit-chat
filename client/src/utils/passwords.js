const common = new Set(["password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop", "letmein123", "welcome123", "iloveyou", "admin123", "secret123", "abc12345"]);
export function passwordError(value) {
  if ([...value].length < 8) return "Password must be at least 8 characters";
  if (new TextEncoder().encode(value).length > 72) return "Password must be at most 72 UTF-8 bytes";
  if (common.has(value.toLowerCase().trim())) return "Choose a less common password";
  return null;
}
