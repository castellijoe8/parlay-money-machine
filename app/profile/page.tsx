"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

export default function ProfilePage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadProfile() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Please sign in to view your profile.");
      setLoading(false);
      return;
    }

    setEmail(user.email ?? "");

    const { data, error } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Profile error:", error);
      setMessage("Unable to load your profile.");
      setLoading(false);
      return;
    }

    setDisplayName(data?.display_name ?? "");
    setLoading(false);
  }

  useEffect(() => {
    // This effect intentionally loads profile data from Supabase on mount.
    // The async operation updates local state as the external data arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProfile();
  }, []);

  async function saveProfile() {
    const trimmedName = displayName.trim();

    if (!trimmedName) {
      setMessage("Please enter a profile name.");
      return;
    }

    if (trimmedName.length < 3) {
      setMessage("Profile name must be at least 3 characters.");
      return;
    }

    if (trimmedName.length > 20) {
      setMessage("Profile name must be 20 characters or fewer.");
      return;
    }

    setSaving(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Please sign in to update your profile.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        display_name: trimmedName,
      },
      {
        onConflict: "id",
      }
    );

    if (error) {
      console.error("Profile save error:", error);

      if (error.code === "23505") {
        setMessage("That profile name is already taken.");
      } else {
        setMessage("Unable to save your profile.");
      }

      setSaving(false);
      return;
    }

    setDisplayName(trimmedName);
    setMessage("Profile name saved.");
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-gray-500">Loading your profile...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900">Profile</h1>

        <p className="mt-1 text-gray-500">
          Choose the name other players will see.
        </p>

        <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <label
            htmlFor="displayName"
            className="block text-sm font-semibold text-gray-900"
          >
            Profile Name
          </label>

          <p className="mt-1 text-sm text-gray-500">
            This name will be displayed throughout Parlay Money Machine.
          </p>

          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={20}
            placeholder="Enter your profile name"
            className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
          />

          <p className="mt-2 text-xs text-gray-400">3–20 characters</p>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="mt-5 rounded-lg bg-gray-900 px-5 py-3 font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>

          {message && (
            <p className="mt-4 text-sm font-medium text-gray-700">{message}</p>
          )}

          {email && (
            <div className="mt-8 border-t border-gray-100 pt-5">
              <p className="text-sm text-gray-500">Account Email</p>

              <p className="mt-1 text-sm font-medium text-gray-900">
                {email}
              </p>

              <p className="mt-1 text-xs text-gray-400">
                Your email is used for login and is not your public profile
                name.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}