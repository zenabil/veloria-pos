// Veloria PoS — Design System primitives (single source of UI truth).
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return twMerge(clsx(...parts));
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "outline";
}): ReactNode {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-emerald-400 text-black hover:bg-emerald-300",
        variant === "ghost" && "bg-transparent text-slate-200 hover:bg-white/5",
        variant === "outline" &&
          "border border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.07]",
        variant === "danger" &&
          "bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25",
        className,
      )}
    />
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-white/[0.07] bg-[#141a23] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-red-300">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput(
  props: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> },
): ReactNode {
  const { ref, ...rest } = props;
  return (
    <input
      ref={ref}
      {...rest}
      className={cn(
        "w-full rounded-[10px] border border-white/10 bg-[#0e1319] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500",
        props.className,
      )}
    />
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="text-sm font-bold uppercase tracking-widest text-slate-400">{title}</div>
      {hint ? <div className="max-w-sm text-sm text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}): ReactNode {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-extrabold tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </Card>
  );
}
