import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { 
  BarChart3, TrendingUp, Truck, Package, BrainCircuit, 
  Clock, MapPin, AlertCircle, TrendingDown,
  Target, ShieldAlert, Info, ChevronDown, ChevronUp, 
  LayoutGrid, List, Calendar, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Maximize2, Download
} from 'lucide-react';

const LogisticAnalyst = ({ result, fullData = [], mapping = {} }) => {
  const [expandedVehicles, setExpandedVehicles] = useState({});
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'gantt'
  const [ganttZoom, setGanttZoom] = useState('auto'); // 'auto', '1d', '3d', '7d'
  const [ganttDayOffset, setGanttDayOffset] = useState(0);
  const [showUnassigned, setShowUnassigned] = useState(false);

  const sanitizeId = (id) => id ? id.toString().replace(/[^a-zA-Z0-9_-]/g, '_') : 'unknown';

  const parseNumber = (val) => {
    if (val === undefined || val === null || val === '') return 0;
    // Limpiar comas (separadores de miles) y espacios
    let clean = val.toString().replace(/,/g, '').replace(/\s/g, '');
    let n = parseFloat(clean);
    return isNaN(n) ? 0 : n;
  };

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

  const handleTooltipPosition = (e) => {
    const block = e.currentTarget;
    const tooltip = block.querySelector('.activity-tooltip');
    const bodyEl = block.closest('.gantt-body');
    
    if (tooltip && bodyEl) {
      const blockRect = block.getBoundingClientRect();
      const bodyRect = bodyEl.getBoundingClientRect();
      
      if (blockRect.top - bodyRect.top < 150) {
        tooltip.classList.add('tooltip-down');
      } else {
        tooltip.classList.remove('tooltip-down');
      }
      
      if (bodyRect.right - blockRect.right < 150) {
        tooltip.classList.add('tooltip-left');
      } else {
        tooltip.classList.remove('tooltip-left');
      }
    }
  };

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

  const getOrderId = (order, mapping) => {
    if (!order) return 'N/A';
    
    // 1. Intentar con el mapeo explícito (si el usuario seleccionó una columna)
    if (mapping.id && order[mapping.id] !== undefined && order[mapping.id] !== null && order[mapping.id] !== '') {
      return order[mapping.id].toString().trim();
    }

    // 2. Fallbacks directos comunes (Búsqueda exacta de llaves frecuentes)
    const directFallbacks = [
      'Pedido', 'ID', 'Nro Pedido', 'Número de pedido', 'Nro. Pedido', 
      'Num. Pedido', 'Folio', 'Referencia', 'Nro_pedido', 'ID Pedido', 'Factura', 
      'Remisión', 'Venta', 'Documento', 'Nro_Documento', 'No_Pedido', 
      'No_Documento', 'Orden', 'Nro Orden', 'Entrega', 'Nro Entrega', 'Shipment',
      'GUIA', 'TICKET', 'REMISION', 'ID_PEDIDO', 'Movimiento'
    ];

    for (const key of directFallbacks) {
      if (order[key] !== undefined && order[key] !== null && order[key] !== '') {
        return order[key].toString().trim();
      }
    }

    // 3. Búsqueda Insensible a Mayúsculas/Minúsculas y Parcial (Más agresivo)
    const keys = Object.keys(order);
    const searchTerms = [
      'pedido', 'nro', 'num', 'folio', 'ref', 'id', 'fact', 'remis', 
      'venta', 'orden', 'doc', 'entrega', 'shipment', 'guia', 'ticket', 'folio'
    ];
    
    for (const term of searchTerms) {
      const foundKey = keys.find(k => k.toLowerCase().trim().includes(term));
      if (foundKey && order[foundKey] !== undefined && order[foundKey] !== null && order[foundKey] !== '') {
        return order[foundKey].toString().trim();
      }
    }

    // 4. Búsqueda de cualquier campo que contenga 'ID' o 'CVE' o 'NUM'
    const likelyIdKeys = keys.filter(k => 
      k.toUpperCase().includes('ID') || 
      k.toUpperCase().includes('CVE') || 
      k.toUpperCase().includes('NUM')
    );
    for (const key of likelyIdKeys) {
      if (order[key]) return order[key].toString().trim();
    }

    // 5. Último recurso: cualquier campo que parezca un ID (numérico o alfanumérico corto)
    // que no sea lat/lng o peso
    for (const key of keys) {
      const val = order[key];
      if (typeof val === 'string' || typeof val === 'number') {
        const str = val.toString();
        if (str.length > 2 && str.length < 15 && !key.toLowerCase().includes('lat') && !key.toLowerCase().includes('lon')) {
          // Si el nombre de la columna es algo como "id_..." o "...id"
          if (/id/i.test(key)) return str.trim();
        }
      }
    }

    return 'N/A';
  };

  const analysis = useMemo(() => {
    if (!result || !result.solution) return null;

    const solution = result.solution;
    const problem = result.problem || { plan: { jobs: [] } };
    const tours = solution.tours || [];
    const unassigned = solution.unassigned || [];

    // ─── FIX: Mapeo de Job IDs Sincronizado (Hierarchy) ───
    const jobToOrdersMap = {};
    if (fullData.length > 0) {
      fullData.forEach((row, index) => {
        // ID generation MUST match App.jsx exactly: job_${sanitizeId(row[mapping.id] || `idx_${index}`)}
        const orderId = sanitizeId(row[mapping.id] || `idx_${index}`);
        const jobId = `job_${orderId}`;
        
        if (!jobToOrdersMap[jobId]) jobToOrdersMap[jobId] = [];
        jobToOrdersMap[jobId].push(row);
      });
    }

    const jobWeightMap = (problem.plan?.jobs || []).reduce((acc, job) => {
      // Revertir el escalamiento x1000 para la visualización
      const weight = (job.tasks?.deliveries?.[0]?.demand?.[0] || 0) / 1000;
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
      // Buscar capacidad real en la definición del problema para precisión total
      const problemVehicleType = (problem.fleet?.types || []).find(t => sanitizeId(t.id) === tour.typeId);
      const capacity = problemVehicleType?.capacity 
        ? (problemVehicleType.capacity[0] / 1000) 
        : (rawType.includes('tracto') ? 31000 : 
           rawType.includes('torton') ? 18000 : 
           rawType.includes('camioneta') ? 7000 : 18000);

      let deliveryIndex = 0;
      let currentCycle = 1;
      let cycleLoad = 0;
      const itinerary = stops.map((stop, index) => {
        const isDepot = index === 0 || index === stops.length - 1;
        const activities = stop.activities || [];
        const deliveries = activities.filter(a => a.type === 'delivery');
        const reloads = activities.filter(a => a.type === 'reload');
        const breaks = activities.filter(a => a.type === 'break' || a.type === 'rest');
        
        if (reloads.length > 0) {
          currentCycle++;
          cycleLoad = 0; // Reiniciar carga para el nuevo ciclo
        }

        // Si es el primer stop (salida CEDI), también es el inicio del ciclo 1
        if (index === 0) {
          cycleLoad = 0;
        }

        let clientName = 'CEDI';
        let address = '';
        let isGrouped = false;
        let isMultiClient = false;
        let totalOrdersInStop = 0;
        let stopWeight = 0;

        if (deliveries.length > 0) {
          deliveryIndex++;
          const allOrders = deliveries.flatMap(d => jobToOrdersMap[d.jobId] || []);
          totalOrdersInStop = allOrders.length;
          isGrouped = totalOrdersInStop > 1;
          
          stopWeight = deliveries.reduce((acc, d) => acc + (jobWeightMap[d.jobId] || 0), 0);
          cycleLoad += stopWeight;

          // Identificadores únicos de cliente en esta parada (chequeando código y nombre)
          const clientEntities = new Set(allOrders.map(o => {
            const code = (o[mapping.clientCode] || o['Cliente'] || o['CLIENTE'] || '').toString().trim();
            const name = (o[mapping.client] || o['Nombre'] || o['NOMBRE'] || '').toString().trim();
            return `${code}|${name}`;
          }).filter(s => s !== '|'));
          
          isMultiClient = clientEntities.size > 1;

          const firstOrder = allOrders[0] || {};
          const codeVal = (firstOrder[mapping.clientCode] || firstOrder['Cliente'] || firstOrder['CLIENTE'] || '').toString().trim();
          const nameVal = (firstOrder[mapping.client] || firstOrder['Nombre'] || firstOrder['NOMBRE'] || '').toString().trim();
          
          // El identificador para el título será prioritariamente el Código
          clientName = codeVal || nameVal || 'Cliente S/N';
          address = firstOrder[mapping.address] || '';
        }

        const stopLabel = index === 0 ? 'Salida CEDI' : 
                          index === stops.length - 1 ? 'Retorno Final CEDI' : 
                          reloads.length > 0 ? 'Recarga en CEDI' : 
                          (breaks.length > 0 && deliveries.length === 0) ? '☕ Descanso / Pausa' :
                          isMultiClient ? `Parada Multi-cliente (${totalOrdersInStop} pedidos)` :
                          isGrouped ? `${clientName} (${totalOrdersInStop} pedidos)` : 
                          (() => {
                            const firstOrder = (deliveries.flatMap(d => jobToOrdersMap[d.jobId] || []))[0] || {};
                            const mov = firstOrder[mapping.movimiento] || firstOrder['Movimiento'] || firstOrder['MOVIMIENTO'] || '';
                            return mov ? `${clientName} - ${mov}` : clientName;
                          })();

        // FIX: Identificar Service vs Waiting time
        const arrivalMs = normalizeToMs(getStopArrival(stop));
        const departureMs = normalizeToMs(getStopDeparture(stop));
        
        let waitMs = 0;
        let serviceMs = 0;
        let breakMs = 0;
        
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
          breaks.forEach(act => {
             // El HERE API v3 a veces retorna duration en lugar de time object para descansos
             const duration = act.duration ? act.duration * 1000 : 0;
             const s = normalizeToMs(act.time?.start || act.startTime || act.time?.arrival || act.arrival?.time);
             const e = normalizeToMs(act.time?.end || act.endTime || act.time?.departure || act.departure?.time);
             if (s && e) {
               breakMs += (e - s);
             } else if (duration > 0) {
               breakMs += duration;
             }
          });
          
          // Si es explícitamente una parada de descanso y no logramos extraer el tiempo de las actividades
          if (breaks.length > 0 && breakMs === 0 && deliveries.length === 0) {
            breakMs = departureMs - arrivalMs;
          }

          // Si no hay detalle de actividades (Mock), el servicio es la diferencia
          if (serviceMs === 0 && breakMs === 0) {
            serviceMs = departureMs - arrivalMs;
          } else {
            waitMs = Math.max(0, (departureMs - arrivalMs) - serviceMs - breakMs);
          }
        }

        return {
          label: stopLabel,
          clientName,
          address,
          isGrouped,
          isMultiClient,
          totalOrdersInStop,
          sequence: deliveries.length > 0 ? deliveryIndex : null,
          cycle: currentCycle,
          cycleLoadAtStart: cycleLoad - stopWeight, // Carga antes de esta parada (para entregas)
          cycleLoadAtEnd: cycleLoad, // Carga después de esta parada
          stopWeight, // Peso de esta parada específica
          type: isDepot ? 'depot' : reloads.length > 0 ? 'reload' : (breaks.length > 0 && deliveries.length === 0) ? 'break' : 'delivery',
          location: stop.location,
          arrival: arrivalMs ? new Date(arrivalMs) : null,
          departure: departureMs ? new Date(departureMs) : null,
          waitMin: waitMs / 60000,
          serviceMin: serviceMs / 60000,
          breakMin: breakMs / 60000,
          breakDetails: breaks.map(act => ({
             start: normalizeToMs(act.time?.start || act.startTime || act.time?.arrival || act.arrival?.time),
             end: normalizeToMs(act.time?.end || act.endTime || act.time?.departure || act.departure?.time),
          })),
          jobs: deliveries.map(d => ({
            jobId: d.jobId,
            orders: jobToOrdersMap[d.jobId] || []
          }))
        };
      });

      // Calcular el peso total de CADA ciclo para mostrar resúmenes por viaje
      const cycleSummaries = {};
      itinerary.forEach(stop => {
        if (!cycleSummaries[stop.cycle]) {
          cycleSummaries[stop.cycle] = { 
            totalWeight: 0, 
            stops: 0, 
            orders: 0,
            startTime: stop.arrival || stop.departure,
            endTime: stop.departure || stop.arrival
          };
        }
        cycleSummaries[stop.cycle].totalWeight += stop.stopWeight;
        if (stop.type === 'delivery') {
          cycleSummaries[stop.cycle].stops++;
          cycleSummaries[stop.cycle].orders += stop.totalOrdersInStop;
        }
        
        // Actualizar tiempos del ciclo
        const stopStart = stop.arrival || stop.departure;
        const stopEnd = stop.departure || stop.arrival;
        if (stopStart && (!cycleSummaries[stop.cycle].startTime || stopStart < cycleSummaries[stop.cycle].startTime)) {
          cycleSummaries[stop.cycle].startTime = stopStart;
        }
        if (stopEnd && (!cycleSummaries[stop.cycle].endTime || stopEnd > cycleSummaries[stop.cycle].endTime)) {
          cycleSummaries[stop.cycle].endTime = stopEnd;
        }
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

      const maxCycle = Math.max(...itinerary.map(s => s.cycle), 1);

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
        hasReloads: maxCycle > 1,
        maxCycle,
        cycleSummaries,
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
      totalUnprogrammedWeight: (unassignedDetails || []).reduce((acc, u) => acc + (u.orders || []).reduce((oAcc, o) => oAcc + parseNumber(o[mapping.weight] || 0), 0), 0),
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

  const exportToExcel = () => {
    const dataRows = [];
    
    analysis.vehiclePerformance.forEach(v => {
      let currentLoadCycle = 1;
      
      v.itinerary.forEach(stop => {
        if (stop.type === 'reload') {
          currentLoadCycle++;
          dataRows.push({
            'ID Camión': v.id,
            'Tipo Unidad': v.type,
            'ID Pedido': 'RECARGA_CEDI',
            'Movimiento': '--',
            'Secuencia': '--',
            'Nombre Cliente': 'RETORNO A CEDI PARA RECARGA',
            'Dirección Cliente': 'CEDI',
            'Peso (KG)': 0,
            'Fecha': stop.arrival ? stop.arrival.toLocaleDateString('es-MX') : '--',
            'Hora Llegada': formatTime(stop.arrival),
            'Viaje / Recarga': `INICIO VIAJE ${currentLoadCycle}`,
            'Ciclo': currentLoadCycle
          });
          return;
        }

        if (stop.type === 'delivery') {
          stop.jobs.forEach(job => {
            job.orders.forEach((order, oIdx) => {
              const weight = parseNumber(order[mapping.weight] || 0);
              const sequenceStr = stop.totalOrdersInStop > 1 ? `${stop.sequence}.${oIdx + 1}` : stop.sequence.toString();
              const orderId = getOrderId(order, mapping);
              
              dataRows.push({
                'ID Camión': v.id,
                'Tipo Unidad': v.type,
                'ID Pedido': orderId,
                'Movimiento': order[mapping.movimiento] || order['Movimiento'] || '--',
                'Secuencia': sequenceStr,
                'Nombre Cliente': order[mapping.client] || order['Nombre'] || 'S/N',
                'Dirección Cliente': order[mapping.address] || 'N/A',
                'Peso (KG)': weight,
                'Fecha': stop.arrival ? stop.arrival.toLocaleDateString('es-MX') : '--',
                'Hora Llegada': formatTime(stop.arrival),
                'Viaje / Recarga': `Viaje ${currentLoadCycle}`,
                'Ciclo': currentLoadCycle
              });
            });
          });
        }
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rutas Optimizadas");
    
    const maxWidths = {};
    dataRows.forEach(row => {
      Object.keys(row).forEach(key => {
        const val = row[key] ? row[key].toString() : '';
        maxWidths[key] = Math.max(maxWidths[key] || key.length, val.length);
      });
    });
    worksheet['!cols'] = Object.keys(maxWidths).map(key => ({ wch: maxWidths[key] + 2 }));

    XLSX.writeFile(workbook, `rutas_mexico_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToCSV = () => {
    const headers = [
      'ID Camión',
      'Tipo Unidad',
      'ID Pedido',
      'Movimiento',
      'Secuencia',
      'Nombre Cliente',
      'Dirección Cliente',
      'Peso (KG)',
      'Fecha',
      'Hora Llegada',
      'Viaje / Recarga'
    ];

    const rows = [];

    analysis.vehiclePerformance.forEach(v => {
      let currentLoadCycle = 1;
      
      v.itinerary.forEach(stop => {
        if (stop.type === 'reload') {
          currentLoadCycle++;
          rows.push([
            v.id,
            v.type,
            'RECARGA_CEDI',
            '--',
            '--',
            'RETORNO A CEDI PARA RECARGA',
            'CEDI',
            '0',
            stop.arrival ? stop.arrival.toLocaleDateString('es-MX') : '--',
            formatTime(stop.arrival),
            `INICIO VIAJE ${currentLoadCycle}`
          ]);
          return;
        }

        if (stop.type === 'delivery') {
          stop.jobs.forEach(job => {
            job.orders.forEach((order, oIdx) => {
              const weight = parseNumber(order[mapping.weight] || 0);
              const sequenceStr = stop.totalOrdersInStop > 1 ? `${stop.sequence}.${oIdx + 1}` : stop.sequence.toString();
              const orderId = getOrderId(order, mapping);
              
              rows.push([
                v.id,
                v.type,
                orderId,
                order[mapping.movimiento] || order['Movimiento'] || '--',
                sequenceStr,
                order[mapping.client] || order['Nombre'] || 'S/N',
                order[mapping.address] || 'N/A',
                weight.toFixed(2),
                stop.arrival ? stop.arrival.toLocaleDateString('es-MX') : '--',
                formatTime(stop.arrival),
                `Viaje ${currentLoadCycle}`
              ]);
            });
          });
        }
      });
    });

    const csvContent = "\ufeff" + [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        const val = cell === null || cell === undefined ? '' : cell.toString();
        return `"${val.replace(/"/g, '""')}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `rutas_mexico_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
        <div className="global-kpis" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            onClick={exportToExcel}
            className="btn-primary-small"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '8px 16px',
              background: 'var(--primary-electric)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 12px rgba(0, 88, 190, 0.25)'
            }}
          >
            <Download size={16} /> Descargar Excel (.xlsx)
          </button>
          <button 
            onClick={exportToCSV}
            className="btn-secondary-dark"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '8px 16px',
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <Download size={16} /> CSV
          </button>
          <div className="view-mode-selector">
            <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}><List size={16}/> Lista</button>
            <button className={viewMode === 'gantt' ? 'active' : ''} onClick={() => setViewMode('gantt')}><Calendar size={16}/> Cronograma</button>
          </div>
        </div>
      </div>

      {/* RESUMEN DE COMPONENTES DE CARGA E INDICADORES (Programado vs No Programado) */}
      <div className="summary-cards" style={{ marginBottom: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.2rem' }}>
        <div className="glass-card stat-main" style={{ borderLeft: '4px solid #10b981', padding: '16px' }}>
          <div className="stat-icon" style={{ background: '#ecfdf5', width: '36px', height: '36px' }}><Package size={18} color="#10b981" /></div>
          <div>
            <span className="stat-value" style={{ fontSize: '1.2rem', display: 'block' }}>{analysis.totalOrdersAssigned} / {analysis.totalOrdersAssigned + analysis.totalOrdersUnassigned}</span>
            <span className="stat-label">Pedidos Programados</span>
          </div>
        </div>
        <div className="glass-card stat-main" style={{ borderLeft: '4px solid #0058be', padding: '16px' }}>
          <div className="stat-icon" style={{ background: '#eff6ff', width: '36px', height: '36px' }}><Target size={18} color="#0058be" /></div>
          <div>
            <span className="stat-value" style={{ fontSize: '1.2rem', display: 'block' }}>{analysis.totalWeight.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg</span>
            <span className="stat-label">Carga en Ruta</span>
          </div>
        </div>
        <div className="glass-card stat-main" style={{ borderLeft: '4px solid #ef4444', padding: '16px' }}>
          <div className="stat-icon" style={{ background: '#fef2f2', width: '36px', height: '36px' }}><ShieldAlert size={18} color="#ef4444" /></div>
          <div>
            <span className="stat-value" style={{ fontSize: '1.2rem', display: 'block' }}>{analysis.totalOrdersUnassigned} Pedidos</span>
            <span className="stat-label">No Programados</span>
          </div>
        </div>
        <div className="glass-card stat-main" style={{ borderLeft: '4px solid #f59e0b', padding: '16px' }}>
          <div className="stat-icon" style={{ background: '#fffbeb', width: '36px', height: '36px' }}><AlertCircle size={18} color="#f59e0b" /></div>
          <div>
            <span className="stat-value" style={{ fontSize: '1.2rem', display: 'block' }}>{analysis.totalUnprogrammedWeight.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg</span>
            <span className="stat-label">Carga Pendiente</span>
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
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="badge-type">{v.type}</span>
                          {v.hasReloads && (
                            <span style={{ 
                              fontSize: '0.6rem', 
                              background: '#eff6ff', 
                              color: '#0058be', 
                              padding: '2px 6px', 
                              borderRadius: '4px',
                              fontWeight: 800,
                              border: '1px solid rgba(0, 88, 190, 0.2)'
                            }}>
                              {v.maxCycle} VIAJES
                            </span>
                          )}
                        </div>
                      </td>
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
                      <td><strong>{v.load.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg</strong></td>
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
                            <div className="itinerary-summary-header" style={{ 
                              display: 'grid', 
                              gridTemplateColumns: 'repeat(4, 1fr)', 
                              gap: '20px', 
                              padding: '16px 24px',
                              background: '#f8fafc',
                              borderBottom: '1px solid #e2e8f0',
                              marginBottom: '20px'
                            }}>
                              <div className="it-stat">
                                <span style={{ display: 'block', fontSize: '0.65rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Distancia Total</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>{v.distance} km</span>
                              </div>
                              <div className="it-stat">
                                <span style={{ display: 'block', fontSize: '0.65rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Duración Total</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>
                                  {v.startTime && v.endTime ? `${Math.round((v.endTime - v.startTime) / 60000)} min` : '--'}
                                </span>
                              </div>
                              <div className="it-stat">
                                <span style={{ display: 'block', fontSize: '0.65rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Productividad</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>
                                  {v.endTime && v.startTime && (v.endTime - v.startTime) > 0 
                                    ? (v.stopsCount / ((v.endTime - v.startTime) / 3600000)).toFixed(1) 
                                    : '0'} paradas/h
                                </span>
                              </div>
                              <div className="it-stat">
                                <span style={{ display: 'block', fontSize: '0.65rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Carga Total</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>{v.load.toLocaleString()} kg</span>
                              </div>
                            </div>
                            <div className="itinerary-grid">
                              {v.itinerary.map((stop, sIdx) => {
                                const orders = stop.jobs.flatMap(j => j.orders);
                                const isFirstOfCycle = sIdx === 0 || (sIdx > 0 && v.itinerary[sIdx-1].cycle !== stop.cycle);
                                const cycleInfo = v.cycleSummaries[stop.cycle] || { totalWeight: 0, stops: 0, orders: 0 };
                                
                                return (
                                  <React.Fragment key={sIdx}>
                                    {/* Encabezado de Ciclo/Viaje */}
                                    {isFirstOfCycle && (
                                      <div style={{ 
                                        gridColumn: '1 / -1',
                                        margin: '20px 0 10px 0',
                                        padding: '12px 20px',
                                        background: stop.cycle === 1 ? 'linear-gradient(90deg, rgba(0, 88, 190, 0.1) 0%, transparent 100%)' : 'linear-gradient(90deg, rgba(245, 158, 11, 0.1) 0%, transparent 100%)',
                                        borderRadius: '8px',
                                        borderLeft: `4px solid ${stop.cycle === 1 ? 'var(--primary-electric)' : '#f59e0b'}`,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                      }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                          <div style={{ 
                                            width: '32px', height: '32px', borderRadius: '50%', 
                                            background: stop.cycle === 1 ? 'var(--primary-electric)' : '#f59e0b',
                                            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 900, fontSize: '0.9rem'
                                          }}>
                                            {stop.cycle}
                                          </div>
                                          <div>
                                            <h4 style={{ margin: 0, color: '#0f172a', fontSize: '0.9rem', fontWeight: 800 }}>
                                              {stop.cycle === 1 ? 'VIAJE INICIAL' : `VIAJE DE RECARGA #${stop.cycle - 1}`}
                                            </h4>
                                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                                              {cycleInfo.stops} Paradas · {cycleInfo.orders} Pedidos
                                            </span>
                                          </div>
                                        </div>

                                        {/* Task 1: Route List Break Visibility (Embedded Breaks as full steps) */}
                                        {stop.type !== 'break' && stop.breakMin > 0 && (
                                          stop.breakDetails && stop.breakDetails.length > 0 ? (
                                            stop.breakDetails.map((b, bIdx) => {
                                              const bStart = b.start ? new Date(b.start) : null;
                                              const bEnd = b.end ? new Date(b.end) : null;
                                              const durationMin = bStart && bEnd ? Math.round((bEnd - bStart) / 60000) : stop.breakMin;
                                              return (
                                                <div key={`embedded-break-${sIdx}-${bIdx}`} className="itinerary-step break animate-fade-in" style={{ marginTop: '10px' }}>
                                                  <div className="step-timeline">
                                                    <div className="step-dot" style={{ background: '#3b82f6' }}>
                                                      <span className="dot-number">☕</span>
                                                    </div>
                                                    <div className="step-line" style={{ background: '#bfdbfe' }}></div>
                                                  </div>
                                                  <div className="step-content" style={{ paddingLeft: '10px' }}>
                                                    <div style={{ 
                                                      padding: '12px 16px', 
                                                      background: '#eff6ff', 
                                                      borderRadius: '12px', 
                                                      borderLeft: '4px solid #3b82f6',
                                                      boxShadow: '0 2px 8px rgba(37, 99, 235, 0.08)'
                                                    }}>
                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontWeight: 800, color: '#1e40af', fontSize: '0.95rem' }}>
                                                          ☕ {durationMin >= 480 ? 'Pausa Inter-jornada (Extendido)' : durationMin >= 240 ? 'Pausa Nocturna Automatizada' : 'Descanso Obligatorio'}
                                                        </span>
                                                        <span className="step-time" style={{ 
                                                          fontWeight: 700, 
                                                          color: '#2563eb', 
                                                          fontSize: '0.8rem', 
                                                          background: '#fff', 
                                                          padding: '4px 10px', 
                                                          borderRadius: '6px', 
                                                          border: '1px solid #bfdbfe',
                                                          marginLeft: 'auto'
                                                        }}>
                                                          {bStart && bEnd ? `${formatTime(bStart)} - ${formatTime(bEnd)}` : `${Math.round(durationMin)} min`}
                                                        </span>
                                                      </div>
                                                      <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: '#64748b', lineHeight: '1.4' }}>
                                                        {durationMin >= 480
                                                          ? 'El vehículo se encuentra en un descanso prolongado entre jornadas operativas o esperando apertura del CEDI.'
                                                          : durationMin >= 240 
                                                            ? 'El vehículo se detiene debido al cierre del CEDI y para cumplir con las normativas de descanso obligatorio.' 
                                                            : 'El vehículo pausará operaciones durante este tiempo para cumplir normativas de descanso.'}
                                                      </p>
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            })
                                          ) : (
                                            <div key={`embedded-break-${sIdx}-fallback`} className="itinerary-step break animate-fade-in" style={{ marginTop: '10px' }}>
                                              <div className="step-timeline">
                                                <div className="step-dot" style={{ background: '#3b82f6' }}>
                                                  <span className="dot-number">☕</span>
                                                </div>
                                                <div className="step-line" style={{ background: '#bfdbfe' }}></div>
                                              </div>
                                              <div className="step-content" style={{ paddingLeft: '10px' }}>
                                                <div style={{ 
                                                  padding: '12px 16px', 
                                                  background: '#eff6ff', 
                                                  borderRadius: '12px', 
                                                  borderLeft: '4px solid #3b82f6',
                                                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.08)'
                                                }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontWeight: 800, color: '#1e40af', fontSize: '0.95rem' }}>
                                                      ☕ {stop.breakMin >= 480 ? 'Pausa Inter-jornada (Extendido)' : stop.breakMin >= 240 ? 'Pausa Nocturna Automatizada' : 'Descanso Obligatorio'}
                                                    </span>
                                                    <span className="step-time" style={{ 
                                                      fontWeight: 700, 
                                                      color: '#2563eb', 
                                                      fontSize: '0.8rem', 
                                                      background: '#fff', 
                                                      padding: '4px 10px', 
                                                      borderRadius: '6px', 
                                                      border: '1px solid #bfdbfe',
                                                      marginLeft: 'auto'
                                                    }}>
                                                      {Math.round(stop.breakMin)} min
                                                    </span>
                                                  </div>
                                                  <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: '#64748b', lineHeight: '1.4' }}>
                                                    {stop.breakMin >= 480
                                                      ? 'El vehículo se encuentra en un descanso prolongado entre jornadas operativas o esperando apertura del CEDI.'
                                                      : stop.breakMin >= 240 
                                                        ? 'El vehículo se detiene debido al cierre del CEDI y para cumplir con las normativas de descanso obligatorio.' 
                                                        : 'El vehículo pausará operaciones durante este tiempo para cumplir normativas de descanso.'}
                                                  </p>
                                                </div>
                                              </div>
                                            </div>
                                          )
                                        )}
                                          <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#0f172a' }}>
                                              {cycleInfo.totalWeight.toLocaleString()} kg
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                                              Carga ({Math.round((cycleInfo.totalWeight / v.capacity) * 100)}% cap)
                                            </div>
                                            {cycleInfo.startTime && cycleInfo.endTime && (
                                              <div style={{ fontSize: '0.65rem', color: 'var(--primary-electric)', fontWeight: 700, marginTop: '2px' }}>
                                                Duración: {Math.round((cycleInfo.endTime - cycleInfo.startTime) / 60000)} min
                                              </div>
                                            )}
                                          </div>
                                      </div>
                                    )}

                                    <div className={`itinerary-step ${stop.type} ${stop.type === 'reload' ? 'is-reload-point' : ''}`}>
                                      <div className="step-timeline">
                                        <div className="step-dot">
                                          {stop.sequence && <span className="dot-number">{stop.sequence}</span>}
                                        </div>
                                        {sIdx < v.itinerary.length - 1 && <div className="step-line"></div>}
                                      </div>
                                      <div className="step-content" style={{ paddingLeft: '10px' }}>
                                        <div className="step-header" style={{ marginBottom: '12px' }}>
                                          <div className="step-title-row" style={{ justifyContent: 'flex-start', gap: '20px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="step-label" style={{ 
                                                  fontWeight: 800, 
                                                  color: stop.type === 'reload' ? '#d97706' : stop.type === 'break' ? '#2563eb' : '#0f172a', 
                                                  fontSize: '1rem',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: '8px'
                                                }}>
                                                  {stop.type === 'reload' && <ChevronRight size={18} />}
                                                  {stop.type === 'break' && <span style={{ fontSize: '1.2rem' }}>☕ </span>}
                                                  {stop.label || (stop.type === 'break' ? 'Descanso Obligatorio' : '')}
                                                  {stop.type === 'delivery' && (
                                                    <span style={{ marginLeft: '10px', color: 'var(--primary-electric)', fontSize: '0.85rem' }}>
                                                      [Mov: {orders.length <= 3 
                                                        ? orders.map(o => o[mapping.movimiento]).join(', ') 
                                                        : `${orders.slice(0, 3).map(o => o[mapping.movimiento]).join(', ')}... (+${orders.length - 3})`}
                                                      ]
                                                    </span>
                                                  )}
                                                </span>
                                                {stop.isGrouped && (
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span className="badge-grouped" style={{ 
                                                      fontSize: '0.65rem', 
                                                      background: 'rgba(0, 88, 190, 0.1)', 
                                                      color: 'var(--primary-electric)', 
                                                      padding: '3px 10px', 
                                                      borderRadius: '100px',
                                                      fontWeight: 800,
                                                      textTransform: 'uppercase',
                                                      display: 'flex',
                                                      alignItems: 'center',
                                                      gap: '4px',
                                                      letterSpacing: '0.5px'
                                                    }}>
                                                      <BrainCircuit size={10} /> Agrupado
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                              {stop.address && (
                                                <span className="step-address" style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                  <MapPin size={12} color="#94a3b8" /> {stop.address}
                                                </span>
                                              )}
                                              
                                              {stop.type === 'reload' && (
                                                <div style={{ 
                                                  marginTop: '8px',
                                                  padding: '10px 16px',
                                                  background: '#fffbeb',
                                                  borderRadius: '8px',
                                                  border: '1px solid #fef3c7',
                                                  fontSize: '0.8rem',
                                                  color: '#92400e',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: '12px'
                                                }}>
                                                  <div style={{ background: '#f59e0b', color: 'white', padding: '4px 8px', borderRadius: '4px', fontWeight: 900, fontSize: '0.7rem' }}>RECARGA</div>
                                                  <div style={{ fontWeight: 600 }}>
                                                    El vehículo retorna al CEDI para iniciar el <strong>Viaje #{stop.cycle}</strong>. 
                                                    Carga planeada para este bloque: <strong>{cycleInfo.totalWeight.toLocaleString()} kg</strong>
                                                  </div>
                                                </div>
                                              )}

                                              {stop.type === 'break' && (
                                                <div style={{ 
                                                  marginTop: '8px',
                                                  padding: '10px 16px',
                                                  background: '#eff6ff',
                                                  borderRadius: '8px',
                                                  border: '1px solid #bfdbfe',
                                                  fontSize: '0.8rem',
                                                  color: '#1e40af',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: '12px',
                                                  marginBottom: '12px'
                                                }}>
                                                  <div style={{ background: '#3b82f6', color: 'white', padding: '4px 8px', borderRadius: '4px', fontWeight: 900, fontSize: '0.7rem' }}>DESCANSO</div>
                                                  <div style={{ fontWeight: 600 }}>
                                                    {(() => {
                                                      const arrDate = stop.arrival ? new Date(stop.arrival) : null;
                                                      const depDate = stop.departure ? new Date(stop.departure) : null;
                                                      const durationMin = arrDate && depDate ? Math.round((depDate - arrDate) / 60000) : stop.breakMin || 0;
                                                      const isNocturnal = durationMin >= 240;
                                                      return isNocturnal 
                                                        ? `Pausa Nocturna Automatizada (${Math.round(durationMin)} min). El vehículo se detiene debido al cierre del CEDI y para cumplir las normativas de descanso obligatorio.` 
                                                        : `Descanso de flota programado (${Math.round(durationMin)} min). El vehículo pausará operaciones para cumplir normativas de descanso.`;
                                                    })()}
                                                  </div>
                                                </div>
                                              )}

                                              {stop.isGrouped && (
                                                <div style={{ 
                                                  marginTop: '8px',
                                                  padding: '8px 12px',
                                                  background: '#f1f5f9',
                                                  borderRadius: '6px',
                                                  fontSize: '0.7rem',
                                                  color: '#475569',
                                                  borderLeft: '3px solid var(--primary-electric)',
                                                  display: 'flex',
                                                  flexDirection: 'column',
                                                  gap: '4px'
                                                }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#1e293b' }}>
                                                    <BrainCircuit size={14} color="var(--primary-electric)" />
                                                    Lógica de Agrupación Industrial
                                                  </div>
                                                  <span>
                                                    {stop.isMultiClient 
                                                      ? 'Esta parada consolida pedidos de múltiples clientes que comparten exactamente las mismas coordenadas geográficas.' 
                                                      : 'Se han consolidado varios pedidos para este cliente en esta ubicación única para optimizar el tiempo de servicio.'}
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                            
                                              <div className="step-time" style={{ 
                                                fontWeight: 700, 
                                                color: '#1e293b', 
                                                fontSize: '0.8rem', 
                                                background: '#f8fafc', 
                                                padding: '6px 12px', 
                                                borderRadius: '6px', 
                                                border: '1px solid #e2e8f0',
                                                display: 'inline-block'
                                              }}>
                                                {stop.arrival && stop.departure && stop.arrival.getTime() !== stop.departure.getTime()
                                                  ? `${formatTime(stop.arrival)} - ${formatTime(stop.departure)}`
                                                  : stop.type === 'depot' && sIdx === 0
                                                    ? `Salida: ${formatTime(stop.departure || stop.arrival)}`
                                                    : stop.type === 'depot' && sIdx === v.itinerary.length - 1
                                                      ? `Llegada: ${formatTime(stop.arrival || stop.departure)}`
                                                      : stop.arrival && stop.departure
                                                        ? `${formatTime(stop.arrival)} - ${formatTime(stop.departure)}`
                                                        : stop.arrival
                                                          ? `Llegada: ${formatTime(stop.arrival)}`
                                                          : `Salida: ${formatTime(stop.departure)}`}
                                              </div>
                                              {stop.type === 'delivery' && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                  <div style={{ 
                                                    fontSize: '0.65rem', 
                                                    color: '#64748b', 
                                                    fontWeight: 800, 
                                                    textTransform: 'uppercase', 
                                                    marginTop: '6px',
                                                    letterSpacing: '0.5px'
                                                  }}>
                                                    Entrega #{stop.sequence}
                                                  </div>
                                                  <div style={{ 
                                                    fontSize: '0.65rem', 
                                                    color: stop.cycle > 1 ? '#b45309' : '#10b981', 
                                                    fontWeight: 900, 
                                                    textTransform: 'uppercase', 
                                                    marginTop: '6px',
                                                    letterSpacing: '0.5px',
                                                    background: stop.cycle > 1 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.08)',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px'
                                                  }}>
                                                    {stop.cycle > 1 ? `Viaje ${stop.cycle}` : 'Primer Viaje'}
                                                  </div>
                                                </div>
                                              )}
                                              
                                              {/* Mostrar información de Descansos / Tiempos de Espera en la vista de lista */}
                                              {stop.waitMin > 0 && (
                                                <div style={{ 
                                                  marginTop: '12px',
                                                  display: 'flex',
                                                  flexDirection: 'column',
                                                  gap: '6px'
                                                }}>
                                                  <div style={{ 
                                                    padding: '8px 12px', 
                                                    background: '#fefce8', 
                                                    borderRadius: '6px', 
                                                    borderLeft: '3px solid #eab308',
                                                    fontSize: '0.75rem', 
                                                    color: '#854d0e',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                  }}>
                                                    <span style={{ fontSize: '1rem' }}>⏳</span>
                                                    <div>
                                                      <strong>Tiempo de espera:</strong> {Math.round(stop.waitMin)} minutos.
                                                      <span style={{ display: 'block', fontSize: '0.65rem', color: '#a16207', marginTop: '2px' }}>
                                                        El vehículo llegó antes de que la ventana horaria del cliente se abriera, o está esperando el inicio de su turno.
                                                      </span>
                                                    </div>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                          
                                          {/* Solo mostrar tabla si hay pedidos (no en reloads o depot vacío) */}
                                          {orders.length > 0 && (
                                            <div style={{ 
                                              display: 'flex', 
                                              flexDirection: 'column', 
                                              background: '#fff', 
                                              borderRadius: '12px', 
                                              border: '1px solid #e2e8f0',
                                              overflow: 'hidden',
                                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                                              marginBottom: '15px'
                                            }}>
                                              {/* Vista de Flex-Cards para Pedidos */}
                                              <div style={{ 
                                                display: 'grid', 
                                                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
                                                gap: '16px', 
                                                padding: '20px',
                                                background: '#f8fafc',
                                                borderBottom: '1px solid #e2e8f0',
                                              }}>
                                                {orders.map((order, oIdx) => (
                                                  <div key={oIdx} style={{ 
                                                    background: '#ffffff', 
                                                    borderRadius: '12px', 
                                                    border: '1px solid #e2e8f0',
                                                    padding: '16px',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                                    transition: 'all 0.2s ease',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '12px',
                                                    position: 'relative',
                                                    overflow: 'hidden'
                                                  }} className="order-card-hover">
                                                    <div style={{ 
                                                      position: 'absolute', 
                                                      top: 0, 
                                                      left: 0, 
                                                      width: '4px', 
                                                      height: '100%', 
                                                      background: 'var(--primary-electric)' 
                                                    }}></div>

                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                      <div>
                                                        <span style={{ 
                                                          fontSize: '0.65rem', 
                                                          color: '#64748b', 
                                                          fontWeight: 800, 
                                                          textTransform: 'uppercase',
                                                          letterSpacing: '0.5px'
                                                        }}>
                                                          Secuencia {stop.sequence ? `${stop.sequence}.${oIdx + 1}` : `${oIdx + 1}`}
                                                        </span>
                                                        <h4 style={{ margin: '2px 0 0 0', color: '#0f172a', fontSize: '1rem', fontWeight: 800 }}>
                                                          {getOrderId(order, mapping)}
                                                        </h4>
                                                      </div>
                                                      <div style={{ 
                                                        background: 'rgba(0, 88, 190, 0.1)', 
                                                        color: 'var(--primary-electric)', 
                                                        padding: '4px 10px', 
                                                        borderRadius: '20px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 800
                                                      }}>
                                                        {order[mapping.movimiento] || 'N/A'}
                                                      </div>
                                                    </div>

                                                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                                        <span style={{ 
                                                          fontSize: '0.75rem', 
                                                          fontWeight: 800, 
                                                          color: 'var(--primary-electric)', 
                                                          background: 'rgba(0, 88, 190, 0.05)', 
                                                          padding: '2px 6px', 
                                                          borderRadius: '4px' 
                                                        }}>
                                                          {order[mapping.clientCode] || 'S/C'}
                                                        </span>
                                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                                                          {order[mapping.client] || 'Sin nombre'}
                                                        </span>
                                                      </div>
                                                      <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <MapPin size={12} color="#94a3b8" /> 
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                          {order[mapping.address] || 'N/A'}
                                                        </span>
                                                      </div>
                                                    </div>

                                                    <div style={{ 
                                                      borderTop: '1px solid #f1f5f9', 
                                                      paddingTop: '10px', 
                                                      display: 'flex', 
                                                      justifyContent: 'space-between', 
                                                      alignItems: 'center',
                                                      marginTop: 'auto'
                                                    }}>
                                                      <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>PESO CARGA</div>
                                                      <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>
                                                        {parseNumber(order[mapping.weight] || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg
                                                      </div>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                              
                                              <div style={{ 
                                                display: 'flex', 
                                                justifyContent: 'space-between', 
                                                alignItems: 'center',
                                                padding: '16px 24px',
                                                background: '#f8fafc',
                                                borderTop: '1px solid #e2e8f0'
                                              }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Total Parada</span>
                                                <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.1rem' }}>
                                                  {orders.reduce((acc, o) => acc + parseNumber(o[mapping.weight] || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg
                                                </span>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </React.Fragment>
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
                <span className="legend-item"><span className="legend-dot break"></span>Descanso</span>
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
                    const prevStop = sIdx > 0 ? v.itinerary[sIdx - 1] : null;
                    const transitStart = prevStop ? (prevStop.departure || prevStop.arrival) : null;
                    const transitEnd = stop.arrival || stop.departure;
                    const transitStartPos = transitStart ? getGanttPos(transitStart) : 0;
                    const transitEndPos = transitEnd ? getGanttPos(transitEnd) : 0;
                    const transitWidth = Math.max(0, transitEndPos - transitStartPos);

                    const startPos = getGanttPos(stop.arrival || stop.departure);
                    const endPos = getGanttPos(stop.departure || stop.arrival);
                    const width = Math.max(0.5, endPos - startPos);

                    return (
                      <React.Fragment key={sIdx}>
                        {/* Task 2: Transit Blocks (En Tránsito / Conducción) */}
                        {transitWidth > 0.1 && (
                          <div className="gantt-activity-block transit"
                               style={{ 
                                 left: `${transitStartPos}%`,
                                 width: `${transitWidth}%`,
                                 backgroundColor: 'rgba(148, 163, 184, 0.25)',
                                 backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 10px, rgba(148, 163, 184, 0.1) 10px, rgba(148, 163, 184, 0.1) 20px)',
                                 border: '1px dashed rgba(148, 163, 184, 0.4)',
                                 borderRadius: '4px',
                                 zIndex: 10
                               }}
                               onMouseEnter={handleTooltipPosition}
                               >
                            <div className="activity-tooltip">
                              <span className="tooltip-seq">🚚</span>
                              <span className="tooltip-main">En Tránsito / Conducción</span>
                              <span className="tooltip-time">
                                {formatTime(transitStart)} - {formatTime(transitEnd)}
                              </span>
                              <div className="tooltip-breakdown">
                                <span style={{ color: '#94a3b8' }}>⏱️ Duración: {Math.round((new Date(transitEnd) - new Date(transitStart)) / 60000)}m</span>
                              </div>
                            </div>
                            {transitWidth > 5 && (
                              <span className="block-label" style={{ color: '#94a3b8', fontSize: '0.65rem' }}>
                                En Tránsito
                              </span>
                            )}
                          </div>
                        )}
                        {/* Bloque principal */}
                        <div className={`gantt-activity-block ${stop.type}`}
                             style={{ 
                               left: `${startPos}%`,
                               width: `${width}%`
                             }}
                             onMouseEnter={handleTooltipPosition}
                             >
                          {(stop.type === 'delivery' || stop.type === 'reload' || stop.type === 'break') && (
                            <div className="activity-tooltip">
                              <span className="tooltip-seq">{stop.sequence || (stop.type === 'break' ? '☕' : 'R')}</span>
                              <span className="tooltip-main">
                                {stop.label}
                                {stop.type !== 'break' && stop.jobs?.length > 0 && (
                                  <div style={{ 
                                    marginTop: '10px', 
                                    paddingTop: '10px', 
                                    borderTop: '1px solid rgba(255,255,255,0.15)', 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: '8px',
                                    maxHeight: '220px',
                                    overflowY: 'auto',
                                    paddingRight: '4px'
                                  }}>
                                    <strong style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                      Pedidos ({stop.jobs.flatMap(j => j.orders).length}):
                                    </strong>
                                    {stop.jobs.flatMap(j => j.orders).map((order, oIdx) => (
                                      <div key={oIdx} style={{ 
                                        background: 'rgba(255, 255, 255, 0.05)', 
                                        borderRadius: '6px', 
                                        border: '1px solid rgba(255, 255, 255, 0.1)', 
                                        padding: '8px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px'
                                      }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: '0.75rem' }}>
                                            {getOrderId(order, mapping)}
                                          </span>
                                          <span style={{ 
                                            background: 'rgba(0, 88, 190, 0.3)', 
                                            color: '#93c5fd', 
                                            padding: '2px 6px', 
                                            borderRadius: '4px',
                                            fontSize: '0.65rem',
                                            fontWeight: 700
                                          }}>
                                            {order[mapping.movimiento] || 'N/A'}
                                          </span>
                                        </div>
                                        <div style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 600 }}>
                                          {order[mapping.client] || 'Sin nombre'}
                                        </div>
                                        <div style={{ color: '#cbd5e1', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          <MapPin size={10} color="#94a3b8" /> 
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                                            {order[mapping.address] || 'N/A'}
                                          </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                                          <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>Peso:</span>
                                          <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
                                            {parseNumber(order[mapping.weight] || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </span>
                              {stop.type !== 'break' && stop.address && (
                                <span className="tooltip-address" style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', margin: '4px 0' }}>
                                  <MapPin size={8} /> {stop.address}
                                </span>
                              )}
                              <span className="tooltip-time" style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                                <span style={{ fontWeight: 800, color: '#fff' }}>{formatTime(stop.arrival)} - {formatTime(stop.departure)} {analysis.dataDays > 1 && stop.arrival && `· ${formatDate(stop.arrival)}`}</span>
                                {stop.arrival && stop.departure && (
                                  <span style={{ fontSize: '0.65rem', color: '#cbd5e1', fontWeight: 600 }}>
                                    ⏱️ Tiempo total en sitio: {Math.round((stop.departure - stop.arrival) / 60000)}m
                                  </span>
                                )}
                              </span>
                              {(stop.waitMin > 0 || stop.serviceMin > 0 || stop.breakMin > 0) && (
                                <div className="tooltip-breakdown" style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed rgba(255,255,255,0.2)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {stop.serviceMin > 0 && <span style={{ color: '#4ade80' }}>🚚 <strong>Servicio:</strong> {Math.round(stop.serviceMin)}m <span style={{fontSize: '0.6rem', color: '#94a3b8'}}>(Tiempo de descarga)</span></span>}
                                  {stop.waitMin > 0 && (
                                    <>
                                      <span style={{ color: '#fbbf24' }}>⏳ <strong>Espera:</strong> {Math.round(stop.waitMin)}m</span>
                                      <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontStyle: 'italic', whiteSpace: 'normal', maxWidth: '220px', lineHeight: '1.2' }}>
                                        Llegó antes de que la ventana del cliente abriera o espera de turno.
                                      </span>
                                    </>
                                  )}
                                  {stop.breakMin > 0 && (
                                    <>
                                      <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>☕ <strong>{stop.breakMin >= 240 ? 'Pausa Nocturna Automatizada:' : 'Descanso de flota:'}</strong> {Math.round(stop.breakMin)}m</span>
                                      <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontStyle: 'italic', whiteSpace: 'normal', maxWidth: '220px', lineHeight: '1.2' }}>
                                        {stop.breakMin >= 240 
                                          ? 'El vehículo se detiene por cierre del CEDI y para cumplir con el descanso obligatorio.' 
                                          : 'Pausa programada según la normativa del conductor en este horario.'}
                                      </span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {stop.type === 'delivery' && width > 2 && (
                            <span className="block-label">
                              {stop.sequence}
                              {stop.breakMin > 0 && " ☕"}
                            </span>
                          )}
                        </div>

                        {/* Bloques de descanso superpuestos/separados si existen */}
                        {stop.breakDetails && stop.breakDetails.length > 0 && stop.breakDetails.map((b, bIdx) => {
                          if (!b.start || !b.end) return null;
                          const bStartPos = getGanttPos(new Date(b.start));
                          const bEndPos = getGanttPos(new Date(b.end));
                          const bWidth = Math.max(0.5, bEndPos - bStartPos);
                          
                          return (
                            <div key={`break-${sIdx}-${bIdx}`} 
                                 className="gantt-activity-block break-overlay"
                                 style={{ 
                                   left: `${bStartPos}%`,
                                   width: `${bWidth}%`,
                                   backgroundColor: '#3b82f6',
                                   backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.2) 5px, rgba(255,255,255,0.2) 10px)',
                                   border: '1px solid #2563eb',
                                   zIndex: 15
                                 }}
                                 onMouseEnter={handleTooltipPosition}
                                 >
                              <div className="activity-tooltip">
                                <span className="tooltip-seq">☕</span>
                                <span className="tooltip-main">Descanso programado</span>
                                <span className="tooltip-time">
                                  {formatTime(new Date(b.start))} - {formatTime(new Date(b.end))}
                                </span>
                                <div className="tooltip-breakdown">
                                  <span style={{ color: '#60a5fa' }}>☕ Duración: {Math.round((b.end - b.start) / 60000)}m</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </React.Fragment>
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
            <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: '10px', padding: '10px' }} title="Porcentaje de pedidos totales que lograron ser asignados satisfactoriamente a una ruta.">
              <div style={{ color: '#86efac', fontSize: '0.68rem', textTransform: 'uppercase' }}>Cobertura real</div>
              <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{Math.round(analysis.coveragePct)}%</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.62rem', marginTop: '2px' }}>Capacidad de atención vs demanda total</div>
              <div style={{ color: '#86efac', fontSize: '0.68rem', marginTop: '4px' }}>{analysis.totalOrdersAssigned}/{analysis.totalOrdersFromCsv} pedidos</div>
            </div>
            <div style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: '10px', padding: '10px' }} title="Promedio de pedidos que cada vehículo transporta por viaje.">
              <div style={{ color: '#93c5fd', fontSize: '0.68rem', textTransform: 'uppercase' }}>Productividad por ruta</div>
              <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{analysis.averageOrdersPerRoute.toFixed(1)} pedidos/ruta</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.62rem', marginTop: '2px' }}>Eficiencia de carga por unidad despachada</div>
              <div style={{ color: '#93c5fd', fontSize: '0.68rem', marginTop: '4px' }}>{analysis.totalRoutes} rutas activas</div>
            </div>
            <div style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.25)', borderRadius: '10px', padding: '10px' }} title="Indica cuántos pedidos se entregan en promedio en cada parada física (multicpedidos por punto).">
              <div style={{ color: '#fde68a', fontSize: '0.68rem', textTransform: 'uppercase' }}>Consolidación de entregas</div>
              <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{analysis.consolidationRatio.toFixed(2)} pedidos/parada</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.62rem', marginTop: '2px' }}>Aprovechamiento de paradas logísticas</div>
              <div style={{ color: '#fde68a', fontSize: '0.68rem', marginTop: '4px' }}>{analysis.totalStopsAssigned} paradas totales</div>
            </div>
            <div style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: '10px', padding: '10px' }} title="Rutas ahorradas gracias a la optimización comparado con despachos individuales.">
              <div style={{ color: '#c4b5fd', fontSize: '0.68rem', textTransform: 'uppercase' }}>Ganancia de productividad</div>
              <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>-{analysis.estimatedRoutesSaved} rutas equivalentes</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.62rem', marginTop: '2px' }}>Ahorro operativo y de flota estimado</div>
              <div style={{ color: '#c4b5fd', fontSize: '0.68rem', marginTop: '4px' }}>{Math.round(analysis.productivityGainPct)}% de optimización real</div>
            </div>
            <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: '10px', padding: '10px' }} title="Número de pedidos que no pudieron entrar en ruta por restricciones de tiempo, carga o skills.">
              <div style={{ color: '#fca5a5', fontSize: '0.68rem', textTransform: 'uppercase' }}>Brecha operativa</div>
              <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{analysis.totalOrdersUnassigned} pedidos no cubiertos</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.62rem', marginTop: '2px' }}>Demanda insatisfecha por restricciones</div>
              <div style={{ color: '#fca5a5', fontSize: '0.68rem', marginTop: '4px' }}>Foco en finanzas y planificación</div>
            </div>
            <div style={{ background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.25)', borderRadius: '10px', padding: '10px' }} title="Recorrido promedio en kilómetros por cada ruta generada.">
              <div style={{ color: '#5eead4', fontSize: '0.68rem', textTransform: 'uppercase' }}>Intensidad de red</div>
              <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 700 }}>{analysis.averageKmPerRoute.toFixed(1)} km/ruta</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.62rem', marginTop: '2px' }}>Kilometraje útil promedio por unidad</div>
              <div style={{ color: '#5eead4', fontSize: '0.68rem', marginTop: '4px' }}>{analysis.totalDist.toLocaleString()} km totales</div>
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
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Pedido #</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Job ID</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Movimiento</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Cliente</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Dirección</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Skill</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Motivo (ES)</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Peso</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Código</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.unassignedDetails.map((item, idx) => {
                      const firstOrder = item.orders?.[0] || {};
                      const clientName = firstOrder?.[mapping.client] || 'Sin cliente identificado';
                      const skill = firstOrder?.[mapping.skill] || 'N/A';
                      const codeText = item.reasonCodes.join(', ');
                      const totalJobWeight = (item.orders || []).reduce((acc, o) => acc + parseNumber(o[mapping.weight] || 0), 0);
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '6px 8px', fontWeight: '700', color: '#fff' }}>{getOrderId(firstOrder, mapping)}</td>
                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#fbbf24' }}>{item.jobId}</td>
                          <td style={{ padding: '6px 8px', fontWeight: '800', color: 'var(--primary-electric)' }}>{firstOrder[mapping.movimiento] || 'N/A'}</td>
                          <td style={{ padding: '6px 8px', color: '#e2e8f0' }}>
                            <span style={{ color: '#ff8a8a', marginRight: '6px' }}>[{firstOrder[mapping.clientCode] || 'S/C'}]</span>
                            {clientName}
                          </td>
                          <td style={{ padding: '6px 8px', color: '#94a3b8', fontSize: '0.68rem' }}>{firstOrder?.[mapping.address] || 'N/A'}</td>
                          <td style={{ padding: '6px 8px', color: '#c4b5fd' }}>{skill}</td>
                          <td style={{ padding: '6px 8px', color: '#fca5a5' }}>{item.reasonEs}</td>
                          <td style={{ padding: '6px 8px', fontWeight: '800', color: '#f9fafb' }}>{totalJobWeight.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg</td>
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
