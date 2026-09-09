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
      <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-3 sm:px-6 sm:py-4">
        <Link
          href="/"
          className="brand-font text-3xl font-bold tracking-wide text-green-900"
        >
          Parlay Money Machine
        </Link>

        <nav className="flex items-center gap-3 text-sm font-semibold sm:gap-6">
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
                className="max-w-[120px] truncate text-gray-500 transition hover:text-gray-900 sm:max-w-[180px]"
              >
                {displayName || email}
              </Link>

              <button
                onClick={signOut}
                className="rounded-lg bg-gray-900 px-3 py-2 text-white transition hover:bg-gray-700 sm:px-4"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-gray-900 px-3 py-2 text-white transition hover:bg-gray-700 sm:px-4"
            >
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}