import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">Welcome back, {user.email}</h1>
      <p className="mt-2 text-black/60">
        No training plan yet. Goal setting and the coach chat land in Phase
        1.
      </p>
      <form action="/auth/signout" method="post" className="mt-8">
        <button className="rounded-md border border-black/10 px-4 py-2">
          Sign out
        </button>
      </form>
    </div>
  );
}
