export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col">
      {children}
    </div>
  );
}
