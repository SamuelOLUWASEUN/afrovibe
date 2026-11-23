import type { Metadata } from "next";
import { ProfileScreen } from "@/components/profile-screen";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Your profile · Wetin You Talk?" };

export default function ProfilePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <ProfileScreen />
      </main>
    </>
  );
}
