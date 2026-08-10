import type { DropProductInfoResponse } from "@/lib/api/drop";
import { toDropStatus, type DropStatus } from "@/lib/types";

export const CATEGORIES = [
  {
    slug: "bread",
    label: "식빵·모닝빵",
    shortLabel: "식빵",
    description: "매일 먹기 좋은 담백한 식사빵",
    emoji: "🍞",
    keywords: ["식빵", "모닝", "토스트", "브레드"],
  },
  {
    slug: "bagel",
    label: "베이글·샌드위치",
    shortLabel: "베이글",
    description: "쫄깃한 베이글과 든든한 한 끼",
    emoji: "🥯",
    keywords: ["베이글", "샌드위치"],
  },
  {
    slug: "pastry",
    label: "크루아상·페이스트리",
    shortLabel: "페이스트리",
    description: "겹겹이 바삭한 버터 풍미",
    emoji: "🥐",
    keywords: ["크루아상", "크로와상", "페이스트리", "파이", "데니쉬"],
  },
  {
    slug: "dessert",
    label: "케이크·디저트",
    shortLabel: "디저트",
    description: "오늘을 달콤하게 만드는 디저트",
    emoji: "🍰",
    keywords: ["케이크", "디저트", "타르트", "마카롱", "쿠키", "초콜릿"],
  },
  {
    slug: "healthy",
    label: "건강빵·비건",
    shortLabel: "건강빵",
    description: "재료를 가볍게, 맛은 든든하게",
    emoji: "🌾",
    keywords: ["비건", "통밀", "호밀", "건강", "저당", "글루텐"],
  },
  {
    slug: "gift",
    label: "선물세트",
    shortLabel: "선물",
    description: "마음을 담아 건네는 베이커리 선물",
    emoji: "🎁",
    keywords: ["선물", "세트", "기프트"],
  },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export interface CatalogProduct {
  id: number;
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  remainQuantity: number;
  status: DropStatus;
  category: CategorySlug;
  href: string;
  kind: "DROP";
}

export function findCategory(slug: string) {
  return CATEGORIES.find((category) => category.slug === slug);
}

function inferCategory(name: string, description: string): CategorySlug {
  const source = `${name} ${description}`.toLocaleLowerCase("ko-KR");
  return (
    CATEGORIES.find((category) =>
      category.keywords.some((keyword) => source.includes(keyword.toLocaleLowerCase("ko-KR"))),
    )?.slug ?? "bread"
  );
}

export function dropToCatalogProduct(drop: DropProductInfoResponse): CatalogProduct {
  return {
    id: drop.dropId,
    name: drop.name,
    description: drop.description,
    imageUrl: drop.imageUrl,
    price: drop.price,
    remainQuantity: drop.remainQuantity,
    status: toDropStatus(drop.dropStatus, drop.remainQuantity),
    category: inferCategory(drop.name, drop.description),
    href: `/drops/${drop.dropId}`,
    kind: "DROP",
  };
}

export function filterProducts(products: CatalogProduct[], query: string) {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  if (!normalized) return products;
  return products.filter((product) =>
    `${product.name} ${product.description}`.toLocaleLowerCase("ko-KR").includes(normalized),
  );
}
