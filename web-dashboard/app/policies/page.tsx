"use client";
import { useState, useEffect } from "react";
import { Save, Plus, Trash2, ShieldCheck, Activity, Upload, Sun, Thermometer, HeartPulse, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";

export default function PoliciesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection State
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  // File Upload State
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    const formData = new FormData();
    formData.append("file", file);
    
    setIsUploading(true);
    try {
      const res = await api.post("/policies/upload-sop", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      alert("SOP Document uploaded and extracted successfully!");
      fetchTemplates();
    } catch (error) {
      console.error(error);
      alert("Failed to upload document.");
    } finally {
      setIsUploading(false);
    }
  };

  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("HOT_WORK");
  const [ppe, setPpe] = useState(["Helmet", "Safety_Shoes"]);
  const [newPpe, setNewPpe] = useState("");

  // Industrial Hygiene & Toyota STOP 6 States
  const [enableHealth, setEnableHealth] = useState(false);
  const [minLux, setMinLux] = useState(300);
  const [maxTemp, setMaxTemp] = useState(34);
  const [maxHumidity, setMaxHumidity] = useState(75);
  const [checkErgonomics, setCheckErgonomics] = useState(true);
  const [stop6Category, setStop6Category] = useState("STOP_6_6_HEAT_HAZARDS");

  // Safety Perimeter & 5S
  const [enableSafetyPerimeter, setEnableSafetyPerimeter] = useState(false);
  const [check5SHousekeeping, setCheck5SHousekeeping] = useState(true);
  const [checkBarrierApar, setCheckBarrierApar] = useState(true);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await api.get("/policies/templates");
      setTemplates(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const addPpe = () => {
    if (newPpe && !ppe.includes(newPpe)) {
      setPpe([...ppe, newPpe.replace(/\s+/g, "_")]);
      setNewPpe("");
    }
  };

  const removePpe = (item: string) => {
    setPpe(ppe.filter(p => p !== item));
  };

  const handleEditTemplate = (template: any) => {
    setIsEditing(true);
    setIsCreating(true);
    setSelectedTemplate(template);
    
    setNewTitle(template.title);
    setNewType(template.permit_type);
    setPpe(template.dynamic_rules?.required_ppe || []);
    setStop6Category(template.dynamic_rules?.toyota_stop6_category || "STOP_6_6_HEAT_HAZARDS");
    
    if (template.dynamic_rules?.industrial_hygiene) {
      setEnableHealth(true);
      setMinLux(template.dynamic_rules.industrial_hygiene.min_lux || 300);
      setMaxTemp(template.dynamic_rules.industrial_hygiene.max_temperature_c || 34);
      setMaxHumidity(template.dynamic_rules.industrial_hygiene.max_humidity_pct || 75);
      setCheckErgonomics(template.dynamic_rules.industrial_hygiene.check_ergonomic_posture ?? true);
    } else {
      setEnableHealth(false);
    }

    if (template.dynamic_rules?.safety_perimeter) {
      setEnableSafetyPerimeter(true);
      setCheck5SHousekeeping(template.dynamic_rules.safety_perimeter.check_5s_housekeeping ?? true);
      setCheckBarrierApar(template.dynamic_rules.safety_perimeter.check_barrier_apar ?? true);
    } else {
      setEnableSafetyPerimeter(false);
    }
  };

  const saveNewTemplate = async () => {
    if (!newTitle) return alert("Title is required");
    
    const dynamic_rules: any = {
      required_ppe: ppe,
      severity_mapping: {
        CRITICAL: "SUSPEND_PERMIT",
        MEDIUM: "ISSUE_WARNING"
      },
      toyota_stop6_category: stop6Category
    };

    if (enableHealth) {
      dynamic_rules.industrial_hygiene = {
        min_lux: Number(minLux),
        max_temperature_c: Number(maxTemp),
        max_humidity_pct: Number(maxHumidity),
        check_ergonomic_posture: checkErgonomics
      };
    }

    if (enableSafetyPerimeter) {
      dynamic_rules.safety_perimeter = {
        check_5s_housekeeping: check5SHousekeeping,
        check_barrier_apar: checkBarrierApar
      };
    }

    try {
      if (isEditing && selectedTemplate) {
        await api.put(`/policies/templates/${selectedTemplate.id}`, {
          title: newTitle,
          permit_type: newType,
          dynamic_rules: dynamic_rules
        });
      } else {
        await api.post("/policies/templates", {
          title: newTitle,
          permit_type: newType,
          dynamic_rules: dynamic_rules
        });
      }
      setIsCreating(false);
      setIsEditing(false);
      setNewTitle("");
      setPpe(["Helmet", "Safety_Shoes"]);
      setMinLux(300);
      setMaxTemp(34);
      setMaxHumidity(75);
      setCheckErgonomics(true);
      setEnableHealth(false);
      setEnableSafetyPerimeter(false);
      setCheck5SHousekeeping(true);
      setCheckBarrierApar(true);
      setSelectedTemplate(null);
      fetchTemplates(); // Refresh list
    } catch (error) {
      console.error(error);
      alert("Failed to save template");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Dynamic Policy Configurator</h2>
          <p className="text-slate-500 mt-1">Configure Context-Aware AI Rules injected directly into Gemini.</p>
        </div>
        {!isCreating && (
          <div className="flex gap-4">
            <div>
              <input type="file" id="sop-upload" className="hidden" accept=".pdf" onChange={handleFileUpload} />
              <label htmlFor="sop-upload" className="cursor-pointer bg-blue-600 text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm">
                <Upload size={18} />
                {isUploading ? "Extracting AI..." : "Upload Safety Standard / PDF"}
              </label>
            </div>
            <button 
              onClick={() => { setIsCreating(true); setSelectedTemplate(null); }}
              className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-sm"
            >
              <Plus size={18} />
              Create New Template
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
        {/* Left Column: Existing Templates */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="text-blue-500" size={20} /> Active Templates
          </h3>
          
          {loading ? (
            <p className="text-slate-500 animate-pulse">Loading templates...</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-slate-500 border border-dashed border-slate-200 p-4 rounded-xl">No templates found.</p>
          ) : (
            templates.map((t, idx) => (
              <div 
                key={idx} 
                onClick={() => { setSelectedTemplate(t); setIsCreating(false); }}
                className={`bg-white p-4 rounded-xl shadow-sm border transition-colors cursor-pointer group ${selectedTemplate?.id === t.id ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-blue-600">{t.permit_type}</p>
                  {t.dynamic_rules?.toyota_stop6_category && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-rose-50 text-rose-700 font-bold rounded border border-rose-200">
                      STOP 6
                    </span>
                  )}
                </div>
                <p className="font-bold text-slate-800 mb-2">{t.title}</p>
                <div className="flex flex-wrap gap-1">
                  {t.dynamic_rules?.required_ppe?.map((p: string, i: number) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{p}</span>
                  ))}
                  {t.dynamic_rules?.industrial_hygiene?.min_lux && (
                    <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">
                      {t.dynamic_rules.industrial_hygiene.min_lux} Lux
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Column: Editor / Viewer */}
        <div className="lg:col-span-2">
          {isCreating ? (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-200 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
              <h3 className="text-xl font-bold text-slate-900 mb-6">Draft New Template</h3>
              
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Template Title</label>
                    <input 
                      type="text" 
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="e.g., Chemical Room Rules"
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Permit Type</label>
                    <select 
                      value={newType}
                      onChange={e => setNewType(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-blue-500 text-sm bg-white"
                    >
                      <option value="HOT_WORK">HOT_WORK</option>
                      <option value="WORKING_AT_HEIGHT">WORKING_AT_HEIGHT</option>
                      <option value="CONFINED_SPACE">CONFINED_SPACE</option>
                      <option value="ELECTRICAL_LOTO">ELECTRICAL_LOTO</option>
                      <option value="GENERAL">GENERAL</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Required AI Detections (PPE)</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {ppe.map((item, idx) => (
                      <div key={idx} className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm border border-slate-200">
                        {item}
                        <button onClick={() => removePpe(item)} className="text-slate-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={newPpe}
                      onChange={(e) => setNewPpe(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addPpe()}
                      placeholder="e.g. Gas_Respirator, Face_Shield"
                      className="flex-1 border border-slate-300 rounded-lg p-2.5 outline-none focus:border-blue-500 text-sm"
                    />
                    <button 
                      onClick={addPpe}
                      className="bg-slate-100 text-slate-700 border border-slate-300 px-4 py-2 rounded-lg text-sm flex items-center gap-1 hover:bg-slate-200 transition-colors"
                    >
                      <Plus size={16} /> Add
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                    <Activity size={12} /> These keywords are injected straight into Gemini's validation prompt.
                  </p>
                </div>

                {/* Toyota STOP 6 Mapping */}
                <div className="bg-rose-50/60 border border-rose-200 p-4 rounded-xl space-y-2">
                  <label className="block text-sm font-bold text-rose-950 flex items-center gap-2">
                    <ShieldAlert size={16} className="text-rose-600" />
                    Toyota STOP 6 Standards Mapping
                  </label>
                  <p className="text-xs text-rose-700">
                    Petakan izin kerja ini ke dalam 6 kategori kecelakaan fatal standar Toyota (TPS Safety).
                  </p>
                  <select 
                    value={stop6Category}
                    onChange={e => setStop6Category(e.target.value)}
                    className="w-full border border-rose-300 rounded-lg p-2.5 outline-none focus:border-rose-500 text-sm bg-white font-medium text-slate-800"
                  >
                    <option value="STOP_6_1_APPARATUS">1. Apparatus (Mesin Bergerak / Terjepit / LOTO)</option>
                    <option value="STOP_6_2_HEAVY_OBJECTS">2. Heavy Objects (Tertimpa Benda Berat / Crane / Hoist)</option>
                    <option value="STOP_6_3_VEHICLES">3. Vehicles (Tabrakan Forklift / AGV / Jalur Pedestrian)</option>
                    <option value="STOP_6_4_DROP_FALL">4. Drop / Fall (Jatuh dari Ketinggian / Scaffolding)</option>
                    <option value="STOP_6_5_ELECTRIC_SHOCK">5. Electric Shock (Sengatan Listrik Tegangan Tinggi)</option>
                    <option value="STOP_6_6_HEAT_HAZARDS">6. Heat / Fire (Kebakaran Pengelasan / Kimia B3 / Cairan Panas)</option>
                    <option value="STOP_6_GENERAL">General Safety (Standar Umum Shopfloor)</option>
                  </select>
                </div>

                {/* Industrial Hygiene & Health Configurator */}
                <div className={`border p-4 rounded-xl space-y-4 transition-colors ${enableHealth ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-sm font-bold flex items-center gap-2 ${enableHealth ? 'text-emerald-950' : 'text-slate-700'}`}>
                        <HeartPulse size={16} className={enableHealth ? 'text-emerald-600' : 'text-slate-400'} />
                        Industrial Hygiene & Health Configurator (Permenaker 5/2018)
                      </h4>
                      <p className={`text-xs mt-0.5 ${enableHealth ? 'text-emerald-700' : 'text-slate-500'}`}>
                        Parameter kesehatan lingkungan kerja yang diaudit otomatis oleh AI Vision & Sensor.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={enableHealth}
                        onChange={e => setEnableHealth(e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                  
                  {enableHealth && (
                    <>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Minimum Lux */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                        <Sun size={14} className="text-amber-500" /> Pencahayaan Minimum (Min Lux)
                      </label>
                      <select 
                        value={minLux}
                        onChange={e => setMinLux(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white"
                      >
                        <option value={100}>100 Lux — Gudang & Lorong Pedestrian</option>
                        <option value={300}>300 Lux — Workshop Mesin, Pengelasan & Maintenance</option>
                        <option value={500}>500 Lux — Perakitan Presisi / Inspeksi Cacat Bodi</option>
                      </select>
                      <p className="text-[11px] text-slate-500 mt-1">AI mengevaluasi kecukupan terang area kerja.</p>
                    </div>

                    {/* Heat & Humidity */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                        <Thermometer size={14} className="text-red-500" /> Ambang Batas Iklim Kerja Panas
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-500">Maks Suhu (°C)</span>
                          <input 
                            type="number"
                            value={maxTemp}
                            onChange={e => setMaxTemp(Number(e.target.value))}
                            className="w-full border border-slate-300 rounded-lg p-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500">Maks Lembab (%)</span>
                          <input 
                            type="number"
                            value={maxHumidity}
                            onChange={e => setMaxHumidity(Number(e.target.value))}
                            className="w-full border border-slate-300 rounded-lg p-1.5 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ergonomics Toggle */}
                  <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">AI Ergonomics Posture Assessment</p>
                      <p className="text-[11px] text-slate-500">Deteksi risiko cedera tulang belakang (membungkuk ekstrim &gt;30° atau salah angkat beban).</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={checkErgonomics}
                        onChange={e => setCheckErgonomics(e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                  </>)}
                </div>

                {/* Safety Perimeter & 5S Configurator */}
                <div className={`border p-4 rounded-xl space-y-4 transition-colors ${enableSafetyPerimeter ? 'bg-indigo-50/60 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-sm font-bold flex items-center gap-2 ${enableSafetyPerimeter ? 'text-indigo-950' : 'text-slate-700'}`}>
                        <ShieldCheck size={16} className={enableSafetyPerimeter ? 'text-indigo-600' : 'text-slate-400'} />
                        Safety Perimeter & Toyota 5S (Housekeeping)
                      </h4>
                      <p className={`text-xs mt-0.5 ${enableSafetyPerimeter ? 'text-indigo-700' : 'text-slate-500'}`}>
                        Deteksi area kerja bersih dari tripping hazard, dan keberadaan proteksi aktif.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={enableSafetyPerimeter}
                        onChange={e => setEnableSafetyPerimeter(e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                  
                  {enableSafetyPerimeter && (
                    <div className="space-y-3 pt-2 border-t border-indigo-200/60">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-slate-800">5S Housekeeping (Seiri/Seiton/Seiso)</p>
                          <p className="text-[11px] text-slate-500">Deteksi kabel berserakan, tumpahan, dan bahaya tersandung.</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={check5SHousekeeping}
                            onChange={e => setCheck5SHousekeeping(e.target.checked)}
                            className="sr-only peer" 
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-slate-800">Safety Barricade & APAR</p>
                          <p className="text-[11px] text-slate-500">Deteksi safety cone, barikade, dan ketersediaan APAR di area khusus.</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={checkBarrierApar}
                            onChange={e => setCheckBarrierApar(e.target.checked)}
                            className="sr-only peer" 
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                  <button 
                    onClick={() => setIsCreating(false)}
                    className="px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveNewTemplate}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm text-sm"
                  >
                    <Save size={18} />
                    Save Template
                  </button>
                </div>
              </div>
            </div>
          ) : selectedTemplate ? (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-start mb-1">
                <h3 className="text-2xl font-bold text-slate-900">{selectedTemplate.title}</h3>
                <button 
                  onClick={() => handleEditTemplate(selectedTemplate)}
                  className="px-3 py-1.5 bg-blue-50 text-blue-600 font-medium text-sm rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                >
                  Edit Policy
                </button>
              </div>
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-lg mb-6">
                Type: {selectedTemplate.permit_type}
              </span>
              
              <div className="space-y-6">

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">Target Object Detection (PPE)</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedTemplate.dynamic_rules.required_ppe?.map((p: string, i: number) => (
                      <div key={i} className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm border border-emerald-200 font-medium">
                        <ShieldCheck size={16} /> {p}
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Toyota STOP 6 & Health Details */}
                {selectedTemplate.dynamic_rules?.toyota_stop6_category && (
                  <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl">
                    <p className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <ShieldAlert size={14} /> Toyota STOP 6 Standard
                    </p>
                    <p className="text-sm font-bold text-rose-950">
                      {selectedTemplate.dynamic_rules.toyota_stop6_category}
                    </p>
                  </div>
                )}

                {selectedTemplate.dynamic_rules?.industrial_hygiene && (
                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl space-y-2">
                    <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                      <HeartPulse size={14} /> Industrial Hygiene & Health Parameters
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-1 text-xs">
                      <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                        <span className="text-slate-500 block">Min Illumination</span>
                        <span className="font-bold text-slate-800 text-sm">
                          {selectedTemplate.dynamic_rules.industrial_hygiene.min_lux || 300} Lux
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                        <span className="text-slate-500 block">Max Temp / Humidity</span>
                        <span className="font-bold text-slate-800 text-sm">
                          {selectedTemplate.dynamic_rules.industrial_hygiene.max_temperature_c || 34}°C / {selectedTemplate.dynamic_rules.industrial_hygiene.max_humidity_pct || 75}%
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                        <span className="text-slate-500 block">AI Ergonomics Check</span>
                        <span className={`font-bold text-sm ${selectedTemplate.dynamic_rules.industrial_hygiene.check_ergonomic_posture ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {selectedTemplate.dynamic_rules.industrial_hygiene.check_ergonomic_posture ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <hr className="border-slate-100" />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Severity Mapping (JSON)</label>
                  <p className="text-xs text-slate-500 mb-3">This configuration maps AI severity findings directly to backend enforcement actions.</p>
                  <pre className="bg-slate-900 text-emerald-400 p-4 rounded-lg text-sm overflow-x-auto shadow-inner">
{JSON.stringify(selectedTemplate.dynamic_rules.severity_mapping, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl h-64 flex flex-col items-center justify-center text-slate-400">
              <ShieldCheck size={48} className="mb-4 text-slate-300" />
              <p>Select a template on the left to view rules, or create a new one.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
