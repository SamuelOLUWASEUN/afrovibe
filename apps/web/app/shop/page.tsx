import type { Metadata } from "next";
import { Suspense } from "react";
import { ShopScreen } from "@/components/shop-screen";
import { SiteHeader } from "@/components/site-header";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "Shop · Wetin You Talk?" };

export default function ShopPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* useSearchParams (for ?purchase=) needs a Suspense boundary to keep this page static. */}
        <Suspense fallback={<Spinner label="Opening the shop…" />}>
          <ShopScreen />
        </Suspense>
      </main>
    </>
  );
}
