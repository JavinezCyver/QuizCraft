import { get, run } from "../server/db.mjs";
const emailIndex = process.argv.indexOf("--email");
const email =
  emailIndex >= 0 ? process.argv[emailIndex + 1] : process.env.ADMIN_EMAIL;
if (!email || !email.includes("@")) {
  console.error("Usage: npm run admin -- --email you@example.com");
  process.exit(1);
}
const user = get(
  "SELECT id FROM users WHERE email=?",
  email.toLowerCase().trim(),
);
if (!user) {
  console.error(
    "Register this account first, then grant access from this trusted server terminal.",
  );
  process.exit(1);
}
run("UPDATE users SET admin=1 WHERE id=?", user.id);
console.log(
  "Administrator role granted. Reload the app to load your updated permissions.",
);
