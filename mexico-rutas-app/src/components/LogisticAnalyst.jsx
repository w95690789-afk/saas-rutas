import React, { useMemo, useState } from 'react';
import { 
  BarChart3, TrendingUp, Truck, Package, BrainCircuit, 
  Clock, MapPin, Gauge, AlertCircle, TrendingDown,
  Target, ShieldAlert, Info, ChevronDown, ChevronUp, 
  LayoutGrid, List, Calendar, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Maximize2
} from 'lucide-react';

const LogisticAnalyst = ({ result, fullData = [], mapping = {} }) => {
  const [expandedVehicles, setExpandedVehicles] = useState({});
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'gantt'
  const [ganttZoom, setGanttZoom] = useState('auto'); // 'auto', '1d', '3d', '7d'
  const [ganttDayOffset, setGanttDayOffset] = useState(0);
  const [showUnassigned, setShowUnassigned] = useState(false);

  const sanitizeId = (id) => id ? id.toString().replace(/[^a-zA-Z0-9_-]/g, '_') : 'unknown';

  // ─── Extractores universales de tiempo ───
  // HERE API v3 devuelve: stop.time.arrival / stop.time.departure
  // Mock/simulador devuelve: stop.arrival.time / stop.departure.time
  // Esta función prueba ambos caminos
  const getStopArrival = (stop) => {
    if (!stop) return null;
    return stop.arrival?.time || stop.time?.arrival || 
           (typeof stop.arrival === 'string' ? stop.arrival : null);
  };

  const getStopDeparture = (stop) => {
    if (!stop) return null;
    return stop.departure?.time || stop.time?.departure || 
           (typeof stop.departure === 'string' ? stop.departure : null);
  };

  // Convierte cualquier timestamp a milisegundos UTC
  const normalizeToMs = (dateInput) => {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput.getTime();
    const ms = new Date(dateInput).getTime();
    return isNaN(ms) ? null : ms;
  };

  const translateReason = (reasonCode = '', reasonText = '') => {
    const code = (reasonCode || '').toUpperCase();
    const text = (reasonText || '').toLowerCase();

    const byCode = {
      CAPACITY_CONSTRAINT: 'Capacidad insuficiente de vehículo',
      TIME_WINDOW_CONSTRAINT: 'Ventana horaria incumplida',
      SKILL_CONSTRAINT: 'Habilidad requerida no disponible',
      DISTANCE_CONSTRAINT: 'Distancia fuera de alcance',
      MAX_DISTANCE_CONSTRAINT: 'Límite de distancia excedido',
      MAX_DURATION_CONSTRAINT: 'Duración máxima de ruta excedida',
      REACHABILITY_CONSTRAINT: 'Ubicación no alcanzable',
      PRECEDENCE_CONSTRAINT: 'Dependencia de secuencia no cumplida',
    };

    if (byCode[code]) return byCode[code];
    if (text.includes('capacity')) return 'Capacidad insuficiente de vehículo';
    if (text.includes('time window')) return 'Ventana horaria incumplida';
    if (text.includes('skill')) return 'Habilidad requerida no disponible';
    if (text.includes('distance')) return 'Distancia fuera de alcance';
    if (text.includes('duration')) return 'Duración máxima de ruta excedida';
    if (text.includes('reach')) return 'Ubicación no alcanzable';
    return reasonText || 'Sin detalle disponible';
  };

  const analysis = useMemo(() => {
    if (!result || !result.solution) return null;

    const solution = result.solution;
    const problem = result.problem || { plan: { jobs: [] } };
    const tours = solution.tours || [];
    const unassigned = solution.unassigned || [];

    // ─── FIX: Mapeo doble de Job IDs ───
    // Creamos dos mapas para manejar ambos formatos:
    // 1. Formato del simulador: job_{sanitizeId(id)}_normal
    // 2. Formato real HERE: job_{sanitizeId(id + "_" + skill)}
    const jobToOrdersMap = {};
    if (fullData.length > 0 && mapping.id) {
      fullData.forEach(row => {
        const rawId = row[mapping.id];
        const skill = row[mapping.skill] || 'normal';
        const id = sanitizeId(rawId);
        
        // Formato 1: Usado en simulador (job_{id}_{skill})
        const jId1 = `job_${id}_${skill}`;
        if (!jobToOrdersMap[jId1]) jobToOrdersMap[jId1] = [];
        jobToOrdersMap[jId1].push(row);
        
        // Formato 2: Usado por HERE API (job_{sanitizeId(id+"_"+skill)})
        const jId2 = `job_${sanitizeId(`${rawId}_${skill}`)}`;
        if (jId2 !== jId1) {
          if (!jobToOrdersMap[jId2]) jobToOrdersMap[jId2] = [];
          jobToOrdersMap[jId2].push(row);
        }
      });
    }

    const jobWeightMap = (problem.plan?.jobs || []).reduce((acc, job) => {
      const weight = job.tasks?.deliveries?.[0]?.demand?.[0] || 0;
      acc[job.id] = weight;
      return acc;
    }, {});

    // DEBUG: Log structure for diagnostics
    if (tours.length > 0 && tours[0].stops?.length > 0) {
      console.log('🔍 DEBUG_STOP_STRUCTURE (stop[0]):', JSON.stringify(tours[0].stops[0], null, 2));
      console.log('🔍 DEBUG_STOP_STRUCTURE (stop[1]):', JSON.stringify(tours[0].stops[1], null, 2));
      console.log('🔍 DEBUG_TOUR_KEYS:', Object.keys(tours[0]));
      // DEBUG: Log service time per delivery stop to diagnose clustering
      tours.forEach((tour, tIdx) => {
        (tour.stops || []).forEach((stop, sIdx) => {
          const deliveries = (stop.activities || []).filter(a => a.type === 'delivery');
          if (deliveries.length > 0) {
            let actualServiceMs = 0;
            // HERE API commonly returns time inside the activity object (e.g. activity.time.start)
            deliveries.forEach(act => {
              const start = act.time?.start || act.startTime || act.time?.arrival || act.arrival?.time;
              const end = act.time?.end || act.endTime || act.time?.departure || act.departure?.time;
              if (start && end) {
                actualServiceMs += new Date(end).getTime() - new Date(start).getTime();
              }
            });
            const diffMin = actualServiceMs / 60000;
            
            // Si el servicio es 0, probablemente usamos mock (que no detalla tiempo por actividad)
            if (diffMin === 0) {
              const arr = getStopArrival(stop);
              const dep = getStopDeparture(stop);
              if (arr && dep) {
                const stopDiffMin = (new Date(dep).getTime() - new Date(arr).getTime()) / 60000;
                console.log(`📦 Tour[${tIdx}] Stop[${sIdx}]: ${deliveries.length} deliveries, STOP time (incl. wait) = ${stopDiffMin.toFixed(2)} min`);
              }
            } else {
              console.log(`📦 Tour[${tIdx}] Stop[${sIdx}]: ${deliveries.length} deliveries, actual service time = ${diffMin.toFixed(2)} min`);
            }
          }
        });
      });
    }

    const vehiclePerformance = tours.map(tour => {
      const stops = tour.stops || [];
      // Usar extractores universales (compatibles con Mock Y HERE API)
      const startTimeRaw = getStopDeparture(stops[0]) || getStopArrival(stops[0]) || "";
      const endTimeRaw = getStopArrival(stops[stops.length - 1]) || "";
      const rawType = (tour.typeId || "Desconocido").toLowerCase();
      const displayType = rawType.includes('tracto') ? 'Tracto Pesado' : 
                          rawType.includes('torton') ? 'Torton Propio' :
                          rawType.includes('camioneta') ? 'Camioneta' :
                          rawType.includes('truck') ? 'Camión Tercero' : tour.typeId || 'Desconocido';
      const capacity = rawType.includes('tracto') ? 31000 : 
                       rawType.includes('torton') ? 18000 : 
                       rawType.includes('camioneta') ? 7000 : 18000;

      // Itinerario Completo
      let deliveryIndex = 0;
      const itinerary = stops.map((stop, index) => {
        const isDepot = index === 0 || index === stops.length - 1;
        const activities = stop.activities || [];
        const deliveries = activities.filter(a => a.type === 'delivery');
        const reloads = activities.filter(a => a.type === 'reload');
        
        let clientName = 'CEDI';
        if (deliveries.length > 0) {
          deliveryIndex++;
          const orders = jobToOrdersMap[deliveries[0].jobId] || [];
          clientName = orders[0]?.[mapping.name] || 'Cliente';
        }

        const stopLabel = index === 0 ? 'Salida CEDI' : 
                          index === stops.length - 1 ? 'Retorno Final CEDI' : 
                          reloads.length > 0 ? 'Recarga en CEDI' : clientName;

        // FIX: Identificar Service vs Waiting time
        const arrivalMs = normalizeToMs(getStopArrival(stop));
        const departureMs = normalizeToMs(getStopDeparture(stop));
        
        let waitMs = 0;
        let serviceMs = 0;
        
        if (arrivalMs && departureMs) {
          // Sumar tiempo real de actividades
          deliveries.forEach(act => {
             const s = normalizeToMs(act.time?.start || act.startTime || act.time?.arrival || act.arrival?.time);
             const e = normalizeToMs(act.time?.end || act.endTime || act.time?.departure || act.departure?.time);
             if (s && e) serviceMs += (e - s);
          });
          reloads.forEach(act => {
             const s = normalizeToMs(act.time?.start || act.startTime || act.time?.arrival || act.arrival?.time);
             const e = normalizeToMs(act.time?.end || act.endTime || act.time?.departure || act.departure?.time);
             if (s && e) serviceMs += (e - s);
          });
          
          // Si no hay detalle de actividades (Mock), el servicio es la diferencia
          if (serviceMs === 0) {
            serviceMs = departureMs - arrivalMs;
          } else {
            waitMs = Math.max(0, (departureMs - arrivalMs) - serviceMs);
          }
        }

        return {
          label: stopLabel,
          clientName,
          sequence: deliveries.length > 0 ? deliveryIndex : null,
          type: isDepot ? 'depot' : reloads.length > 0 ? 'reload' : 'delivery',
          location: stop.location,
          arrival: arrivalMs ? new Date(arrivalMs) : null,
          departure: departureMs ? new Date(departureMs) : null,
          waitMin: waitMs / 60000,
          serviceMin: serviceMs / 60000,
          jobs: deliveries.map(d => ({
            jobId: d.jobId,
            orders: jobToOrdersMap[d.jobId] || []
          }))
        };
      });

      const totalLoad = itinerary.reduce((acc, stop) => 
        acc + stop.jobs.reduce((jAcc, job) => jAcc + (jobWeightMap[job.jobId] || 0), 0), 0
      );
      
      const utilization = (totalLoad / capacity) * 100;
      const totalOrdersCount = itinerary.reduce((acc, stop) => 
        acc + stop.jobs.reduce((jAcc, j) => jAcc + j.orders.length, 0), 0
      );

      // Extraer rango de fechas del tour
      const startMs = normalizeToMs(startTimeRaw);
      const endMs = normalizeToMs(endTimeRaw);

      return {
        id: tour.vehicleId,
        typeId: rawType,
        type: displayType,
        startTime: startMs ? new Date(startMs) : null,
        endTime: endMs ? new Date(endMs) : null,
        startMs,
        endMs,
        stopsCount: itinerary.filter(s => s.type === 'delivery').length,
        totalOrdersCount,
        load: totalLoad,
        capacity,
        utilization,
        distance: Math.round((tour.statistic?.distance || 0) / 1000),
        itinerary
      };
    });

    // Calcular rango real de datos (para auto-zoom del Gantt)
    let dataMinMs = Infinity, dataMaxMs = -Infinity;
    vehiclePerformance.forEach(v => {
      if (v.startMs && v.startMs < dataMinMs) dataMinMs = v.startMs;
      if (v.endMs && v.endMs > dataMaxMs) dataMaxMs = v.endMs;
      v.itinerary.forEach(stop => {
        const a = stop.arrival?.getTime();
        const d = stop.departure?.getTime();
        if (a && a < dataMinMs) dataMinMs = a;
        if (d && d > dataMaxMs) dataMaxMs = d;
      });
    });

    const totalWeight = vehiclePerformance.reduce((acc, v) => acc + v.load, 0);
    const totalCapacity = vehiclePerformance.reduce((acc, v) => acc + v.capacity, 0);
    const globalUtilization = totalCapacity > 0 ? (totalWeight / totalCapacity) * 100 : 0;
    const totalDist = vehiclePerformance.reduce((acc, v) => acc + v.distance, 0);

    // Fechas únicas en los datos
    const uniqueDays = new Set();
    vehiclePerformance.forEach(v => {
      if (v.startTime) uniqueDays.add(v.startTime.toISOString().split('T')[0]);
      if (v.endTime) uniqueDays.add(v.endTime.toISOString().split('T')[0]);
    });

    const unassignedDetails = unassigned.map((item, idx) => {
      const jobId = item.jobId || item.id || `sin_job_${idx}`;
      const reasons = item.reasons || item.code || [];
      const reasonList = Array.isArray(reasons) ? reasons : [reasons];
      const reasonCodes = reasonList.map(r => (r?.code || r || '').toString()).filter(Boolean);
      const rawReason = reasonList.map(r => (r?.description || r || '').toString()).filter(Boolean).join(', ');
      const reasonEs = reasonList
        .map(r => translateReason(r?.code || '', r?.description || r?.toString?.() || ''))
        .filter(Boolean)
        .join(', ');

      const linkedOrders = jobToOrdersMap[jobId] || [];

      return {
        jobId,
        reasonCodes,
        reasonRaw: rawReason || 'Sin motivo especificado',
        reasonEs: reasonEs || 'Sin motivo especificado',
        orders: linkedOrders,
        ordersCount: linkedOrders.length,
      };
    });

    const totalOrdersFromCsv = fullData.length || 0;
    const totalOrdersAssigned = vehiclePerformance.reduce((acc, v) => acc + v.totalOrdersCount, 0);
    const totalOrdersUnassignedFromMap = unassignedDetails.reduce((acc, u) => acc + u.ordersCount, 0);
    const totalOrdersUnassigned = Math.max(totalOrdersFromCsv - totalOrdersAssigned, totalOrdersUnassignedFromMap, 0);
    const coveragePct = totalOrdersFromCsv > 0 ? ((totalOrdersAssigned / totalOrdersFromCsv) * 100) : 0;
    const totalRoutes = tours.length || 0;
    const totalStopsAssigned = vehiclePerformance.reduce((acc, v) => acc + v.stopsCount, 0);
    const averageOrdersPerRoute = totalRoutes > 0 ? (totalOrdersAssigned / totalRoutes) : 0;
    const averageKmPerRoute = totalRoutes > 0 ? (totalDist / totalRoutes) : 0;
    const consolidationRatio = totalStopsAssigned > 0 ? (totalOrdersAssigned / totalStopsAssigned) : 0;
    const estimatedSingleTripRoutes = totalOrdersAssigned;
    const estimatedOptimizedRoutes = Math.max(totalRoutes, 1);
    const estimatedRoutesSaved = Math.max(estimatedSingleTripRoutes - estimatedOptimizedRoutes, 0);
    const productivityGainPct = estimatedSingleTripRoutes > 0
      ? (estimatedRoutesSaved / estimatedSingleTripRoutes) * 100
      : 0;
    // ROI proxy para toma de decisión ejecutiva cuando no hay costo total facturado en respuesta HERE
    const roiIndex = Math.max(0, Math.min(100,
      (coveragePct * 0.45) +
      (Math.min(consolidationRatio, 3) / 3) * 25 +
      (Math.min(globalUtilization, 100) * 0.20) +
      (Math.min(productivityGainPct, 100) * 0.10)
    ));

    const constraintStats = unassignedDetails.reduce((acc, item) => {
      if (!item.reasonCodes.length) {
        acc.SIN_CODIGO = (acc.SIN_CODIGO || 0) + 1;
        return acc;
      }
      item.reasonCodes.forEach(code => {
        const normalized = (code || 'SIN_CODIGO').toUpperCase();
        acc[normalized] = (acc[normalized] || 0) + 1;
      });
      return acc;
    }, {});
    const topConstraints = Object.entries(constraintStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const strategicInsights = [];
    if (coveragePct >= 95) {
      strategicInsights.push("Cobertura sobresaliente: la operación está absorbiendo casi toda la demanda con alta continuidad de servicio.");
    } else if (coveragePct >= 85) {
      strategicInsights.push("Cobertura sólida con margen de mejora: conviene atacar restricciones para cerrar la brecha final de asignación.");
    } else {
      strategicInsights.push("Cobertura baja para estándar industrial: se recomienda ajuste inmediato de flota, skills o ventanas horarias.");
    }

    if (consolidationRatio >= 1.5) {
      strategicInsights.push("Consolidación eficiente: se están atendiendo múltiples pedidos por parada, reduciendo fricción operativa.");
    } else {
      strategicInsights.push("Consolidación limitada: hay oportunidad de agrupar mejor pedidos por zona para elevar productividad.");
    }

    if (topConstraints.length > 0) {
      strategicInsights.push(`Restricción principal detectada: ${translateReason(topConstraints[0][0], topConstraints[0][0])}.`);
    }

    return {
      vehiclePerformance,
      globalUtilization,
      totalWeight,
      totalDist,
      unassigned,
      unassignedCount: unassigned.length,
      assignedJobsCount: tours.reduce((acc, t) => acc + t.stops.flatMap(s => s.activities).filter(a => a.type === 'delivery').length, 0),
      totalOrdersAssigned: vehiclePerformance.reduce((acc, v) => acc + v.totalOrdersCount, 0),
      totalOrdersFromCsv,
      totalOrdersUnassigned,
      coveragePct,
      totalRoutes,
      totalStopsAssigned,
      averageOrdersPerRoute,
      averageKmPerRoute,
      consolidationRatio,
      estimatedRoutesSaved,
      productivityGainPct,
      roiIndex,
      topConstraints,
      strategicInsights,
      unassignedDetails,
      totalJobsInProblem: problem.plan?.jobs?.length || 0,
      dataMinMs: dataMinMs === Infinity ? null : dataMinMs,
      dataMaxMs: dataMaxMs === -Infinity ? null : dataMaxMs,
      dataDays: uniqueDays.size || 1,
    };
  }, [result, fullData, mapping]);

  if (!analysis) return null;

  const toggleExpand = (vId) => {
    setExpandedVehicles(prev => ({ ...prev, [vId]: !prev[vId] }));
  };

  const formatTime = (date) => {
    if (!date) return "--:--";
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    if (!date) return "";
    return date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // ─── GANTT: Cálculo dinámico del rango visible ───
  const ganttView = useMemo(() => {
    if (!analysis.dataMinMs) return null;

    // Fecha base: inicio de los datos (a las 00:00 de ese día)
    const baseDate = new Date(analysis.dataMinMs);
    baseDate.setHours(0, 0, 0, 0);

    // Determinar cuántos días mostrar
    let daysToShow;
    if (ganttZoom === 'auto') {
      daysToShow = Math.max(1, analysis.dataDays);
    } else if (ganttZoom === '1d') {
      daysToShow = 1;
    } else if (ganttZoom === '3d') {
      daysToShow = 3;
    } else {
      daysToShow = 7;
    }

    // Aplicar offset de navegación
    const viewStartDate = new Date(baseDate.getTime() + ganttDayOffset * 86400000);
    
    let viewStartMs, viewEndMs;
    if (daysToShow === 1) {
      // Vista de un solo día: 05:00 a 23:00
      viewStartMs = viewStartDate.getTime() + 5 * 3600000;
      viewEndMs = viewStartDate.getTime() + 23 * 3600000;
    } else {
      // Vista multi-día: 00:00 del primer día hasta 24:00 del último
      viewStartMs = viewStartDate.getTime();
      viewEndMs = viewStartDate.getTime() + daysToShow * 86400000;
    }

    // Generar marcas de tiempo para el header
    const ticks = [];
    if (daysToShow === 1) {
      // Cada hora de 05:00 a 23:00
      for (let h = 5; h <= 23; h++) {
        const tickMs = viewStartDate.getTime() + h * 3600000;
        ticks.push({
          ms: tickMs,
          label: `${String(h).padStart(2, '0')}:00`,
          isMajor: h % 3 === 0,
          isDay: false
        });
      }
    } else if (daysToShow <= 3) {
      // Cada 3 horas con separadores de día
      for (let d = 0; d < daysToShow; d++) {
        const dayStart = viewStartDate.getTime() + d * 86400000;
        const dayDate = new Date(dayStart);
        ticks.push({
          ms: dayStart,
          label: dayDate.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' }),
          isMajor: true,
          isDay: true
        });
        for (let h = 6; h < 24; h += 3) {
          ticks.push({
            ms: dayStart + h * 3600000,
            label: `${String(h).padStart(2, '0')}:00`,
            isMajor: false,
            isDay: false
          });
        }
      }
    } else {
      // Semana: un tick por día + marcas a las 6, 12, 18
      for (let d = 0; d < daysToShow; d++) {
        const dayStart = viewStartDate.getTime() + d * 86400000;
        const dayDate = new Date(dayStart);
        ticks.push({
          ms: dayStart,
          label: dayDate.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' }),
          isMajor: true,
          isDay: true
        });
        [12].forEach(h => {
          ticks.push({
            ms: dayStart + h * 3600000,
            label: `${h}:00`,
            isMajor: false,
            isDay: false
          });
        });
      }
    }

    // Separadores de día para las líneas verticales fuertes
    const daySeparators = [];
    for (let d = 0; d <= daysToShow; d++) {
      daySeparators.push(viewStartDate.getTime() + d * 86400000);
    }

    return { viewStartMs, viewEndMs, ticks, daysToShow, daySeparators, viewStartDate };
  }, [analysis, ganttZoom, ganttDayOffset]);

  // Posición en % dentro del rango visible del Gantt
  const getGanttPos = (date) => {
    if (!date || !ganttView) return 0;
    const ms = date instanceof Date ? date.getTime() : new Date(date).getTime();
    const range = ganttView.viewEndMs - ganttView.viewStartMs;
    if (range <= 0) return 0;
    return Math.max(0, Math.min(100, ((ms - ganttView.viewStartMs) / range) * 100));
  };

  const getTickPos = (ms) => {
    if (!ganttView) return 0;
    const range = ganttView.viewEndMs - ganttView.viewStartMs;
    if (range <= 0) return 0;
    return ((ms - ganttView.viewStartMs) / range) * 100;
  };

  // Navegación del Gantt
  const canGoBack = ganttDayOffset > 0;
  const canGoForward = ganttView && ganttDayOffset < (analysis.dataDays - 1);

  const handleGanttNav = (direction) => {
    const step = ganttZoom === '1d' ? 1 : ganttZoom === '3d' ? 3 : 7;
    setGanttDayOffset(prev => Math.max(0, prev + direction * step));
  };

  return (
    <div className="strategic-dashboard animate-fade-in">
      <div className="strategic-header">
        <div className="title-block">
          <BrainCircuit size={28} color="var(--primary-electric)" />
          <div>
            <h2>Centro de Control Logístico</h2>
            <p>Visualización de rutas y cronogramas industriales</p>
          </div>
        </div>
        <div className="global-kpis">
          <div className="view-mode-selector">
            <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}><List size={16}/> Lista</button>
            <button className={viewMode === 'gantt' ? 'active' : ''} onClick={() => setViewMode('gantt')}><Calendar size={16}/> Cronograma</button>
          </div>
          <div className="kpi-mini-card highlight">
            <span className="kpi-label">Uso de Activos</span>
            <div className="kpi-value-row">
              <span className="kpi-value">{Math.round(analysis.globalUtilization)}%</span>
              <Gauge size={16} />
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="report-section">
          <div className="performance-table-wrapper">
            <table className="performance-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Unidad</th>
                  <th>Tipo</th>
                  <th>Horario Turno</th>
                  <th>Entregas</th>
                  <th>Carga Útil</th>
                  <th>Ocupación</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {analysis.vehiclePerformance.map((v) => (
                  <React.Fragment key={v.id}>
                    <tr className={expandedVehicles[v.id] ? 'expanded-row' : ''} onClick={() => toggleExpand(v.id)} style={{ cursor: 'pointer' }}>
                      <td>{expandedVehicles[v.id] ? <ChevronUp size={18} color="#8293ba" /> : <ChevronDown size={18} color="#8293ba" />}</td>
                      <td><strong>{v.id}</strong></td>
                      <td><span className="badge-type">{v.type}</span></td>
                      <td>
                        <div className="time-cell">
                          <Clock size={12} />
                          <span>{formatTime(v.startTime)} - {formatTime(v.endTime)}</span>
                          {analysis.dataDays > 1 && v.startTime && (
                            <span style={{ fontSize: '0.6rem', color: '#94a3b8', display: 'block' }}>
                              {formatDate(v.startTime)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className="count-bubble" style={{ width: 'fit-content' }}>{v.stopsCount} Clientes</span>
                          <span style={{ fontSize: '0.7rem', color: '#666', marginTop: '4px' }}>{v.totalOrdersCount} Pedidos</span>
                        </div>
                      </td>
                      <td><strong>{Math.round(v.load).toLocaleString()} kg</strong></td>
                      <td>
                        <div className="util-bar-container">
                          <div className="util-bar-bg"><div className={`util-bar-fill ${v.utilization > 90 ? 'high' : 'low'}`} style={{ width: `${Math.min(v.utilization, 100)}%` }}></div></div>
                          <span className="util-text">{Math.round(v.utilization)}%</span>
                        </div>
                      </td>
                      <td><button className="btn-detail-small">Ver Hoja de Ruta</button></td>
                    </tr>
                    
                    {expandedVehicles[v.id] && (
                      <tr className="itinerary-detail-row">
                        <td colSpan="8">
                          <div className="itinerary-expand-container animate-fade-in">
                            <div className="itinerary-grid">
                              {v.itinerary.map((stop, sIdx) => {
                                const orders = stop.jobs.flatMap(j => j.orders);
                                return (
                                  <div key={sIdx} className={`itinerary-step ${stop.type}`}>
                                    <div className="step-timeline">
                                      <div className="step-dot">
                                        {stop.sequence && <span className="dot-number">{stop.sequence}</span>}
                                      </div>
                                      {sIdx < v.itinerary.length - 1 && <div className="step-line"></div>}
                                    </div>
                                    <div className="step-content">
                                      <div className="step-header">
                                        <div className="step-title-row">
                                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span className="step-label">{stop.label}</span>
                                            {stop.type === 'delivery' && <span className="step-sublabel">Ruta Secuencia #{stop.sequence}</span>}
                                          </div>
                                          <span className="step-time">
                                            {stop.arrival && stop.departure && stop.arrival.getTime() !== stop.departure.getTime()
                                              ? `${formatTime(stop.arrival)} - ${formatTime(stop.departure)}`
                                              : stop.type === 'depot' && sIdx === 0
                                                ? `Sale: ${formatTime(stop.departure || stop.arrival)}`
                                                : stop.type === 'depot' && sIdx === v.itinerary.length - 1
                                                  ? `Llega: ${formatTime(stop.arrival || stop.departure)}`
                                                  : stop.arrival && stop.departure
                                                    ? `${formatTime(stop.arrival)} - ${formatTime(stop.departure)}`
                                                    : stop.arrival
                                                      ? `Llegada: ${formatTime(stop.arrival)}`
                                                      : `Salida: ${formatTime(stop.departure)}`}
                                          </span>
                                        </div>
                                      </div>
                                      
                                      {orders.length > 0 && (
                                        <div className="step-orders">
                                          {orders.map((order, oIdx) => (
                                            <div key={oIdx} className="order-mini-pill">
                                              <Package size={10} />
                                              <span>{order[mapping.id]}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="gantt-master-container animate-fade-in">
          {/* ─── GANTT TOOLBAR ─── */}
          <div className="gantt-toolbar">
            <div className="gantt-toolbar-left">
              <span className="gantt-toolbar-label">Vista:</span>
              <div className="gantt-zoom-selector">
                <button className={ganttZoom === 'auto' ? 'active' : ''} onClick={() => { setGanttZoom('auto'); setGanttDayOffset(0); }}>
                  <Maximize2 size={13} /> Auto
                </button>
                <button className={ganttZoom === '1d' ? 'active' : ''} onClick={() => { setGanttZoom('1d'); setGanttDayOffset(0); }}>
                  1D
                </button>
                <button className={ganttZoom === '3d' ? 'active' : ''} onClick={() => { setGanttZoom('3d'); setGanttDayOffset(0); }}>
                  3D
                </button>
                <button className={ganttZoom === '7d' ? 'active' : ''} onClick={() => { setGanttZoom('7d'); setGanttDayOffset(0); }}>
                  7D
                </button>
              </div>
            </div>
            <div className="gantt-toolbar-right">
              <button 
                className="gantt-nav-btn" 
                disabled={!canGoBack}
                onClick={() => handleGanttNav(-1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="gantt-date-label">
                {ganttView?.viewStartDate ? (
                  ganttView.daysToShow === 1 
                    ? ganttView.viewStartDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                    : `${ganttView.viewStartDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} – ${new Date(ganttView.viewStartDate.getTime() + (ganttView.daysToShow - 1) * 86400000).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}`
                ) : 'Sin datos'}
              </span>
              <button 
                className="gantt-nav-btn"
                disabled={!canGoForward}
                onClick={() => handleGanttNav(1)}
              >
                <ChevronRight size={16} />
              </button>
              <div className="gantt-legend">
                <span className="legend-item"><span className="legend-dot depot"></span>CEDI</span>
                <span className="legend-item"><span className="legend-dot delivery"></span>Entrega</span>
                <span className="legend-item"><span className="legend-dot reload"></span>Recarga</span>
              </div>
            </div>
          </div>

          {/* ─── GANTT HEADER (Timeline) ─── */}
          <div className="gantt-header-v2">
            <div className="gantt-label-header">Vehículo / Unidad</div>
            <div className="gantt-timeline-header">
              {ganttView?.ticks.map((tick, i) => (
                <div 
                  key={i} 
                  className={`hour-mark ${tick.isDay ? 'day-mark' : ''} ${tick.isMajor ? 'major' : ''}`}
                  style={{ left: `${getTickPos(tick.ms)}%` }}
                >
                  <span>{tick.label}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* ─── GANTT BODY ─── */}
          <div className="gantt-body">
            {analysis.vehiclePerformance.map(v => (
              <div key={v.id} className="gantt-row-v2">
                <div className="gantt-v-info">
                  <div className="v-tag">
                    <Truck size={12} />
                    <strong>{v.id}</strong>
                  </div>
                  <div className="v-stats">
                    <span>{v.stopsCount} paradas</span>
                    <span className={v.utilization > 85 ? 'high' : ''}>{Math.round(v.utilization)}% cap.</span>
                  </div>
                </div>
                <div className="gantt-lane">
                  {/* Grid lines alineadas con los ticks */}
                  <div className="lane-grid">
                    {ganttView?.ticks.filter(t => t.isMajor || t.isDay).map((tick, i) => (
                      <div 
                        key={i} 
                        className={`grid-line-abs ${tick.isDay ? 'day-separator' : ''}`}
                        style={{ left: `${getTickPos(tick.ms)}%` }}
                      ></div>
                    ))}
                  </div>
                  
                  {/* Línea base de la jornada */}
                  <div className="journey-path-base" 
                       style={{ 
                         left: `${getGanttPos(v.startTime)}%`, 
                         width: `${Math.max(0, getGanttPos(v.endTime) - getGanttPos(v.startTime))}%` 
                       }}></div>

                  {/* Bloques de actividad */}
                  {v.itinerary.map((stop, sIdx) => {
                    const startPos = getGanttPos(stop.arrival || stop.departure);
                    const endPos = getGanttPos(stop.departure || stop.arrival);
                    const width = Math.max(0.5, endPos - startPos);

                    return (
                      <div key={sIdx} 
                           className={`gantt-activity-block ${stop.type}`}
                           style={{ 
                             left: `${startPos}%`,
                             width: `${width}%`
                           }}>
                        {(stop.type === 'delivery' || stop.type === 'reload') && (
                          <div className="activity-tooltip">
                            <span className="tooltip-seq">{stop.sequence || 'R'}</span>
                            <span className="tooltip-main">{stop.label}</span>
                            <span className="tooltip-time">
                              {formatTime(stop.arrival)} - {formatTime(stop.departure)}
                              {analysis.dataDays > 1 && stop.arrival && (
                                <> · {formatDate(stop.arrival)}</>
                              )}
                            </span>
                            {(stop.waitMin > 1 || stop.serviceMin > 0) && (
                              <div className="tooltip-breakdown">
                                {stop.serviceMin > 0 && <span style={{ color: '#4ade80' }}>⚡ Servicio: {Math.round(stop.serviceMin)}m</span>}
                                {stop.waitMin > 1 && <span style={{ color: '#fbbf24', marginLeft: '8px' }}>⏳ Espera: {Math.round(stop.waitMin)}m</span>}
                              </div>
                            )}
                          </div>
                        )}
                        {stop.type === 'delivery' && width > 2 && (
                          <span className="block-label">{stop.sequence}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="report-section" style={{ marginTop: '14px' }}>
        <div className="performance-table-wrapper" style={{ padding: '14px', borderRadius: '14px', background: '#111327', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1rem' }}>Análisis Logístico Integral (Operación + Finanzas)</h3>
            <span style={{ fontSize: '0.72rem', color: '#93c5fd', border: '1px solid rgba(147,197,253,0.35)', padding: '4px 8px', borderRadius: '999px' }}>
              ROI Logístico Estimado: {Math.round(analysis.roiIndex)}/100
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
            <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: '10px', padding: '10px' }}>
              <div style={{ color: '#86efac', fontSize: '0.68rem', textTransform: 'uppercase' }}>Cobertura real</div>
              <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{Math.round(analysis.coveragePct)}%</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.68rem' }}>{analysis.totalOrdersAssigned}/{analysis.totalOrdersFromCsv} pedidos</div>
            </div>
            <div style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: '10px', padding: '10px' }}>
              <div style={{ color: '#93c5fd', fontSize: '0.68rem', textTransform: 'uppercase' }}>Productividad por ruta</div>
              <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{analysis.averageOrdersPerRoute.toFixed(1)} pedidos/ruta</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.68rem' }}>{analysis.totalRoutes} rutas activas</div>
            </div>
            <div style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.25)', borderRadius: '10px', padding: '10px' }}>
              <div style={{ color: '#fde68a', fontSize: '0.68rem', textTransform: 'uppercase' }}>Consolidación de entregas</div>
              <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{analysis.consolidationRatio.toFixed(2)} pedidos/parada</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.68rem' }}>{analysis.totalStopsAssigned} paradas de entrega</div>
            </div>
            <div style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: '10px', padding: '10px' }}>
              <div style={{ color: '#c4b5fd', fontSize: '0.68rem', textTransform: 'uppercase' }}>Ganancia de productividad</div>
              <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>-{analysis.estimatedRoutesSaved} rutas equivalentes</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.68rem' }}>{Math.round(analysis.productivityGainPct)}% vs escenario 1 pedido = 1 ruta</div>
            </div>
            <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: '10px', padding: '10px' }}>
              <div style={{ color: '#fca5a5', fontSize: '0.68rem', textTransform: 'uppercase' }}>Brecha operativa</div>
              <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{analysis.totalOrdersUnassigned} pedidos no cubiertos</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.68rem' }}>Foco inmediato para Finanzas y Operaciones</div>
            </div>
            <div style={{ background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.25)', borderRadius: '10px', padding: '10px' }}>
              <div style={{ color: '#5eead4', fontSize: '0.68rem', textTransform: 'uppercase' }}>Intensidad de red</div>
              <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{analysis.averageKmPerRoute.toFixed(1)} km/ruta</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.68rem' }}>{analysis.totalDist.toLocaleString()} km totales optimizados</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px' }}>
              <div style={{ color: '#e2e8f0', fontSize: '0.78rem', fontWeight: 700, marginBottom: '8px' }}>Narrativa ejecutiva (ROI + Productividad)</div>
              <ul style={{ margin: 0, paddingLeft: '18px', color: '#cbd5e1', fontSize: '0.73rem', lineHeight: 1.45 }}>
                {analysis.strategicInsights.map((insight, i) => (
                  <li key={i}>{insight}</li>
                ))}
              </ul>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px' }}>
              <div style={{ color: '#e2e8f0', fontSize: '0.78rem', fontWeight: 700, marginBottom: '8px' }}>Top restricciones financieras/operativas</div>
              {analysis.topConstraints.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Sin restricciones críticas detectadas.</div>
              ) : (
                <div style={{ display: 'grid', gap: '6px' }}>
                  {analysis.topConstraints.map(([code, count]) => (
                    <div key={code} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '0.72rem' }}>
                      <span style={{ color: '#fca5a5' }}>{translateReason(code, code)}</span>
                      <strong style={{ color: '#f8fafc' }}>{count}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {analysis.unassignedCount > 0 && (
        <>
          <div className="unassigned-alert-banner">
            <ShieldAlert size={18} />
            <span>
              Atención: {analysis.totalOrdersUnassigned} pedidos sin asignar
              ({Math.round(analysis.coveragePct)}% cobertura total).
            </span>
            <button className="btn-secondary-dark" onClick={() => setShowUnassigned(!showUnassigned)}>
              {showUnassigned ? 'Ocultar' : 'Ver Motivos'}
            </button>
          </div>
          {showUnassigned && (
            <div className="unassigned-detail-panel animate-fade-in" style={{
              background: '#171528', border: '1px solid rgba(255,100,100,0.25)',
              borderRadius: '14px', padding: '16px', marginTop: '8px'
            }}>
              <h4 style={{ color: '#ff8a8a', margin: '0 0 8px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={15} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Pedidos no asignados - Diagnóstico integral
              </h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: '10px',
                marginBottom: '12px'
              }}>
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.68rem', textTransform: 'uppercase' }}>Pedidos CSV</div>
                  <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{analysis.totalOrdersFromCsv}</div>
                </div>
                <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ color: '#86efac', fontSize: '0.68rem', textTransform: 'uppercase' }}>Pedidos asignados</div>
                  <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{analysis.totalOrdersAssigned}</div>
                </div>
                <div style={{ background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ color: '#fca5a5', fontSize: '0.68rem', textTransform: 'uppercase' }}>Pedidos no asignados</div>
                  <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{analysis.totalOrdersUnassigned}</div>
                </div>
                <div style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ color: '#93c5fd', fontSize: '0.68rem', textTransform: 'uppercase' }}>Cobertura</div>
                  <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{Math.round(analysis.coveragePct)}%</div>
                </div>
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.75rem', color: '#e2e8f0' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Job ID</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Cliente</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Skill</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Motivo (ES)</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Código</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.unassignedDetails.map((item, idx) => {
                      const firstOrder = item.orders?.[0] || {};
                      const clientName = firstOrder?.[mapping.name] || 'Sin cliente identificado';
                      const skill = firstOrder?.[mapping.skill] || 'N/A';
                      const codeText = item.reasonCodes.join(', ');
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#fbbf24' }}>{jobId}</td>
                          <td style={{ padding: '6px 8px', color: '#e2e8f0' }}>{clientName}</td>
                          <td style={{ padding: '6px 8px', color: '#c4b5fd' }}>{skill}</td>
                          <td style={{ padding: '6px 8px', color: '#fca5a5' }}>{item.reasonEs}</td>
                          <td style={{ padding: '6px 8px', color: '#94a3b8' }}>{codeText || 'Sin código'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LogisticAnalyst;
