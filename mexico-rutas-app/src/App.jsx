import React, { useState } from 'react';
import Papa from 'papaparse';
import { 
  Upload, Database, Settings, ArrowRight, Route, CheckCircle, 
  AlertTriangle, Terminal, Truck, MapPin, Hash, Package, Clock, Target,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import AuditPanel from './components/AuditPanel';
import LogisticAnalyst from './components/LogisticAnalyst';
import GeoreferenceModule from './components/GeoreferenceModule';
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
  const [activeWorkspace, setActiveWorkspace] = useState('optimizer');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [configTab, setConfigTab] = useState('cedi'); // Internal modal navigation
  const [cediAddress, setCediAddress] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [fleet, setFleet] = useState([
    { id: 'Torton', amount: 15, costs: { fixed: 100 }, capacity: [18000], skills: ['normal'], canReload: true },
    { id: 'Tracto camion', amount: 3, costs: { fixed: 140 }, capacity: [30000], skills: ['normal'], canReload: true },
    { id: 'Camioneta4', amount: 1, costs: { fixed: 110 }, capacity: [4000], skills: ['normal'], canReload: true },
    { id: 'Camioneta7', amount: 4, costs: { fixed: 110 }, capacity: [7000], skills: ['normal'], canReload: true }
  ]);
  const [fleetData, setFleetData] = useState([]);
  const [fleetHeaders, setFleetHeaders] = useState([]);
  const [showFleetMapping, setShowFleetMapping] = useState(false);
  const [fleetMapping, setFleetMapping] = useState({
    id: '', amount: '', fixedCost: '', capacity: '', skill: '', canReload: ''
  });
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
    maxShiftDays: 1
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
    id: 'id',
    movimiento: 'movimiento',
    client: 'client', // This will now represent client name
    clientCode: 'clientCode', // Added for explicit client identifier
    latitude: 'latitude',
    longitude: 'longitude',
    weight: 'weight',
    time: 'time',
    date: 'date',
    serviceTime: '30',
    windowStart: 'Inicio_Ventana',
    windowEnd: 'Fin_Ventana',
    skill: 'Skill',
    address: 'address'
  });

  const sanitizeId = (id) => id ? id.toString().replace(/[^a-zA-Z0-9_-]/g, '_') : 'unknown';

  const transformDataToHERE = () => {
    const SCALING_FACTOR = 1000;

    // Helper para limpiar coordenadas (maneja separadores de miles y puntos decimales implícitos)
    const parseCoord = (val) => {
      if (!val) return 0;
      // Eliminar comas y espacios (común en exportaciones con formato de miles)
      let clean = val.toString().replace(/,/g, '').replace(/\s/g, '');
      let n = parseFloat(clean);
      if (isNaN(n)) return 0;
      // Si el valor es mayor a 180, es muy probable que sea un entero representando decimales (ej: 1890531 -> 18.90531)
      // Escalamos dividiendo por 10 hasta que esté en un rango geográfico válido (-180 a 180)
      while (Math.abs(n) > 180) {
        n /= 10;
      }
      return n;
    };

    // Helper para limpiar números (especialmente para Peso con comas de miles)
    const parseNumber = (val) => {
      if (!val) return 0;
      let clean = val.toString().replace(/,/g, '').replace(/\s/g, '');
      let n = parseFloat(clean);
      return isNaN(n) ? 0 : n;
    };

    const formatTime = (timeStr, baseDateStr = "2026-04-10", offsetDays = 0) => {
      if (!timeStr) return `${baseDateStr}T14:00:00-06:00`;
      
      try {
        // Use date from data if available to avoid hardcoding
        const dataDate = data[0]?.[mapping.date || 'FechaEmision'] || data[0]?.['Fecha'] || baseDateStr;
        let finalBaseDate = baseDateStr;
        
        if (dataDate && typeof dataDate === 'string') {
          // Simple DD/MM/YYYY to YYYY-MM-DD
          if (dataDate.includes('/')) {
            const parts = dataDate.split('/');
            if (parts.length === 3) {
              finalBaseDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          } else if (dataDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Already YYYY-MM-DD
            finalBaseDate = dataDate;
          }
        }

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
          const hourOnly = parseInt(timeStr);
          if (!isNaN(hourOnly)) hours = hourOnly;
        }

        hours = Math.max(0, Math.min(23, hours));
        minutes = Math.max(0, Math.min(59, minutes));

        let finalDateStr = finalBaseDate;
        if (offsetDays > 0) {
          const d = new Date(finalBaseDate + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + offsetDays);
          finalDateStr = d.toISOString().split('T')[0];
        }

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
        profile: type.id.toLowerCase().includes('camioneta') ? "perfil_camioneta_ligera" : "perfil_camion_estandar",
        // Escalar capacidades
        capacities: (type.capacity || [18000]).map(cap => Math.round(parseNumber(cap) * SCALING_FACTOR)),
        capabilities: (type.skills && type.skills.length > 0) 
          ? type.skills.map(s => sanitizeId(s.trim())).filter(Boolean)
          : ['normal'],
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
      const maxDays = parseInt(cediConfig.maxShiftDays) || 1;
      
      const shift = {
        start: { time: formatTime(cediConfig.startTime), location: cediLoc },
        end: { 
          time: formatTime(cediConfig.endTime, undefined, maxDays - 1), 
          location: cediLoc
        }
      };

      // Inyectar descansos nocturnos (breaks) si el rango es de varios días
      if (maxDays > 1) {
        shift.breaks = [];
        for (let i = 0; i < maxDays - 1; i++) {
          const breakStart = formatTime(cediConfig.endTime, undefined, i);     // Ej: Hoy a las 17:00
          const breakEnd = formatTime(cediConfig.startTime, undefined, i + 1); // Ej: Mañana a las 06:00
          
          // Calcular la duración en segundos
          const dStart = new Date(breakStart).getTime();
          const dEnd = new Date(breakEnd).getTime();
          const durationSeconds = Math.max(0, (dEnd - dStart) / 1000);
          
          if (durationSeconds > 0) {
            shift.breaks.push({
              duration: durationSeconds,
              times: [
                [breakStart, breakEnd]
              ]
            });
          }
        }
      }

      if (vType.canReload) {
        shift.reloads = Array.from({ length: 5 }).map(() => ({
          location: cediLoc,
          duration: loadDur
        }));
      }
      return [shift];
    };

    // 3. Ya no hacemos agrupación manual. Dejamos que HERE Tour Planning lo haga mediante clustering.
    // Esto evita problemas de capacidad falsa cuando varios pedidos pequeños se suman y exceden el camión,
    // pero individualmente sí caben.
    console.log(`[Agrupación] Manual desactivada. Enviando ${data.length} pedidos individuales.`);
    console.log(`[Mapping Info] id: ${mapping.id}, clientCode: ${mapping.clientCode}, clientName: ${mapping.client}`);
    if (data.length > 0) {
      console.log("[Data Sample] First row keys:", Object.keys(data[0]));
    }

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
          profile: v.id.toLowerCase().includes('camioneta') ? "perfil_camioneta_ligera" : "perfil_camion_estandar",
          costs: { 
            fixed: parseFloat(v.costs?.fixed) || 0, 
            distance: 0.0001, 
            time: 0.0048 
          },
          shifts: getShiftsForType(v),
          // Escalar capacidades
          capacity: (v.capacity || [18000]).map(cap => Math.round(parseNumber(cap) * SCALING_FACTOR)),
          skills: (() => {
            const raw = (v.skills || ["normal"]).map(s => sanitizeId(s.trim())).filter(Boolean);
            return raw.length > 0 ? raw : ["normal"];
          })(),
          amount: parseInt(v.amount) || 1
        })),
        profiles: [
          { type: "truck", name: "perfil_camion_estandar" },
          { type: "car", name: "perfil_camioneta_ligera" }
        ]
      },
      plan: {
        clustering: {
          serviceTimeStrategy: {
            type: "maxDurationStrategy"
          }
        },
        jobs: data.map((row, index) => {
          const baseDuration = (parseInt(mapping.serviceTime) || 30) * 60;
          let lat = parseCoord(row[mapping.latitude]);
          let lng = parseCoord(row[mapping.longitude]);
          
          if (!mapping.longitude || !row[mapping.longitude]) {
            const coords = row[mapping.latitude]?.toString().split(',').map(c => parseCoord(c.trim())) || [0,0];
            lat = coords[0] || 0;
            lng = coords[1] || 0;
          }

          // Validación de seguridad: Si la coordenada es 0,0 o inválida, registrar para depuración
          if (lat === 0 && lng === 0) {
            console.warn(`⚠️ Pedido ${row[mapping.id]} ignorado por coordenadas inválidas (0,0)`);
            return null;
          }

          // Generar ID único para cada pedido
          const orderId = sanitizeId(row[mapping.id] || `idx_${index}`);

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
            id: `job_${orderId}`,
            tasks: {
              deliveries: [{
                places: [{
                  location: { lat, lng },
                  duration: baseDuration,
                  ...(rawStart && rawEnd ? {
                    times: Array.from({ length: (parseInt(cediConfig.maxShiftDays) || 1) }).map((_, dIdx) => [
                      formatTime(rawStart, "2026-04-10", dIdx), 
                      formatTime(rawEnd, "2026-04-10", dIdx)
                    ])
                  } : {})
                }],
                // Escalar demanda (Individual por pedido)
                demand: [(() => {
                  const rawWeight = Math.round(parseNumber(row[mapping.weight] || 0) * SCALING_FACTOR);
                  const MAX_HERE_INT = 2147483647;
                  if (rawWeight > MAX_HERE_INT) {
                    console.warn(`⚠️ ALERTA DE DATOS: El peso escalado del pedido ${orderId} (${rawWeight}) excede el límite.`);
                    return MAX_HERE_INT;
                  }
                  return rawWeight;
                })()]
              }]
            },
            skills: ['normal']
          };
        }).filter(Boolean),
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
    console.log("🔧 CLUSTERING_CONFIG:", JSON.stringify(problem.plan.clustering || "disabled", null, 2));
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
            let lat = parseFloat(cediConfig.lat), lng = parseFloat(cediConfig.lng);
            if (mapping.longitude && job[mapping.longitude]) {
              lat = parseFloat(job[mapping.latitude]) || lat;
              lng = parseFloat(job[mapping.longitude]) || lng;
            } else {
              const coordsStr = job[mapping.latitude];
              if (coordsStr && typeof coordsStr === 'string' && coordsStr.includes(',')) {
                const parts = coordsStr.split(',');
                lat = parseFloat(parts[0]) || lat;
                lng = parseFloat(parts[1]) || lng;
              }
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
              id: ['order_id', 'id_entrega', 'uuid', 'ID', 'Pedido', 'Número de pedido', 'Numero de pedido', 'Nro Pedido', 'Nro. Pedido', 'No. Pedido', 'No Pedido', 'id_pedido'],
              movimiento: ['EmbarqueMovMovID', 'movimiento', 'Movimiento', 'MOVIMIENTO', 'Nro Movimiento', 'Mov ID', 'ID Movimiento', 'Mov_ID'],
              client: ['Nombre Cliente', 'Nombre', 'Razon Social', 'NombreCompleto', 'ClientName', 'Nombre_Cliente', 'Nombre del cliente'],
              clientCode: ['Cliente', 'CodigoCliente', 'id_cliente', 'Codigo', 'ClientCode', 'Code', 'Cve Cliente', 'Clave', 'Nro Cliente', 'IdCliente', 'Código de cliente'],
              latitude: ['latLong', 'coordenadas', 'ubicacion', 'location', 'posicion', 'latitud', 'lat'],
              longitude: ['longitud', 'longitude', 'lng', 'lon'],
              weight: ['peso', 'weight', 'kg', 'kilogramos', 'volumen', 'carga', 'PesoArticulo', 'Total Peso', 'Masa'],
              time: ['horario', 'ventana', 'entrega_time', 'time', 'HoraInicio'],
              date: ['fecha', 'date', 'FechaEmision', 'Fecha'],
              address: ['Dirección', 'Address', 'Ubicación', 'Destino', 'Direccion', 'Calle']
            };

            Object.entries(detectionMap).forEach(([field, keywords]) => {
              // Buscar el mejor match basado en el orden de los keywords (prioridad)
              const bestKeyword = keywords.find(k => 
                detectedHeaders.some(h => h.toLowerCase() === k.toLowerCase())
              );
              
              if (bestKeyword) {
                const actualHeader = detectedHeaders.find(h => h.toLowerCase() === bestKeyword.toLowerCase());
                newMapping[field] = actualHeader;
              }
            });
            setMapping(newMapping);
          }
        }
      });
    }
  };

  const handleFleetFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data.filter(r => Object.values(r).some(v => v));
          if (rows.length > 0) {
            const detectedHeaders = Object.keys(rows[0]);
            setFleetData(rows);
            setFleetHeaders(detectedHeaders);
            setShowFleetMapping(true);
            
            const newMapping = { ...fleetMapping };
            const fleetDetectionMap = {
              id: ['ID', 'Vehiculo', 'Unit', 'unidad', 'placa', 'nombre'],
              amount: ['Amount', 'Cantidad', 'unidades', 'count'],
              fixedCost: ['Fixed Cost', 'Costo', 'Costo Fijo', 'costo_fijo', 'rate'],
              capacity: ['Capacity', 'Capacidad', 'KG', 'peso_max', 'volume'],
              skill: ['Skill', 'Tipo', 'Especialidad', 'habilidad', 'capability'],
              canReload: ['Reload', 'Recargas', 'permite_recarga', 'can_reload']
            };

            Object.entries(fleetDetectionMap).forEach(([field, keywords]) => {
              const found = detectedHeaders.find(h => 
                keywords.some(k => h.toLowerCase() === k.toLowerCase()) || 
                keywords.some(k => h.toLowerCase().includes(k.toLowerCase()) && k.length > 5)
              );
              if (found) newMapping[field] = found;
            });
            setFleetMapping(newMapping);
          }
        }
      });
    }
  };

  const applyFleetMapping = () => {
    const newFleet = fleetData.map(row => ({
      id: row[fleetMapping.id] || 'v_unidentified',
      amount: parseInt(row[fleetMapping.amount]) || 1,
      costs: { fixed: parseInt(row[fleetMapping.fixedCost]) || 0 },
      capacity: [parseInt(row[fleetMapping.capacity]) || 18000],
      skills: (row[fleetMapping.skill] || 'normal').split(',').map(s => s.trim()).filter(Boolean),
      canReload: row[fleetMapping.canReload] === 'SI' || row[fleetMapping.canReload] === 'true' || row[fleetMapping.canReload] === '1' || true
    }));
    setFleet(newFleet);
    setShowFleetMapping(false);
  };

  return (
    <div className={`app-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="brand-section">
          <div className="logo-box"><Route size={24} color="white" /></div>
          <h2>FLEET<span>MIND OPS</span></h2>
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
                <button
                  className={`nav-item-btn ${activeWorkspace === 'georef' ? 'active' : ''}`}
                  onClick={() => setActiveWorkspace('georef')}
                >
                  <div className="icon-wrap"><Target size={20} /></div>
                  <div className="text-wrap">
                    <span className="label">Calidad de Datos</span>
                    <span className="title">Georreferenciación</span>
                  </div>
                </button>
                <button
                  className={`nav-item-btn ${activeWorkspace === 'optimizer' ? 'active' : ''}`}
                  onClick={() => setActiveWorkspace('optimizer')}
                >
                  <div className="icon-wrap"><Route size={20} /></div>
                  <div className="text-wrap">
                    <span className="label">Planeación</span>
                    <span className="title">Optimización de Flota</span>
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
                <>
                  <div className="modal-section-title">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: 4, height: 18, background: 'var(--primary-electric)', borderRadius: 2 }}></div>
                      CONFIGURACIÓN OPERATIVA DEL CENTRO DE DISTRIBUCIÓN
                    </div>
                  </div>
                  
                  <div className="modal-grid">
                    {/* Fila 1: Identificación y Ubicación */}
                    <div className="form-item modal-full-width">
                      <label><Target size={14} style={{ marginRight: 6 }} /> Nombre Identificador del CEDI</label>
                      <input type="text" placeholder="Ej: CDMX - HUB Norte" value={cediConfig.name} onChange={(e) => setCediConfig({ ...cediConfig, name: e.target.value })} />
                    </div>

                    <div className="form-item modal-full-width">
                      <label><MapPin size={14} style={{ marginRight: 6 }} /> Referencia Geográfica (Ubicación Exacta)</label>
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="text" 
                          placeholder="Busca una dirección o arrastra el marcador..." 
                          value={cediAddress} 
                          onChange={e => handleAddressSearch(e.target.value)}
                          style={{ width: '100%', paddingLeft: '12px' }}
                        />
                        {suggestions.length > 0 && (
                          <div className="suggestions-dropdown" style={{ left: 0, right: 0, zIndex: 100 }}>
                            {suggestions.map((s, i) => (
                              <div key={i} className="suggestion-item" onClick={() => selectSuggestion(s)}>
                                <MapPin size={12} />
                                <span style={{ fontSize: '0.75rem' }}>{s.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <small style={{ color: '#64748b', fontSize: '0.65rem', marginTop: 4, display: 'block' }}>
                        Esta ubicación se utilizará como punto de partida y llegada para todas las rutas.
                      </small>
                    </div>

                    {/* Fila 2: Horarios de Operación */}
                    <div className="form-item">
                      <label><Clock size={14} style={{ marginRight: 6 }} /> Apertura de Puertas</label>
                      <input type="time" value={cediConfig.startTime} onChange={(e) => setCediConfig({ ...cediConfig, startTime: e.target.value })} />
                    </div>
                    <div className="form-item">
                      <label><Clock size={14} style={{ marginRight: 6 }} /> Cierre de Operación</label>
                      <input type="time" value={cediConfig.endTime} onChange={(e) => setCediConfig({ ...cediConfig, endTime: e.target.value })} />
                    </div>

                    {/* Fila 3: Parámetros Logísticos */}
                    <div className="form-item">
                      <label><Package size={14} style={{ marginRight: 6 }} /> Tiempo de Carga Promedio</label>
                      <div style={{ position: 'relative' }}>
                        <input type="number" value={cediConfig.loadDuration} onChange={(e) => setCediConfig({ ...cediConfig, loadDuration: e.target.value })} style={{ paddingRight: '45px' }} />
                        <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>MIN</span>
                      </div>
                    </div>
                    <div className="form-item">
                      <label><Target size={14} style={{ marginRight: 6 }} /> Días Máximos de Turno</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="7"
                        value={cediConfig.maxShiftDays} 
                        onChange={(e) => setCediConfig({ ...cediConfig, maxShiftDays: e.target.value })} 
                      />
                      <small style={{color: '#64748b', fontSize: '0.65rem'}}>1 = Entrega inmediata (mismo día)</small>
                    </div>

                    {/* Fila 4: Ventanas Horarias Especiales */}
                    <div className="form-item modal-full-width">
                      <label><AlertTriangle size={14} style={{ marginRight: 6 }} /> Ventanas Horarias por Defecto para Clientes</label>
                      <div className="nav-card" style={{ padding: '20px', background: 'rgba(3, 22, 54, 0.02)', border: '1px solid rgba(3, 22, 54, 0.05)' }}>
                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#334155' }}>RANGO HORARIO:</span>
                          <input type="time" value={cediConfig.globalJobStart} onChange={(e) => setCediConfig({ ...cediConfig, globalJobStart: e.target.value })} style={{ background: 'white' }} />
                          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>hasta</span>
                          <input type="time" value={cediConfig.globalJobEnd} onChange={(e) => setCediConfig({ ...cediConfig, globalJobEnd: e.target.value })} style={{ background: 'white' }} />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <input type="checkbox" checked={cediConfig.useGlobalForMissing} onChange={(e) => setCediConfig({ ...cediConfig, useGlobalForMissing: e.target.checked, useGlobalForAll: false })} />
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Aplicar este horario automáticamente a entregas sin ventana definida</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </>
              ) : configTab === 'fleet' ? (
                <div className="modal-sub-section animate-fade-in">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div className="modal-section-title" style={{ margin: 0, border: 0 }}>Gestión de Flota</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <label className="btn-mini" style={{ cursor: 'pointer', background: 'white', color: 'var(--primary-electric)', border: '1px solid var(--primary-electric)' }}>
                        <Upload size={14} style={{ marginRight: 6 }} />
                        Importar CSV
                        <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFleetFileUpload} />
                      </label>
                      <button className="btn-mini" onClick={() => setFleet([...fleet, { id: 'Tipo_' + (fleet.length + 1), costs: { fixed: 100 }, capacity: [18000], skills: ['normal'], amount: 5, canReload: true }])}>
                        + Agregar Tipo de Vehículo
                      </button>
                    </div>
                  </div>

                  {showFleetMapping && (
                    <div className="nav-card animate-slide-up" style={{ padding: '24px', marginBottom: '24px', background: 'rgba(0, 88, 190, 0.03)', border: '1px solid rgba(0, 88, 190, 0.15)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Settings size={18} color="var(--primary-electric)" />
                          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Mapeador Flexible de Flota</span>
                        </div>
                        <button className="btn-mini" onClick={applyFleetMapping} style={{ padding: '0.5rem 1.5rem' }}>Confirmar y Cargar Flota</button>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                        <div className="form-item">
                          <label style={{ fontSize: '0.65rem' }}>Identificador</label>
                          <select value={fleetMapping.id} onChange={e => setFleetMapping({...fleetMapping, id: e.target.value})}>
                            <option value="">-- Seleccionar --</option>
                            {fleetHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="form-item">
                          <label style={{ fontSize: '0.65rem' }}>Cantidad</label>
                          <select value={fleetMapping.amount} onChange={e => setFleetMapping({...fleetMapping, amount: e.target.value})}>
                            <option value="">-- Seleccionar --</option>
                            {fleetHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="form-item">
                          <label style={{ fontSize: '0.65rem' }}>Costo Fijo</label>
                          <select value={fleetMapping.fixedCost} onChange={e => setFleetMapping({...fleetMapping, fixedCost: e.target.value})}>
                            <option value="">-- Seleccionar --</option>
                            {fleetHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="form-item">
                          <label style={{ fontSize: '0.65rem' }}>Capacidad (KG)</label>
                          <select value={fleetMapping.capacity} onChange={e => setFleetMapping({...fleetMapping, capacity: e.target.value})}>
                            <option value="">-- Seleccionar --</option>
                            {fleetHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="form-item">
                          <label style={{ fontSize: '0.65rem' }}>Especialidad / Skill</label>
                          <select value={fleetMapping.skill} onChange={e => setFleetMapping({...fleetMapping, skill: e.target.value})}>
                            <option value="">-- Seleccionar --</option>
                            {fleetHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="form-item">
                          <label style={{ fontSize: '0.65rem' }}>Permite Recarga</label>
                          <select value={fleetMapping.canReload} onChange={e => setFleetMapping({...fleetMapping, canReload: e.target.value})}>
                            <option value="">-- Seleccionar --</option>
                            {fleetHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                  
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
            <button
              className="sidebar-toggle-btn"
              onClick={() => setIsSidebarCollapsed(prev => !prev)}
              title={isSidebarCollapsed ? 'Mostrar barra lateral' : 'Ocultar barra lateral'}
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              <span>{isSidebarCollapsed ? 'Mostrar menú' : 'Ocultar menú'}</span>
            </button>
          </div>
          <div className="actions" style={{ display: 'flex', gap: '12px' }}>

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
          {activeWorkspace === 'georef' ? (
            <GeoreferenceModule apiKey={API_KEY} />
          ) : status === 'success' && result ? (
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
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8293ba', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Nombre Cliente</label>
                  <select value={mapping.client} onChange={e => setMapping({...mapping, client: e.target.value})} style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    <option value="">-- Opcional --</option>
                    {headers.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-item">
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8293ba', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Código Cliente (Agrupación)</label>
                  <select value={mapping.clientCode} onChange={e => setMapping({...mapping, clientCode: e.target.value})} style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    <option value="">-- Usar nombre/ID --</option>
                    {headers.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-item">
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8293ba', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Id de Registro</label>
                  <select value={mapping.id} onChange={e => setMapping({...mapping, id: e.target.value})} style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    {headers.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-item">
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8293ba', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Latitud / Coords</label>
                  <select value={mapping.latitude} onChange={e => setMapping({...mapping, latitude: e.target.value})} style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    {headers.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-item">
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8293ba', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Longitud (Opcional)</label>
                  <select value={mapping.longitude} onChange={e => setMapping({...mapping, longitude: e.target.value})} style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    <option value="">-- Usar columna inicial --</option>
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
                <div className="form-item">
                  <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8293ba', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Dirección</label>
                  <select value={mapping.address} onChange={e => setMapping({...mapping, address: e.target.value})} style={{ width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    <option value="">-- Seleccionar --</option>
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
