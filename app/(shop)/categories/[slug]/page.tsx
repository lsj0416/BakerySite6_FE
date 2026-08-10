import { CatalogBrowser } from "@/components/catalog-browser";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CatalogBrowser categorySlug={slug} />;
}
