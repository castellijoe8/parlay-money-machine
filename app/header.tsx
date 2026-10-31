"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/daily-edge", label: "Daily Edge" },
  { href: "/wagers", label: "My Bets" },
  { href: "/friends", label: "Friends" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
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

    void loadUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setDisplayName(null);
        setEmail(null);
      } else {
        setEmail(session.user.email ?? null);
        void loadUser();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <>
      <header className="sportsbook-header sticky top-0 z-50">
        <div className="sportsbook-header-inner">
          <Link href="/" className="sportsbook-brand" aria-label="Parlay Money Machine home">
            <span className="brand-mark">P</span>
            <span><strong>PARLAY</strong><small>MONEY MACHINE</small></span>
          </Link>
          <nav className="sportsbook-nav" aria-label="Main navigation">
            {navigation.map(({ href, label }) => (
              <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={pathname === href ? "is-active" : ""}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="sportsbook-account">
            {email ? (
              <>
                <Link href="/profile" className="account-profile" title="Profile">
                  <span className="account-avatar">{(displayName || email).slice(0, 1).toUpperCase()}</span>
                  <span className="account-name">{displayName || "My profile"}</span>
                </Link>
                <button onClick={signOut} className="sign-out-button">Sign out</button>
              </>
            ) : <Link href="/login" className="sign-in-button">Sign in</Link>}
          </div>
        </div>
      </header>
      <nav className="mobile-dock" aria-label="Mobile navigation">
        {navigation.map(({ href, label }) => (
          <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={pathname === href ? "is-active" : ""}>
            <span className="dock-glyph" aria-hidden="true">{label === "Home" ? "⌂" : label === "Daily Edge" ? "✳" : label === "My Bets" ? "▤" : label === "Friends" ? "♧" : "♙"}</span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
