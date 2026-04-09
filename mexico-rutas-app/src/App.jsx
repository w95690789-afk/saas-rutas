import React, { useState } from 'react';
import Papa from 'papaparse';
import { Upload, Database, Settings, ArrowRight, Route, CheckCircle, AlertTriangle, Terminal, Truck, MapPin } from 'lucide-react';
import AuditPanel from './components/AuditPanel';
import LogisticAnalyst from './components/LogisticAnalyst';
import './index.css';

function App() {
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [status, setStatus] = useState('idle');
  const [taskId, setTaskId] = useState(null);
  const [result, setResult] = useState(null);
  const [lastProblem, setLastProblem] = useState(null);
  const [showAudit, setShowAudit] = useState(false);
  const [cediAddress, setCediAddress] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [activeTab, setActiveTab] = useState('cedi'); // 'cedi', 'fleet', 'audit'
  const [fleet, setFleet] = useState([
    { id: 'Tracto_31t', costs: { fixed: 10000 }, capacity: [31000], skills: ['tracto'], amount: 5 },
    { id: 'Torton_propio', costs: { fixed: 100 }, capacity: [18000], skills: ['torton'], amount: 10 }
  ]);
  const API_KEY = import.meta.env.VITE_HERE_API_KEY;

  const [cediConfig, setCediConfig] = useState({
    name: 'CEDI Principal México',
    lat: '18.911402273629243',
    lng: '-97.00091430169718',
    startTime: '06:00',
    endTime: '15:00',
    loadDuration: '120', // Minutos de cargue
    useFileLocation: false,
    globalJobStart: '08:00',
    globalJobEnd: '18:00',
    useGlobalForAll: false,
    useGlobalForMissing: true
  });

  // Búsqueda inversa para coordenadas (arranque y cambios manuales)
  React.useEffect(() => {
    const reverseGeocode = async () => {
      if (!cediConfig.lat || !cediConfig.lng) return;
      try {
        const res = await fetch(`https://revgeocode.search.hereapi.com/v1/revgeocode?at=${cediConfig.lat},${cediConfig.lng}&lang=es-ES&apiKey=${API_KEY}`);
        const data = await res.json();
        if (data.items?.[0]) {
          setCediAddress(data.items[0].address.label);
        }
      } catch (err) { console.error("Error en búsqueda inversa", err); }
    };
    
    // Solo disparamos si la dirección está vacía o si cambiaron las coordenadas drásticamente
    reverseGeocode();
  }, [cediConfig.lat, cediConfig.lng]);

  const handleAddressSearch = async (query) => {
    setCediAddress(query);
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`https://autosuggest.search.hereapi.com/v1/autosuggest?at=${cediConfig.lat},${cediConfig.lng}&q=${encodeURIComponent(query)}&apiKey=${API_KEY}`);
      const data = await res.json();
      setSuggestions(data.items || []);
    } catch (err) { console.error("Error en autosuggest", err); }
  };

  const selectSuggestion = (s) => {
    if (!s.position) return;
    setCediConfig({ ...cediConfig, lat: s.position.lat.toString(), lng: s.position.lng.toString() });
    setCediAddress(s.title);
    setSuggestions([]);
  };
  const [mapping, setMapping] = useState({
    id: 'EmbarqueMovMovID',
    latitude: 'latLong',
    weight: 'PesoArticulo',
    serviceTime: '30',
    windowStart: 'Inicio_Ventana',
    windowEnd: 'Fin_Ventana',
    skill: 'Skill'
  });

  const transformDataToHERE = () => {
    const formatTime = (localTime, baseDateStr = "2026-04-10") => {
      try {
        if (!localTime || !localTime.includes(':')) localTime = '08:00';
        const [h, m] = localTime.split(':').map(Number);
        const date = new Date(`${baseDateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
        // Sumar 6 horas para UTC-6 (México)
        date.setHours(date.getHours() + 6);
        return date.toISOString().split('.')[0] + "Z";
      } catch (e) {
        return `${baseDateStr}T14:00:00Z`;
      }
    };

    // 1. Determinar ubicación de inicio (CEDI)
    let cediLoc = { lat: parseFloat(cediConfig.lat), lng: parseFloat(cediConfig.lng) };
    if (cediConfig.useFileLocation && data.length > 0) {
      const firstCoords = data[0][mapping.latitude]?.split(',').map(c => parseFloat(c.trim()));
      if (firstCoords && !isNaN(firstCoords[0])) {
        cediLoc = { lat: firstCoords[0], lng: firstCoords[1] };
      }
    }

    const fleetList = fleet.flatMap(type => {
      return Array.from({ length: type.amount }).map((_, i) => ({
        id: `${type.id}_${i + 1}`,
        type: "vehicle",
        costs: type.costs,
        profile: "truck_fast",
        capacities: type.capacity,
        capabilities: type.skills,
        shifts: [{
          id: "shift_1",
          start: { time: formatTime(cediConfig.startTime), location: "cedi" },
          end: { time: formatTime(cediConfig.endTime), location: "cedi" }
        }]
      }));
    });

    // 2. Definir turnos comunes
    const commonShifts = [{
      start: { 
        time: formatTime(cediConfig.startTime), 
        location: cediLoc
      },
      end: { 
        time: formatTime(cediConfig.endTime), 
        location: cediLoc
      },
      recharges: {
        maxDistance: 1000000,
        stations: [{
          duration: (parseInt(cediConfig.loadDuration) || 120) * 60,
          location: cediLoc
        }]
      }
    }];

    // 3. Lógica de Agrupación Industrial (Jerárquica: ID + Skill)
    const groupedData = data.reduce((acc, row) => {
      const id = row[mapping.id];
      const skill = row[mapping.skill] || 'normal';
      if (!id) return acc;
      
      const groupKey = `${id}_${skill}`;
      
      if (!acc[groupKey]) {
        acc[groupKey] = { 
          ...row, 
          groupedWeight: 0,
          uniqueJobId: groupKey, 
          currentSkill: skill
        };
      }
      acc[groupKey].groupedWeight += parseFloat(row[mapping.weight] || 0);
      return acc;
    }, {});

    const uniqueRows = Object.values(groupedData);

    // 4. Construir Objeto de Problema para HERE
    const problem = {
      configuration: {
        termination: { maxTime: 300, stagnationTime: 60 },
        routeDetails: ["polyline"],
        experimentalFeatures: ["recharges", "parkingIds"]
      },
      fleet: {
        traffic: "historicalOnly",
        types: [
          {
            id: "Torton_propio",
            profile: "perfil_camion_estandar",
            costs: { fixed: 100, distance: 0.0001, time: 0.0048 },
            shifts: commonShifts,
            capacity: [18000],
            skills: ["convoy_10am"],
            amount: 10
          },
          {
            id: "Truck_tercero",
            profile: "perfil_camion_estandar",
            costs: { fixed: 1000, distance: 0.0001, time: 0.0048 },
            shifts: commonShifts,
            capacity: [6000],
            skills: ["normal"],
            amount: 10
          },
          {
            id: "Tracto",
            profile: "perfil_camion_estandar",
            costs: { fixed: 10000, distance: 0.0001, time: 0.0048 },
            shifts: commonShifts,
            capacity: [31000],
            skills: ["convoy_10am"],
            amount: 10
          },
          {
            id: "Tracto_normal",
            profile: "perfil_camion_estandar",
            costs: { fixed: 10000, distance: 0.0001, time: 0.0048 },
            shifts: commonShifts,
            capacity: [31000],
            skills: ["normal"],
            amount: 10
          }
        ],
        profiles: [{ type: "truck", name: "perfil_camion_estandar" }]
      },
      plan: {
        jobs: uniqueRows.map((row, index) => {
          const coords = row[mapping.latitude]?.split(',').map(c => parseFloat(c.trim())) || [0,0];
          let rawStart, rawEnd;
          
          if (cediConfig.useGlobalForAll) {
            rawStart = cediConfig.globalJobStart;
            rawEnd = cediConfig.globalJobEnd;
          } else {
            const csvStart = row[mapping.windowStart];
            const csvEnd = row[mapping.windowEnd];
            if (cediConfig.useGlobalForMissing) {
              rawStart = csvStart || cediConfig.globalJobStart;
              rawEnd = csvEnd || cediConfig.globalJobEnd;
            } else {
              rawStart = csvStart || '08:00';
              rawEnd = csvEnd || '18:00';
            }
          }
          
          return {
            id: `job_${row.uniqueJobId}`,
            tasks: {
              deliveries: [{
                places: [{
                  location: { lat: coords[0], lng: coords[1] },
                  duration: (parseInt(mapping.serviceTime) || 30) * 60,
                  times: [[
                    formatTime(rawStart), 
                    formatTime(rawEnd)
                  ]]
                }],
                demand: [Math.round(row.groupedWeight || 0)]
              }]
            },
            priority: 1,
            skills: [row.currentSkill]
          };
        }),
        clustering: {
          serviceTimeStrategy: { type: "maxDurationStrategy" }
        },
        shared: {
          parking: [{
            id: "andenes_cedi",
            places: [{
              duration: (parseInt(cediConfig.loadDuration) || 120) * 60,
              vehicleTypeIds: ["Torton_propio", "Truck_tercero", "Tracto", "Tracto_normal"]
            }]
          }]
        }
      },
      objectives: [
        { type: "minimizeUnassigned" },
        { type: "minimizeCost" }
      ]
    };
    
    console.log("INDUSTRIAL_EXEC_V3:", problem);
    setLastProblem(problem);
    setStatus('polling');

    fetch('https://ahvmsiogvnhnkrayadgt.supabase.co/functions/v1/optimize-routes-async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem: problem }) 
    })
    .then(res => res.json())
    .then(payload => {
        if (payload.data?.statusId) {
          setTaskId(payload.data.statusId);
          startPolling(payload.data.statusId, problem);
        } else {
        setStatus('error');
        const errorDetail = payload.data?.title || payload.data?.cause || "Error desconocido";
        alert(`Error de arquitectura en Supabase Edge: ${errorDetail}`);
        console.error("DEBUG_ERROR:", payload);
      }
    })
    .catch(err => {
      setStatus('error');
      alert(`Error de red o CORS: ${err.message}`);
    });
  };

  const [elapsedTime, setElapsedTime] = useState(0);

    const startPolling = (id, currentProblem) => {
      setElapsedTime(0);
      const interval = setInterval(() => {
        setElapsedTime(prev => prev + 10);
        fetch('https://ahvmsiogvnhnkrayadgt.supabase.co/functions/v1/check-optimization-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: id })
        })
        .then(res => res.json())
        .then(payload => {
          const result = payload.data || {};
          const state = (result.status)?.toLowerCase();
          if (state === 'success' || state === 'completed') {
            clearInterval(interval);
            setStatus('fetching_solution');
            fetch(`https://tourplanning.hereapi.com/v3/problems/async/${id}/solution?apiKey=${API_KEY}`)
              .then(res => res.json())
              .then(solutionData => {
                setResult({ solution: solutionData, problem: currentProblem });
                setStatus('success');
              })
              .catch(() => setStatus('error'));
          } else if (state === 'failed') {
          clearInterval(interval);
          setStatus('error');
        }
      })
      .catch(err => console.error(err));
    }, 10000);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setData(results.data);
          setHeaders(Object.keys(results.data[0]));
        }
      });
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="brand-section">
          <div className="brand-logo"><Route size={24} color="white" /></div>
          <div>
            <h2 className="brand-name">México Rutas</h2>
            <p className="brand-tagline">Industrial Intelligence</p>
          </div>
        </div>
        
        <nav className="side-nav">
          {/* TAB SELECTOR */}
          <div className="tab-selector">
            <button className={activeTab === 'cedi' ? 'active' : ''} onClick={() => setActiveTab('cedi')} title="Configuración Base">
              <Settings size={20} />
              <span>CORE</span>
            </button>
            <button className={activeTab === 'fleet' ? 'active' : ''} onClick={() => setActiveTab('fleet')} title="Gestión de Flota">
              <Truck size={20} />
              <span>FLOTA</span>
            </button>
            <button className={activeTab === 'audit' ? 'active' : ''} onClick={() => setActiveTab('audit')} title="Auditoría">
              <Terminal size={20} />
              <span>AUDIT</span>
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'cedi' && (
              <div className="nav-group animate-fade-in">
                <label className="nav-label">SECCIÓN 1: CEDI</label>
                <div className="nav-card">
                  <div className="mini-form">
                    <div className="form-item">
                      <label>Tiempo de cargue (min)</label>
                      <input type="number" value={cediConfig.loadDuration} onChange={(e) => setCediConfig({ ...cediConfig, loadDuration: e.target.value })} />
                    </div>
                    <div className="form-item">
                      <label>Inicio de servicio</label>
                      <input type="time" value={cediConfig.startTime} onChange={(e) => setCediConfig({ ...cediConfig, startTime: e.target.value })} />
                    </div>
                    <div className="form-item">
                      <label>Fin de servicio</label>
                      <input type="time" value={cediConfig.endTime} onChange={(e) => setCediConfig({ ...cediConfig, endTime: e.target.value })} />
                    </div>
                    <div className="form-item" style={{ marginTop: '1rem' }}>
                      <label>Coordenadas Manuales</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                        <input type="text" placeholder="Lat" value={cediConfig.lat} onChange={(e) => setCediConfig({ ...cediConfig, lat: e.target.value })} style={{ padding: '8px' }} />
                        <input type="text" placeholder="Lng" value={cediConfig.lng} onChange={(e) => setCediConfig({ ...cediConfig, lng: e.target.value })} style={{ padding: '8px' }} />
                      </div>
                    </div>
                    <div className="form-item" style={{ marginTop: '0.75rem' }}>
                      <label>Dirección del CEDI</label>
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="text" 
                          placeholder="Busca dirección..." 
                          value={cediAddress} 
                          onChange={e => handleAddressSearch(e.target.value)}
                          style={{ width: '100%', padding: '10px' }}
                        />
                        {suggestions.length > 0 && (
                          <div className="suggestions-dropdown">
                            {suggestions.map((s, i) => (
                              <div key={i} className="suggestion-item" onClick={() => selectSuggestion(s)}>
                                <MapPin size={12} />
                                <span>{s.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <label className="checkbox-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '10px' }}>
                      <input type="checkbox" checked={cediConfig.useFileLocation} onChange={(e) => setCediConfig({ ...cediConfig, useFileLocation: e.target.checked })} />
                      <span style={{ fontSize: '0.7rem', color: '#8293ba' }}>Tomar CEDI del archivo (1ra fila)</span>
                    </label>
                  </div>
                </div>

                <label className="nav-label" style={{ marginTop: '20px' }}>SECCIÓN 2: VENTANAS CLIENTES</label>
                <div className="nav-card">
                  <div className="mini-form">
                    <div className="form-item">
                      <label>Horario Global (Inicio - Fin)</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                        <input type="time" value={cediConfig.globalJobStart} onChange={(e) => setCediConfig({ ...cediConfig, globalJobStart: e.target.value })} style={{ padding: '8px' }} />
                        <input type="time" value={cediConfig.globalJobEnd} onChange={(e) => setCediConfig({ ...cediConfig, globalJobEnd: e.target.value })} style={{ padding: '8px' }} />
                      </div>
                    </div>
                    <div className="form-checkbox-group">
                      <label className="checkbox-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                        <input type="checkbox" checked={cediConfig.useGlobalForAll} onChange={(e) => setCediConfig({ ...cediConfig, useGlobalForAll: e.target.checked, useGlobalForMissing: false })} />
                        <span style={{ fontSize: '0.7rem', color: '#8293ba' }}>Utilizar esta hora para todos</span>
                      </label>
                      <label className="checkbox-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={cediConfig.useGlobalForMissing} onChange={(e) => setCediConfig({ ...cediConfig, useGlobalForMissing: e.target.checked, useGlobalForAll: false })} />
                        <span style={{ fontSize: '0.7rem', color: '#8293ba' }}>Colocar solo a los que no tengan</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'fleet' && (
              <div className="nav-group animate-fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <label className="nav-label">TIPOS DE VEHÍCULO</label>
                  <button className="btn-mini" onClick={() => setFleet([...fleet, { id: 'Nuevo_Tipo', costs: { fixed: 100 }, capacity: [18000], skills: ['nuevo'], amount: 1 }])}>
                    + Add
                  </button>
                </div>
                
                {fleet.map((v, idx) => (
                  <div key={idx} className="nav-card" style={{ marginBottom: '12px', borderLeft: '3px solid #0058be' }}>
                    <div className="mini-form">
                      <div className="form-item">
                        <label>ID del Tipo</label>
                        <input type="text" value={v.id} onChange={(e) => {
                          const newFleet = [...fleet];
                          newFleet[idx].id = e.target.value;
                          setFleet(newFleet);
                        }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div className="form-item">
                          <label>Costo Fijo ($)</label>
                          <input type="number" value={v.costs.fixed} onChange={(e) => {
                            const newFleet = [...fleet];
                            newFleet[idx].costs.fixed = parseInt(e.target.value);
                            setFleet(newFleet);
                          }} />
                        </div>
                        <div className="form-item">
                          <label>Capacidad (Kg)</label>
                          <input type="number" value={v.capacity[0]} onChange={(e) => {
                            const newFleet = [...fleet];
                            newFleet[idx].capacity[0] = parseInt(e.target.value);
                            setFleet(newFleet);
                          }} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '10px' }}>
                        <div className="form-item">
                          <label>Especialidad (Skill)</label>
                          <input type="text" value={v.skills[0]} onChange={(e) => {
                            const newFleet = [...fleet];
                            newFleet[idx].skills[0] = e.target.value;
                            setFleet(newFleet);
                          }} />
                        </div>
                        <div className="form-item">
                          <label>Cantidad</label>
                          <input type="number" value={v.amount} onChange={(e) => {
                            const newFleet = [...fleet];
                            newFleet[idx].amount = parseInt(e.target.value);
                            setFleet(newFleet);
                          }} />
                        </div>
                      </div>
                      <button className="btn-text-danger" onClick={() => setFleet(fleet.filter((_, i) => i !== idx))}>Eliminar este tipo</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="nav-group animate-fade-in">
                <label className="nav-label">INSPECCIÓN TÉCNICA</label>
                <div className="nav-card">
                  <p style={{ fontSize: '0.75rem', color: '#8293ba', lineHeight: '1.5' }}>
                    Utilice este panel para diagnosticar el estado del motor híbrido y la auditoría de paquetes.
                  </p>
                  <button className="btn-secondary" style={{ marginTop: '15px' }} onClick={() => setShowAudit(true)}>
                    <Terminal size={18} style={{ marginRight: '8px' }} />
                    <span>Abrir Consola de Auditoría</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 'auto' }}>
            <div className={`status-indicator ${status}`}>
              <div className="pulse"></div>
              <span>{status.toUpperCase()}</span>
            </div>
          </div>
        </nav>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div className="page-info">
            <h1 className="page-title">México Rutas</h1>
            <p className="page-subtitle">Optimización Industrial HERE v3.1</p>
          </div>
          <div className="actions">
            <button 
              className="btn-primary" 
              disabled={status === 'optimizing' || status === 'polling' || !data.length} 
              onClick={transformDataToHERE}
              style={{ padding: '0.85rem 2.5rem', width: 'auto' }}
            >
              {status === 'idle' || status === 'success' ? 'Optimizar Flota' : status === 'polling' ? `Optimizando (${elapsedTime}s)` : 'Procesando...'}
              <ArrowRight size={18} style={{ marginLeft: '12px' }} />
            </button>
          </div>
        </header>

        <section className="content-area">
          {status === 'success' && result ? (
            <div className="results-grid animate-fade-in">
              <div className="summary-cards">
                <div className="glass-card stat-main"><div className="stat-icon"><CheckCircle color="#0058be" /></div><div><span className="stat-value">{result.solution?.tours?.length || 0}</span><span className="stat-label">Rutas</span></div></div>
                <div className="glass-card stat-main"><div className="stat-icon"><AlertTriangle color="#ba1a1a" /></div><div><span className="stat-value">{result.solution?.unassigned?.length || 0}</span><span className="stat-label">Sin Asignar</span></div></div>
                <div className="glass-card stat-main"><div className="stat-icon"><Route color="#0058be" /></div><div><span className="stat-value">{Math.round((result.solution?.tours?.reduce((acc, r) => acc + (r.statistic?.distance || 0), 0) || 0) / 1000)}</span><span className="stat-label">KM Totales</span></div></div>
              </div>

              <LogisticAnalyst result={result} />
            </div>
          ) : !data.length ? (
            <div className="upload-empty-state animate-fade-in">
              <div className="upload-box" onClick={() => document.getElementById('csv-upload').click()}>
                <Upload size={48} color="#8293ba" />
                <h3>Carga de Pedidos</h3>
                <p>Haz clic para subir tu manifiesto CSV</p>
                <input id="csv-upload" type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
              </div>
            </div>
          ) : (
            <div className="mapping-workspace animate-fade-in">
              <div className="stat-main" style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', width: '100%' }}>
                <div className="form-item">
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8293ba', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>ID Pedido</label>
                  <select value={mapping.id} onChange={e => setMapping({...mapping, id: e.target.value})} style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    {headers.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-item">
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8293ba', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Lat/Lng Cliente</label>
                  <select value={mapping.latitude} onChange={e => setMapping({...mapping, latitude: e.target.value})} style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    {headers.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-item">
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8293ba', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Carga (Peso)</label>
                  <select value={mapping.weight} onChange={e => setMapping({...mapping, weight: e.target.value})} style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    {headers.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-item">
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8293ba', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Svc. Entrega (min)</label>
                  <input type="number" value={mapping.serviceTime} onChange={e => setMapping({...mapping, serviceTime: e.target.value})} style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }} />
                </div>
                <div className="form-item">
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8293ba', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Habilidad (Skill)</label>
                  <select value={mapping.skill} onChange={e => setMapping({...mapping, skill: e.target.value})} style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    {headers.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              <div className="preview-panel glass-card">
                <h3 className="section-heading" style={{ marginBottom: '1.5rem' }}>Vista Previa de Datos ({data.length} registros)</h3>
                <div className="industrial-table-wrapper">
                  <table className="industrial-table">
                    <thead><tr>{headers.slice(0,6).map(h => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>{data.slice(0,10).map((row, i) => <tr key={i}>{headers.slice(0,6).map(h => <td key={h}>{row[h]}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {showAudit && (
        <AuditPanel problem={lastProblem} solution={result?.solution} onClose={() => setShowAudit(false)} />
      )}
    </div>
  );
}

export default App;
