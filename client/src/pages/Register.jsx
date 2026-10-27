import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import AuthLayout, { Field } from "../components/AuthLayout";
import { useAuth } from "../hooks/useAuth";
import { getErrorMessage } from "../services/api";
import { isValidEmail } from "../utils/format";

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const name = form.name.trim();
    const email = form.email.trim();
    if (name.length < 2) return setError("Name must be at least 2 characters");
    if (!isValidEmail(email)) return setError("Please enter a valid email address");
    if (form.password.length < 6) return setError("Password must be at least 6 characters");
    try {
      setBusy(true);
      await register(name, email, form.password);
      toast.success("Account created!");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start chatting in real time"
      footer={
        <>
          Already registered?{" "}
          <Link to="/login" className="font-medium text-primary-ink hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" name="name" value={form.name} onChange={update} autoComplete="name" placeholder="Your name" />
        <Field label="Email" type="email" name="email" value={form.email} onChange={update} autoComplete="email" placeholder="you@example.com" />
        <Field label="Password" type="password" name="password" value={form.password} onChange={update} autoComplete="new-password" placeholder="At least 6 characters" />
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger-ink">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 brand-gradient rounded-xl py-2.5 text-sm font-semibold text-on-primary shadow-sm transition disabled:cursor-not-allowed"
        >
          {busy && <Loader2 className="h-4 w-4" />}
          {busy ? "Creating account..." : "Sign up"}
        </button>
      </form>
    </AuthLayout>
  );
}
