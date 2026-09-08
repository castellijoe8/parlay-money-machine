"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function Header() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setDisplayName(null);
        setEmail(null);
        return;
      }

      setEmail(user.email ?? null);

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      setDisplayName(profile?.display_name ?? null);
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setDisplayName(null);
        setEmail(null);
        return;
      }

      setEmail(session.user.email ?? null);
      loadUser();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="brand-font text-5xl font-bold tracking-wide text-green-900"
        >
          Parlay Money Machine
        </Link>

        <nav className="flex items-center gap-6 text-sm font-semibold">
          <Link
            href="/"
            className="text-gray-600 transition hover:text-gray-900"
          >
            Home
          </Link>

          <Link
            href="/wagers"
            className="text-gray-600 transition hover:text-gray-900"
          >
            My Bets
          </Link>

          <Link
            href="/friends"
            className="text-gray-600 transition hover:text-gray-900"
          >
            Friends
          </Link>

          <Link
            href="/leaderboard"
            className="text-gray-600 transition hover:text-gray-900"
          >
            Leaderboard
          </Link>

          {email ? (
            <>
              <Link
                href="/profile"
                className="hidden max-w-[180px] truncate text-gray-500 transition hover:text-gray-900 lg:inline"
              >
                {displayName || email}
              </Link>

              <button
                onClick={signOut}
                className="rounded-lg bg-gray-900 px-4 py-2 text-white transition hover:bg-gray-700"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-gray-900 px-4 py-2 text-white transition hover:bg-gray-700"
            >
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}