export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col">
      {children}
    </div>
  );
}
