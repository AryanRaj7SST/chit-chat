import BrandIcon from "./BrandIcon";
import ThemeToggle from "./ThemeToggle";

export function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-text">{label}</span>
      <input
        {...props}
        className="w-full rounded-xl border border-border bg-input px-3.5 py-3 text-sm text-text outline-none transition-colors duration-150 focus:border-primary focus:ring-[3px] focus:ring-primary/20"
      />
    </label>
  );
}

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth-shell relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-20">
      <div aria-hidden="true" className="auth-blob pointer-events-none absolute inset-0" />
      <div className="absolute right-4 top-4 z-10 rounded-full border border-border bg-surface"><ThemeToggle /></div>
      <div className="panel relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandIcon className="mb-2 h-16 w-16" /><p className="mb-3 text-sm font-semibold text-primary-ink">chit-chat</p>
          <h1 className="text-2xl font-semibold text-text">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        {children}
        <p className="mt-4 text-center text-sm text-muted">{footer}</p>
      </div>
    </div>
  );
}
