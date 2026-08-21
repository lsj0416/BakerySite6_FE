import { CatalogBrowser } from "@/components/catalog-browser";
import type { ProductCategory } from "@/lib/api/product";

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; kind?: string; sort?: string }>;
}) {
  const { category, kind, sort } = await searchParams;
  return (
    <CatalogBrowser
      initialCategory={category as ProductCategory | undefined}
      initialKind={kind === "DROP" ? "DROP" : undefined}
      initialSort={sort === "new" ? "new" : undefined}
    />
  );
}
