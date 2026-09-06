"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function signUp() {
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Account created! Check your email to confirm your account.");
  }

  async function signIn() {
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-4xl font-bold">Parlay Money Machine</h1>

        <p className="mt-2 text-slate-400">
          Sign in if you're retarded.
        </p>

        <div className="mt-8 space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl bg-slate-800 px-4 py-3 text-white outline-none"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl bg-slate-800 px-4 py-3 text-white outline-none"
          />

          <button
            onClick={signIn}
            className="w-full rounded-xl bg-white px-6 py-3 font-bold text-slate-950"
          >
            Sign In
          </button>

          <button
            onClick={signUp}
            className="w-full rounded-xl border border-slate-700 px-6 py-3 font-bold"
          >
            Create Account
          </button>
        </div>

        {message && (
          <div className="mt-6 rounded-xl bg-slate-800 p-4 text-center text-sm">
            {message}
          </div>
        )}
      </div>
    </main>
  );
}