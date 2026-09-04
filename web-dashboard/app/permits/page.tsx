"use client";
import { useState, useEffect } from "react";
import { ClipboardList, AlertCircle, ShieldAlert, CheckCircle, Plus, X, Users } from "lucide-react";
import { api } from "@/lib/api";

type Permit = {
  id: string;
  permit_code: string;
  contractor_company: string;
  contractor_lead_name: string;
  location_zone: string;
  status: "APPROVED" | "SUSPENDED" | "COMPLETED";
  dynamic_rules: any;
  worker_manifest: any[];
};

export default function PermitsPage() {
  const [permits, setPermits] = useState<Permit[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create Modal State
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    template_id: "",
    permit_code: `HW-${Math.floor(Math.random()*10000)}`,
    contractor_company: "",
    contractor_lead_name: "",
    location_zone: "",
    start_time: new Date().toISOString(),
    end_time: new Date(Date.now() + 86400000).toISOString(),
    worker_names: ""
  });

  const fetchData = async () => {
    try {
      const [permitsRes, templatesRes] = await Promise.all([
        api.get("/permits"),
        api.get("/policies/templates")
      ]);
      setPermits(permitsRes.data);
      setTemplates(templatesRes.data);
      if(templatesRes.data.length > 0) {
        setFormData(prev => ({...prev, template_id: templatesRes.data[0].id}));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleResolve = async (permitId: string) => {
    try {
      await api.post(`/permits/${permitId}/resolve`);
      alert("Izin kerja berhasil dipulihkan (APPROVED).");
      fetchData();
    } catch (error) {
      alert("Gagal memulihkan izin.");
    }
  };
  
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const manifest = formData.worker_names.split(",").map(name => ({ name: name.trim() })).filter(n => n.name !== "");
    
    try {
      await api.post("/permits", {
        ...formData,
        worker_manifest: manifest
      });
      setShowModal(false);
      fetchData();
      setFormData(prev => ({...prev, permit_code: `HW-${Math.floor(Math.random()*10000)}`, worker_names: ""}));
    } catch (error) {
      alert("Gagal membuat permit baru.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <ClipboardList className="text-emerald-500 w-8 h-8" /> 
            Permit Control Center
          </h2>
          <p className="text-slate-500 mt-1">Monitor, tangguhkan, atau setujui izin kerja (Work Permits) yang sedang berlangsung.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2">
          <Plus size={20} /> Create Permit
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Memuat data izin kerja...</div>
        ) : permits.length === 0 ? (
          <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">Belum ada izin kerja.</div>
        ) : (
          permits.map(permit => (
            <div key={permit.id} className={`bg-white rounded-2xl p-6 border shadow-sm transition-all ${
              permit.status === 'SUSPENDED' ? 'border-red-300 bg-red-50/30' : 'border-slate-200 hover:border-emerald-200'
            }`}>
              <div className="flex justify-between items-start">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="bg-slate-900 text-white px-3 py-1 rounded-lg text-sm font-medium tracking-wide">
                      {permit.permit_code}
                    </span>
                    {permit.status === 'APPROVED' ? (
                      <span className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg text-sm font-semibold">
                        <CheckCircle size={16} /> APPROVED
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-red-600 bg-red-50 px-3 py-1 rounded-lg text-sm font-semibold">
                        <ShieldAlert size={16} /> SUSPENDED
                      </span>
                    )}
                  </div>
                  
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{permit.contractor_company}</h3>
                    <p className="text-slate-600 flex items-center gap-2 mt-1">
                      <span className="font-medium">PIC:</span> {permit.contractor_lead_name}
                      <span className="text-slate-300">|</span>
                      <span className="font-medium">Zone:</span> {permit.location_zone}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-2 text-sm text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg inline-flex">
                    <Users size={16} /> 
                    {permit.worker_manifest?.length || 0} Pekerja Terdaftar
                  </div>
                </div>

                <div className="text-right">
                  {permit.status === 'SUSPENDED' && (
                    <button 
                      onClick={() => handleResolve(permit.id)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-sm transition-colors flex items-center gap-2 animate-pulse"
                    >
                      <CheckCircle size={18} /> Resolve Issue
                    </button>
                  )}
                  {permit.status === 'APPROVED' && (
                    <div className="text-slate-400 text-sm flex items-center gap-2">
                      <AlertCircle size={16} /> AI Monitoring Active
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-slate-900">Create New Work Permit</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X size={24}/></button>
            </div>
            
            <form onSubmit={handleCreate} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Permit Code</label>
                  <input type="text" value={formData.permit_code} readOnly className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 font-mono text-slate-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Permit Template (Rules)</label>
                  <select required value={formData.template_id} onChange={e => setFormData({...formData, template_id: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2">
                    {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Vendor / Contractor Company</label>
                  <input type="text" required placeholder="PT. Maju Konstruksi" value={formData.contractor_company} onChange={e => setFormData({...formData, contractor_company: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Lead / PIC Name</label>
                  <input type="text" required placeholder="Budi Santoso" value={formData.contractor_lead_name} onChange={e => setFormData({...formData, contractor_lead_name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Location / Zone</label>
                <input type="text" required placeholder="Tank Farm Area B" value={formData.location_zone} onChange={e => setFormData({...formData, location_zone: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2" />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Worker Manifest (Comma Separated)</label>
                <textarea required placeholder="Joko, Andi, Supri, Bambang..." value={formData.worker_names} onChange={e => setFormData({...formData, worker_names: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 h-20"></textarea>
                <p className="text-xs text-slate-500 mt-1">Masukkan nama-nama anggota tim yang diizinkan bekerja di bawah permit ini. Hanya PIC yang perlu akun login.</p>
              </div>
              
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2"><Plus size={18} /> Issue Permit</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
