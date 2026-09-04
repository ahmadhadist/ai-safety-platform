"use client";
import { useState, useEffect } from "react";
import { Users, Plus, Shield, User as UserIcon, Mail } from "lucide-react";
import { api } from "@/lib/api";

type User = {
  id: string;
  full_name: string;
  email: string;
  role: string;
};

export default function TeamPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "INSPECTOR"
  });

  const fetchUsers = async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/users", formData);
      setShowModal(false);
      setFormData({ full_name: "", email: "", password: "", role: "INSPECTOR" });
      fetchUsers();
    } catch (error) {
      alert("Gagal menambahkan user. Pastikan email belum terdaftar.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Users className="text-indigo-500 w-8 h-8" /> 
            Team Access
          </h2>
          <p className="text-slate-500 mt-1">Kelola akses akun pekerja lapangan dan manajer K3 (SSO Terintegrasi).</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2"
        >
          <Plus size={20} /> Add Inspector
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
            <tr>
              <th className="p-4">Name</th>
              <th className="p-4">Email / SSO ID</th>
              <th className="p-4">Role</th>
              <th className="p-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={4} className="p-4 text-center">Loading...</td></tr>
            ) : (
              users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                        <UserIcon size={20} />
                      </div>
                      <span className="font-semibold text-slate-900">{u.full_name}</span>
                    </div>
                  </td>
                  <td className="p-4 text-slate-600">
                    <div className="flex items-center gap-2">
                      <Mail size={16} className="text-slate-400" />
                      {u.email}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                      u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                      u.role === 'PLANT_MANAGER' ? 'bg-blue-100 text-blue-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      <Shield size={12} className="inline mr-1" />
                      {u.role}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <span className="text-emerald-500 text-sm font-medium bg-emerald-50 px-2 py-1 rounded">Active</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Add New Team Member</h3>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input 
                  type="text" required
                  value={formData.full_name}
                  onChange={e => setFormData({...formData, full_name: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email / SSO Identifier</label>
                <input 
                  type="email" required
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Temporary Password (For Demo)</label>
                <input 
                  type="password" required
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select 
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2"
                >
                  <option value="INSPECTOR">Field Inspector</option>
                  <option value="PLANT_MANAGER">Plant Manager</option>
                  <option value="ADMIN">System Admin</option>
                </select>
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium">Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
