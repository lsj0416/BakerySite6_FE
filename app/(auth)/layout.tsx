export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col px-0 sm:justify-center sm:py-8">
      <div className="flex min-h-dvh flex-1 flex-col overflow-hidden bg-white sm:min-h-0 sm:rounded-[28px] sm:border sm:shadow-sm">
        {children}
      </div>
    </div>
  );
}
