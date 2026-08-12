import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// The proxy (src/proxy.ts) already redirects unauthenticated requests away
// from these routes, but each Server Function should still verify auth
// itself per Next.js's data-security guidance — a matcher change elsewhere
// shouldn't silently remove this protection.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <nav className="flex items-center gap-6 border-b border-black/10 px-6 py-4">
        <Link href="/dashboard" className="font-bold">
          Running Coach
        </Link>
        <Link href="/dashboard" className="text-sm text-black/60 hover:text-black">
          Dashboard
        </Link>
        <Link href="/goals/new" className="text-sm text-black/60 hover:text-black">
          Set Goal
        </Link>
        <Link href="/plan" className="text-sm text-black/60 hover:text-black">
          Plan
        </Link>
        <Link href="/chat" className="text-sm text-black/60 hover:text-black">
          Coach Chat
        </Link>
        <form action="/auth/signout" method="post" className="ml-auto">
          <button className="text-sm text-black/60 hover:text-black">
            Sign out
          </button>
        </form>
      </nav>
      <main>{children}</main>
    </div>
  );
}
