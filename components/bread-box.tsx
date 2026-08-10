import { COLORS } from "@/lib/theme";

export function BreadBox({
  label = "",
  className = "",
  src,
  dim = false,
}: {
  label?: string;
  className?: string;
  src?: string;
  dim?: boolean;
}) {
  if (src) {
    return (
      // ⚠️ position은 caller가 className으로 정한다(relative/absolute 등) — 여기서 relative를
      // 같이 넣으면 caller가 "absolute inset-0"을 넘겨도 Tailwind 생성 순서에 따라 relative가
      // 이겨버려 이 div가 부모(예: 고정 높이 히어로)에 꽉 차지 않고 이미지 원본 비율대로
      // 늘어나(overflow) 아래 콘텐츠를 침범하는 버그가 났었다.
      <div className={`overflow-hidden ${className}`}>
        {/* 백엔드/판매자가 자유 입력한 URL이라 도메인을 미리 알 수 없어 next/image 대신 일반 img를 씀. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          className={`w-full h-full object-cover ${dim ? "brightness-50 grayscale" : ""}`}
        />
      </div>
    );
  }
  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center ${className}`}
      style={{
        background:
          "radial-gradient(ellipse at 38% 35%, #F3E2CF 0%, #E8D4BF 55%, #D8BFA6 100%)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 40% 40%, rgba(139,94,60,0.12) 0%, transparent 65%)",
        }}
      />
      {label && (
        <span
          className="text-[11px] font-medium tracking-wide text-center px-2 z-10"
          style={{ color: COLORS.muted }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
