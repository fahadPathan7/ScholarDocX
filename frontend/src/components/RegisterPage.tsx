import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { api } from "../lib/api";

export function RegisterPage() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post<any>("/auth/register", {
        email,
        password,
        display_name: displayName,
        invite_code: inviteCode
      });
      
      if (response && response.status === "success") {
        // Redirect to login on success
        navigate("/login", { state: { message: "Registration successful. Please log in." } });
      }
    } catch (err: any) {
      setError(err.message || "Registration failed. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-950 py-12 px-4 sm:px-6 lg:px-8 overflow-y-auto">
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-8 shadow-xl mt-auto mb-auto">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
            <UserPlus size={24} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">Create Account</h1>
          <p className="mt-2 text-sm text-zinc-400">Join ScholarDock with your invite code</p>
        </div>

        {error && (
          <div className="mb-6 rounded-md bg-red-500/10 p-3 text-sm text-red-500 border border-red-500/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300" htmlFor="inviteCode">
              Invite Code
            </label>
            <input
              id="inviteCode"
              type="text"
              required
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="e.g. SCHOLAR-2026-XYZ"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300" htmlFor="displayName">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              required
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Jane Doe"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="3-10 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300" htmlFor="confirmPassword">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-6"
          >
            {loading ? "Registering..." : "Create Account"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-zinc-400">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-emerald-500 hover:text-emerald-400">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
