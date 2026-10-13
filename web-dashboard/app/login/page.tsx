"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@globalmfg.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        // 1. Store in localStorage for Axios interceptor
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("role", data.role);
        
        // 2. Set Cookie for Next.js Edge Middleware route protection
        document.cookie = `auth_token=${data.access_token}; path=/; max-age=604800; samesite=strict`;
        
        router.push("/dashboard");
      } else {
        const err = await res.json();
        setError(err.detail || "Login failed");
      }
    } catch (err) {
      setError("Failed to connect to the backend server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-900 p-8 text-center">
          <ShieldAlert className="text-red-500 w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white tracking-tight">EHS Global</h1>
          <p className="text-slate-400 mt-2">Safety Enforcement Platform</p>
        </div>
        
        <form onSubmit={handleLogin} className="p-8 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:border-blue-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:border-blue-500"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 rounded-lg transition-colors"
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>
        
        <div className="bg-slate-50 p-4 text-center text-xs text-slate-500 border-t border-slate-100">
          <strong>Demo Accounts:</strong><br />
          Admin: <code>admin@globalmfg.com</code> | <code>admin123</code><br />
          Inspector: <code>inspector@globalmfg.com</code> | <code>inspector123</code>
        </div>
      </div>
    </div>
  );
}
