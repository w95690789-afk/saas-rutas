import React, { useState } from 'react';
import Papa from 'papaparse';
import { 
  Upload, Database, Settings, ArrowRight, Route, CheckCircle, 
  AlertTriangle, Terminal, Truck, MapPin, Hash, Package, Clock, Target 
} from 'lucide-react';
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
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [configTab, setConfigTab] = useState('cedi'); // Internal modal navigation
  const [cediAddress, setCediAddress] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [fleet, setFleet] = useState([
    { id: 'Tracto_31t', amount: 1, costs: { fixed: 800 }, capacity: [31000], skills: ['normal'], canReload: true },
    { id: 'Torton_propio', amount: 15, costs: { fixed: 400 }, capacity: [18000], skills: ['normal'], canReload: true },
    { id: 'Torton_propio_convoy_10am', amount: 10, costs: { fixed: 400 }, capacity: [18000], skills: ['convoy_10am'], canReload: true },
    { id: 'Tracto_31t_convoy_10am', amount: 1, costs: { fixed: 800 }, capacity: [31000], skills: ['convoy_10am'], canReload: true },
    { id: 'camioneta_normal', amount: 5, costs: { fixed: 150 }, capacity: [7000], skills: ['normal'], canReload: true },
    { id: 'camioneta_convoy_10am', amount: 5, costs: { fixed: 150 }, capacity: [7000], skills: ['convoy_10am'], canReload: true }
  ]);
  // Hardcode industrial key to bypass Vercel environment variable cache
  const API_KEY = 'ImdD2y0EQeeOzX6Gd046as7iFAP82Y8lAFcimMnGNRg';

  const [cediConfig, setCediConfig] = useState({
    name: 'CEDI Principal México',
    lat: '18.911402273629243',
    lng: '-97.00091430169718',
    startTime: '06:00',
    endTime: '17:00',
    loadDuration: '120', // Minutos de cargue
    useFileLocation: false,
    globalJobStart: '08:00',
    globalJobEnd: '18:00',
    useGlobalForAll: false,
    useGlobalForMissing: true,
    maxShiftDays: 1,
    docks: '5'
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
    name: 'Nombre Cliente',
    latitude: 'latLong',
    weight: 'PesoArticulo',
    serviceTime: '30',
    windowStart: 'Inicio_Ventana',
    windowEnd: 'Fin_Ventana',
    skill: 'Skill'
  });

  const sanitizeId = (id) => id ? id.toString().replace(/[^a-zA-Z0-9_-]/g, '_') : 'unknown';

  const transformDataToHERE = () => {
    const formatTime = (timeStr, baseDateStr = "2026-04-10", offsetDays = 0) => {
      if (!timeStr) return `${baseDateStr}T14:00:00Z`;
      
      try {
        let hours = 8, minutes = 0;
        
        // Match HH:mm or HH:mm:ss with optional AM/PM
        const timeMatch = timeStr.toString().match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
        
        if (timeMatch) {
          hours = parseInt(timeMatch[1]);
          minutes = parseInt(timeMatch[2]);
          const ampm = timeMatch[3]?.toLowerCase();
          
          if (ampm === 'pm' && hours < 12) hours += 12;
          if (ampm === 'am' && hours === 12) hours = 0;
        } else {
          // Fallback for simple hour numbers
          const hourOnly = parseInt(timeStr);
          if (!isNaN(hourOnly)) hours = hourOnly;
        }

        hours = Math.max(0, Math.min(23, hours));
        minutes = Math.max(0, Math.min(59, minutes));

        let finalDateStr = baseDateStr;
        if (offsetDays > 0) {
          const d = new Date(baseDateStr + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + offsetDays);
          finalDateStr = d.toISOString().split('T')[0];
        }

        // Important: Using -06:00 (Mexico) instead of Z ensures HERE uses the correct historical traffic data
        return `${finalDateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00-06:00`;
      } catch (e) {
        return `${baseDateStr}T14:00:00-06:00`;
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

    // 2. Definir turnos por tipo de vehículo (respetando si recargan o no)
    const getShiftsForType = (vType) => {
      const loadDur = (parseInt(cediConfig.loadDuration) || 120) * 60;
      const shift = {
        start: { time: formatTime(cediConfig.startTime), location: cediLoc },
        end: { 
          time: formatTime(cediConfig.endTime, "2026-04-10", (parseInt(cediConfig.maxShiftDays) || 1) - 1), 
          location: cediLoc
        }
      };
      if (vType.canReload) {
        shift.reloads = Array.from({ length: 5 }).map(() => ({
          location: cediLoc,
          duration: loadDur
        }));
      }
      return [shift];
    };

    // 3. Lógica de Agrupación Industrial (Jerárquica: ID + Skill)
    const groupedData = data.reduce((acc, row) => {
      const id = row[mapping.id];
      const skill = row[mapping.skill] || 'normal';
      if (!id) return acc;
      
      const groupKey = sanitizeId(`${id}_${skill}`);
      
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
        experimentalFeatures: ["parkingIds"]
      },
      fleet: {
        traffic: "historicalOnly",
        types: fleet.map(v => ({
          id: sanitizeId(v.id),
          profile: "perfil_camion_estandar",
          costs: { 
            fixed: parseFloat(v.costs?.fixed) || 0, 
            distance: 0.0001, 
            time: 0.0048 
          },
          shifts: getShiftsForType(v),
          capacity: v.capacity || [18000],
          skills: (v.skills || ["normal"]).map(sanitizeId),
          amount: parseInt(v.amount) || 1
        })),
        profiles: [{ type: "truck", name: "perfil_camion_estandar" }]
      },
      plan: {
        jobs: uniqueRows.map((row, index) => {
          const baseDuration = (parseInt(mapping.serviceTime) || 30) * 60;
          const coords = row[mapping.latitude]?.split(',').map(c => parseFloat(c.trim())) || [0,0];
          let rawStart, rawEnd;
          
          // User Request: All orders 8 AM to 6 PM except Tapachula (no window)
          const isTapachula = Object.values(row).some(v => 
            v?.toString().toLowerCase().includes('tapachula')
          );
          
          if (isTapachula) {
            rawStart = null;
            rawEnd = null;
          } else {
            rawStart = "08:00";
            rawEnd = "18:00";
          }
          
          return {
            id: `job_${row.uniqueJobId}`,
            tasks: {
              deliveries: [{
                places: [{
                  location: { lat: coords[0], lng: coords[1] },
                  duration: baseDuration,
                  ...(rawStart && rawEnd ? {
                    times: Array.from({ length: (parseInt(cediConfig.maxShiftDays) || 1) }).map((_, dIdx) => [
                      formatTime(rawStart, "2026-04-10", dIdx), 
                      formatTime(rawEnd, "2026-04-10", dIdx)
                    ])
                  } : {})
                }],
                demand: [Math.round(row.groupedWeight || 0)]
              }]
            },
            priority: row.currentSkill === 'convoy_10am' ? 1 : 2,
            skills: [sanitizeId(row.currentSkill)]
          };
        }),
        clustering: {
          // boundedSumStrategy: suma service times pero CAPEA al maxDuration
          // Así, N jobs × 30min en misma ubicación → capped a 30min (no N×30)
          serviceTimeStrategy: { 
            type: "boundedSumStrategy",
            maxDuration: (parseInt(mapping.serviceTime) || 30) * 60
          }
        },
        shared: {
          parking: [{
            id: "andenes_cedi",
            places: (() => {
              const numDocks = parseInt(cediConfig.docks) || 5;
              const fleetIds = fleet.map(v => sanitizeId(v.id));
              const loadDur = (parseInt(cediConfig.loadDuration) || 120) * 60;

              if (fleetIds.length === 0) {
                return [{ duration: loadDur }];
              }

              const maxSpecific = Math.max(1, numDocks - 1);
              const size = Math.ceil(fleetIds.length / maxSpecific);
              const places = [];

              for (let i = 0; i < maxSpecific; i++) {
                const group = fleetIds.slice(i * size, (i + 1) * size);
                if (group.length > 0) {
                  places.push({
                    duration: loadDur,
                    vehicleTypeIds: group
                  });
                }
              }

              places.push({ duration: loadDur });
              return places;
            })()
          }]
        }
      },
      objectives: [
        { type: "minimizeUnassigned" },
        { type: "minimizeCost" },
        { type: "minimizeDuration" }
      ]
    };
    
    console.log("INDUSTRIAL_EXEC_V3:", problem);
    console.log("🔧 CLUSTERING_CONFIG:", JSON.stringify(problem.plan.clustering, null, 2));
    // Debug: find jobs sharing coordinates
    const coordMap = {};
    problem.plan.jobs.forEach(j => {
      const loc = j.tasks?.deliveries?.[0]?.places?.[0]?.location;
      if (loc) {
        const key = `${loc.lat},${loc.lng}`;
        if (!coordMap[key]) coordMap[key] = [];
        coordMap[key].push({ id: j.id, duration: j.tasks?.deliveries?.[0]?.places?.[0]?.duration });
      }
    });
    const shared = Object.entries(coordMap).filter(([,v]) => v.length > 1);
    console.log("📍 JOBS_SAME_LOCATION:", shared.length, "groups:", shared);
    const submitOptimization = (problemToSend, canFallback = true) => {
      setLastProblem(problemToSend);
      setStatus('polling');

      fetch('https://ahvmsiogvnhnkrayadgt.supabase.co/functions/v1/optimize-routes-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem: problemToSend, apiKey: API_KEY }) 
      })
      .then(res => res.json())
      .then(payload => {
          if (payload.data?.statusId) {
            setTaskId(payload.data.statusId);
            startPolling(payload.data.statusId, problemToSend);
            return;
          }

          const isClusterSchemaError =
            payload?.data?.code === 'E613200' &&
            (payload?.data?.cause || '').includes('/plan/clustering/serviceTimeStrategy');

          if (canFallback && isClusterSchemaError) {
            const fallbackProblem = JSON.parse(JSON.stringify(problemToSend));
            fallbackProblem.plan.clustering = {
              serviceTimeStrategy: { type: "maxDurationStrategy" }
            };
            console.warn("⚠️ boundedSumStrategy rechazado por esquema. Reintentando con maxDurationStrategy.");
            console.log("🔧 CLUSTERING_CONFIG_FALLBACK:", JSON.stringify(fallbackProblem.plan.clustering, null, 2));
            submitOptimization(fallbackProblem, false);
            return;
          }

          setStatus('error');
          const errorDetail = payload.data?.title || payload.data?.cause || "Error desconocido";
          alert(`Error de arquitectura en Supabase Edge: ${errorDetail}`);
          console.error("DEBUG_ERROR:", payload);
      })
      .catch(err => {
        setStatus('error');
        alert(`Error de red o CORS: ${err.message}`);
      });
    };

    submitOptimization(problem, true);
  };

  const [elapsedTime, setElapsedTime] = useState(0);

    const startPolling = (id, currentProblem) => {
      setElapsedTime(0);
      const interval = setInterval(() => {
        setElapsedTime(prev => prev + 10);
        fetch('https://ahvmsiogvnhnkrayadgt.supabase.co/functions/v1/check-optimization-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: id, apiKey: API_KEY })
        })
        .then(res => res.json())
        .then(payload => {
          const result = payload.data || {};
          const state = (result.status)?.toLowerCase();
          if (state === 'success' || state === 'completed') {
            clearInterval(interval);
            setStatus('fetching_solution');
            const resourceId = result.resource?.resourceId || id;
            fetch('https://ahvmsiogvnhnkrayadgt.supabase.co/functions/v1/get-optimization-solution', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: resourceId, apiKey: API_KEY })
            })
              .then(async (res) => {
                const payload = await res.json();
                if (!res.ok) {
                   console.error("DETALLE_ERROR_SOLUCION:", payload);
                   throw new Error(payload.error || 'Fallo al recuperar solución');
                }
                return payload.data; // El objeto de solución está en payload.data
              })
              .then(solutionData => {
                console.log('🔥 HERE_RAW_SOLUTION:', JSON.stringify(solutionData, null, 2).substring(0, 5000));
                console.log('🔥 HERE_TOURS_COUNT:', solutionData?.tours?.length);
                console.log('🔥 HERE_UNASSIGNED:', solutionData?.unassigned);
                if (solutionData?.tours?.[0]?.stops?.[0]) {
                  console.log('🔥 HERE_FIRST_STOP_KEYS:', Object.keys(solutionData.tours[0].stops[0]));
                  console.log('🔥 HERE_FIRST_STOP:', JSON.stringify(solutionData.tours[0].stops[0], null, 2));
                  console.log('🔥 HERE_SECOND_STOP:', JSON.stringify(solutionData.tours[0].stops[1], null, 2));
                }
                setResult({ solution: solutionData, problem: currentProblem });
                setStatus('success');
              })
              .catch((err) => {
                console.error("ERROR_FINAL_SOLUCION:", err);
                setStatus('error');
              });
          } else if (state === 'failed') {
          clearInterval(interval);
          setStatus('error');
        }
      })
      .catch(err => console.error(err));
    }, 10000);
  };

  const generateMockSolution = () => {
    if (data.length === 0) return;
    setStatus('optimizing');
    
    // Simular un proceso de 2 segundos
    setTimeout(() => {
      const mockTours = [
        { id: 'camioneta_v1', type: 'Camioneta', capacity: 7000 },
        { id: 'torton_v2', type: 'Torton', capacity: 18000 },
        { id: 'tracto_v3', type: 'Tracto', capacity: 31000 }
      ];

      try {
        const tours = mockTours.map((v, vIdx) => {
          const jobsPerVehicle = Math.ceil(data.length / mockTours.length);
          const startIndex = vIdx * jobsPerVehicle;
          const vehicleJobs = data.slice(startIndex, startIndex + jobsPerVehicle);
          
          let currentTime = new Date("2026-04-10T08:00:00-06:00");
          
          const stops = [
            { location: { lat: cediConfig.lat, lng: cediConfig.lng }, departure: { time: currentTime.toISOString() }, activities: [{ type: 'departure' }] }
          ];

          vehicleJobs.forEach((job, jIdx) => {
            if (!job || !mapping.latitude) return;
            
            // Tránsito: 30-60 mins
            currentTime = new Date(currentTime.getTime() + (30 + Math.random() * 30) * 60000);
            const arrival = currentTime.toISOString();
            // Servicio: 20-40 mins
            currentTime = new Date(currentTime.getTime() + (20 + Math.random() * 20) * 60000);
            const departure = currentTime.toISOString();

            // Intentar parsear lat/lng
            let lat = cediConfig.lat, lng = cediConfig.lng;
            const coordsStr = job[mapping.latitude];
            if (coordsStr && typeof coordsStr === 'string' && coordsStr.includes(',')) {
              const parts = coordsStr.split(',');
              lat = parseFloat(parts[0]);
              lng = parseFloat(parts[1]);
            }

            stops.push({
              location: { lat, lng },
              arrival: { time: arrival },
              departure: { time: departure },
              activities: [{ type: 'delivery', jobId: `job_${sanitizeId(job[mapping.id])}_normal` }]
            });
          });

          // Regreso CEDI
          currentTime = new Date(currentTime.getTime() + 45 * 60000);
          stops.push({
            location: { lat: cediConfig.lat, lng: cediConfig.lng },
            arrival: { time: currentTime.toISOString() },
            activities: [{ type: 'arrival' }]
          });

          return {
            vehicleId: v.id,
            typeId: v.type,
            stops,
            statistic: { distance: Math.random() * 150000 }
          };
        });

        const mockProblem = {
          plan: {
            jobs: data.map(row => ({
              id: `job_${sanitizeId(row[mapping.id])}_normal`,
              label: row[mapping.name]
            }))
          }
        };

        setResult({ solution: { tours }, problem: mockProblem });
        setStatus('success');
      } catch (err) {
        console.error("Simulation error:", err);
        setStatus('idle');
        alert("Hubo un error en la simulación. Revisa tus mapeos.");
      }
    }, 1500);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data;
          if (rows.length > 0) {
            const detectedHeaders = Object.keys(rows[0]);
            setData(rows);
            setHeaders(detectedHeaders);
            
            // Auto-detect mappings based on header names
            const newMapping = { ...mapping };
            const detectionMap = {
              id: ['EmbarqueMovMovID', 'movimiento', 'order_id', 'id_entrega', 'uuid'],
              name: ['Nombre Cliente', 'Nombre', 'CLIENTE', 'client_name', 'razon_social'],
              latitude: ['latLong', 'coordenadas', 'ubicacion', 'location', 'posicion'],
              weight: ['PesoArticulo', 'peso', 'kg', 'weight', 'carga'],
              windowStart: ['Window Start', 'Inicio_Ventana', 'Inicio Ventana', 'ventana_inicio', 'start_time'],
              windowEnd: ['Window End', 'Fin_Ventana', 'Fin Ventana', 'ventana_fin', 'end_time'],
              skill: ['Skill', 'tipo_vehiculo', 'habilidad', 'capability']
            };

            Object.entries(detectionMap).forEach(([field, keywords]) => {
              const found = detectedHeaders.find(h => 
                keywords.some(k => h.toLowerCase() === k.toLowerCase()) || 
                keywords.some(k => h.toLowerCase().includes(k.toLowerCase()) && k.length > 5)
              );
              if (found) newMapping[field] = found;
            });
            setMapping(newMapping);
          }
        }
      });
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="brand-section">
          <div className="logo-box"><Route size={24} color="white" /></div>
          <h2>HERO<span>LOGIC</span></h2>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group">
            <label className="nav-label">OPERACIÓN ACTIVA</label>
            <div className="nav-card" style={{ padding: '24px' }}>
              <div style={{ display: 'grid', gap: '12px' }}>
                <button 
                  className="nav-item-btn" 
                  onClick={() => { setConfigTab('cedi'); setShowConfigModal(true); }}
                >
                  <div className="icon-wrap"><MapPin size={20} /></div>
                  <div className="text-wrap">
                    <span className="label">Ubicación</span>
                    <span className="title">Configurar CEDI</span>
                  </div>
                </button>
                
                <button 
                  className="nav-item-btn active" 
                  onClick={() => { setConfigTab('fleet'); setShowConfigModal(true); }}
                >
                  <div className="icon-wrap"><Truck size={20} /></div>
                  <div className="text-wrap">
                    <span className="label">Recursos</span>
                    <span className="title">Gestión de Flota</span>
                  </div>
                </button>
              </div>
            </div>
            
            <button className="btn-secondary" style={{ marginTop: '12px', justifyContent: 'flex-start' }} onClick={() => setShowAudit(true)}>
              <Terminal size={16} />
              <span>Consola de Auditoría</span>
            </button>
          </div>

          <div style={{ marginTop: 'auto' }}>
            <div className={`status-indicator ${status}`}>
              <div className="pulse"></div>
              <span>{status.toUpperCase()}</span>
            </div>
          </div>
        </nav>
      </aside>

      {/* MODAL CENTRO DE MANDO */}
      {showConfigModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-slide-up">
            <div className="modal-tabs">
              <button 
                className={`modal-tab-btn ${configTab === 'cedi' ? 'active' : ''}`}
                onClick={() => setConfigTab('cedi')}
              >
                <MapPin size={16} />
                CONFIGURACIÓN CEDI
              </button>
              <button 
                className={`modal-tab-btn ${configTab === 'fleet' ? 'active' : ''}`}
                onClick={() => setConfigTab('fleet')}
              >
                <Truck size={16} />
                GESTIÓN DE FLOTA
              </button>
            </div>
            
            <div className="modal-body">
              {configTab === 'cedi' ? (
                <div className="modal-sub-section animate-fade-in">
                  <div className="modal-section-title">Parámetros del CEDI</div>
                  <div className="modal-grid">
                    <div className="form-item modal-full-width">
                      <label>Nombre del CEDI</label>
                      <input type="text" value={cediConfig.name} onChange={(e) => setCediConfig({ ...cediConfig, name: e.target.value })} />
                    </div>
                    <div className="form-item">
                      <label>Hora Apertura</label>
                      <input type="time" value={cediConfig.startTime} onChange={(e) => setCediConfig({ ...cediConfig, startTime: e.target.value })} />
                    </div>
                    <div className="form-item">
                      <label>Hora Cierre</label>
                      <input type="time" value={cediConfig.endTime} onChange={(e) => setCediConfig({ ...cediConfig, endTime: e.target.value })} />
                    </div>
                    <div className="form-item">
                      <label>Duración del Cargue (min)</label>
                      <input type="number" value={cediConfig.loadDuration} onChange={(e) => setCediConfig({ ...cediConfig, loadDuration: e.target.value })} />
                    </div>
                    <div className="form-item">
                      <label>Días de Turno (Max 7)</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="7"
                        value={cediConfig.maxShiftDays} 
                        onChange={(e) => setCediConfig({ ...cediConfig, maxShiftDays: e.target.value })} 
                      />
                      <small style={{color: '#666', fontSize: '0.7rem'}}>1 = Mismo día, 3 = Tapachula/Tijuana</small>
                    </div>
                    <div className="form-item">
                      <label>Andenes Disponibles</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="20"
                        value={cediConfig.docks} 
                        onChange={(e) => setCediConfig({ ...cediConfig, docks: e.target.value })} 
                      />
                      <small style={{color: '#666', fontSize: '0.7rem'}}>Cargas simultáneas posibles</small>
                    </div>
                    <div className="form-item">
                      <label>Referencia Geográfica</label>
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="text" 
                          placeholder="Busca dirección..." 
                          value={cediAddress} 
                          onChange={e => handleAddressSearch(e.target.value)}
                          style={{ width: '100%' }}
                        />
                        {suggestions.length > 0 && (
                          <div className="suggestions-dropdown" style={{ left: 0, right: 0 }}>
                            {suggestions.map((s, i) => (
                              <div key={i} className="suggestion-item" onClick={() => selectSuggestion(s)}>
                                <MapPin size={12} />
                                <span style={{ fontSize: '0.75rem' }}>{s.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="form-item modal-full-width">
                      <label>Ventanas Horarias Automáticas</label>
                      <div className="nav-card" style={{ padding: '15px', background: 'var(--surface-low)' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>PREDETERMINADO:</span>
                          <input type="time" value={cediConfig.globalJobStart} onChange={(e) => setCediConfig({ ...cediConfig, globalJobStart: e.target.value })} />
                          <span>a</span>
                          <input type="time" value={cediConfig.globalJobEnd} onChange={(e) => setCediConfig({ ...cediConfig, globalJobEnd: e.target.value })} />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={cediConfig.useGlobalForMissing} onChange={(e) => setCediConfig({ ...cediConfig, useGlobalForMissing: e.target.checked, useGlobalForAll: false })} />
                          <span style={{ fontSize: '0.75rem' }}>Auto-completar clientes sin horario especificado</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ) : configTab === 'fleet' ? (
                <div className="modal-sub-section animate-fade-in">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div className="modal-section-title" style={{ margin: 0, border: 0 }}>Gestión de Flota</div>
                    <button className="btn-mini" onClick={() => setFleet([...fleet, { id: 'Tipo_' + (fleet.length + 1), costs: { fixed: 100 }, capacity: [18000], skills: ['normal'], amount: 5, canReload: true }])}>
                      + Agregar Tipo de Vehículo
                    </button>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {fleet.length === 0 && (
                      <div className="modal-full-width" style={{ textAlign: 'center', padding: '60px', color: '#8293ba', border: '1px dashed #d1d9e6', borderRadius: '12px' }}>
                        No hay vehículos configurados. Comienza agregando uno.
                      </div>
                    )}
                    {fleet.map((v, idx) => (
                      <div key={idx} className="nav-card" style={{ padding: '24px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div className="modal-grid">
                          <div className="form-item">
                            <label>Identificador</label>
                            <input type="text" value={v.id} onChange={(e) => {
                              const newFleet = [...fleet];
                              newFleet[idx].id = e.target.value;
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
                          <div className="form-item">
                            <label>Especialidad</label>
                            <input type="text" value={v.skills[0]} onChange={(e) => {
                              const newFleet = [...fleet];
                              newFleet[idx].skills[0] = e.target.value;
                              setFleet(newFleet);
                            }} />
                          </div>
                          <div className="form-item" style={{ alignSelf: 'center', paddingTop: '10px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={v.canReload !== false} 
                                onChange={(e) => {
                                  const newFleet = [...fleet];
                                  newFleet[idx].canReload = e.target.checked;
                                  setFleet(newFleet);
                                }} 
                              />
                              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Habilitar Recargas</span>
                            </label>
                          </div>
                          <div className="modal-full-width" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                            <button className="btn-text-danger" onClick={() => setFleet(fleet.filter((_, i) => i !== idx))}>Eliminar este tipo</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowConfigModal(false)}>Cerrar</button>
              <button 
                className="btn-primary" 
                style={{ width: 'auto', padding: '0 24px' }} 
                onClick={() => setShowConfigModal(false)}
              >
                Guardar Configuración
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="main-content">
        <header className="top-bar">
          <div className="page-info">
            <h1 className="page-title">México Rutas</h1>
            <p className="page-subtitle">Optimización Industrial HERE v3.1</p>
          </div>
          <div className="actions" style={{ display: 'flex', gap: '12px' }}>
            {data.length > 0 && (
              <button 
                className="btn-secondary-dark" 
                onClick={generateMockSolution}
                style={{ background: 'white', border: '1px solid var(--primary-electric)', color: 'var(--primary-electric)', padding: '0.85rem 1.5rem' }}
              >
                Simular Cronograma (Gratis)
              </button>
            )}
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

              <LogisticAnalyst result={result} fullData={data} mapping={mapping} />
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
              <div className="stat-main" style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1.5rem', width: '100%' }}>
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
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8293ba', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Ventana Inicio</label>
                  <select value={mapping.windowStart} onChange={e => setMapping({...mapping, windowStart: e.target.value})} style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    <option value="">-- Opcional --</option>
                    {headers.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-item">
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8293ba', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Ventana Fin</label>
                  <select value={mapping.windowEnd} onChange={e => setMapping({...mapping, windowEnd: e.target.value})} style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    <option value="">-- Opcional --</option>
                    {headers.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-item">
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8293ba', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Habilidad (Skill)</label>
                  <select value={mapping.skill} onChange={e => setMapping({...mapping, skill: e.target.value})} style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    <option value="">-- Opcional --</option>
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
