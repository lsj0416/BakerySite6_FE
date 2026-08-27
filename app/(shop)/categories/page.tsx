import { CatalogBrowser } from "@/components/catalog-browser";
import type { ProductCategory } from "@/lib/api/product";

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string }>;
}) {
  const { category, sort } = await searchParams;
  return (
    <CatalogBrowser
      initialCategory={category as ProductCategory | undefined}
      initialSort={sort === "new" ? "new" : undefined}
    />
  );
}
