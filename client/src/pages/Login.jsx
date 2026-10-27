import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import AuthLayout, { Field } from "../components/AuthLayout";
import { useAuth } from "../hooks/useAuth";
import { getErrorMessage } from "../services/api";
import { isValidEmail } from "../utils/format";

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!isValidEmail(form.email.trim())) return setError("Please enter a valid email address");
    if (!form.password) return setError("Password is required");
    try {
      setBusy(true);
      await login(form.email.trim(), form.password);
      toast.success("Welcome back!");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue chatting"
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="font-medium text-primary-ink hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" type="email" name="email" value={form.email} onChange={update} autoComplete="email" placeholder="you@example.com" />
        <Field label="Password" type="password" name="password" value={form.password} onChange={update} autoComplete="current-password" placeholder="Your password" />
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger-ink">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 brand-gradient rounded-xl py-2.5 text-sm font-semibold text-on-primary shadow-sm transition disabled:cursor-not-allowed"
        >
          {busy && <Loader2 className="h-4 w-4" />}
          {busy ? "Logging in..." : "Log in"}
        </button>
      </form>
    </AuthLayout>
  );
}
