import { useId } from "react";

export default function BrandIcon({ className = "h-10 w-10" }) {
  const id = useId();
  return <svg viewBox="0 0 1024 1024" className={className} aria-hidden="true" focusable="false"><defs><linearGradient id={id} x2="0" y2="1"><stop stopColor="var(--brand-top, var(--primary))" /><stop offset="1" stopColor="var(--primary-hover)" /></linearGradient></defs><rect x="64" y="64" width="896" height="896" rx="210" fill={`url(#${id})`} /><path fill="#fff" d="M840 491c0 151-147 273-328 273-28 0-55-3-80-8-39-6-93 50-137 45-1-14 55-48 45-77C245 676 183 590 183 491c0-151 147-273 329-273s328 122 328 273Z" /></svg>;
}
