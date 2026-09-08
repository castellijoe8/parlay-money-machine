"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Header() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setEmail(user?.email ?? null);
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
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
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <a
          href="/"
          className="text-xl font-bold text-gray-900"
        >
          Friendly Wager
        </a>

        <nav className="flex items-center gap-5 text-sm font-semibold">
          <a
            href="/"
            className="text-gray-600 hover:text-gray-900"
          >
            Home
          </a>

          <a
            href="/wagers"
            className="text-gray-600 hover:text-gray-900"
          >
            My Wagers
          </a>

          <a
            href="/friends"
            className="text-gray-600 hover:text-gray-900"
          >
            Friends' Wagers
          </a>

          <a
            href="/leaderboard"
            className="text-gray-600 hover:text-gray-900"
          >
            Leaderboard
          </a>

          {email ? (
            <>
              <span className="hidden text-gray-500 sm:inline">
                {email}
              </span>

              <button
                onClick={signOut}
                className="rounded-lg bg-gray-900 px-4 py-2 text-white hover:bg-gray-700"
              >
                Sign Out
              </button>
            </>
          ) : (
            <a
              href="/login"
              className="rounded-lg bg-gray-900 px-4 py-2 text-white hover:bg-gray-700"
            >
              Sign In
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}