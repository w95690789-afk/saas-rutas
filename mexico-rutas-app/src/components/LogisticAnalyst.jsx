import React, { useMemo } from 'react';
import { 
  BarChart3, TrendingUp, Truck, Package, BrainCircuit, 
  Clock, MapPin, Gauge, AlertCircle, TrendingDown,
  Target, ShieldAlert, Info
} from 'lucide-react';

const LogisticAnalyst = ({ result }) => {
  const analysis = useMemo(() => {
    if (!result || !result.solution) return null;

    const solution = result.solution;
    const problem = result.problem || { plan: { jobs: [] } }; // Fallback prevent crash
    const tours = solution.tours || [];
    const unassigned = solution.unassigned || [];

    
    // Crear un mapa de pesos desde el problema original para asegurar precisión industrial
    const jobWeightMap = (problem.plan?.jobs || []).reduce((acc, job) => {
      // Extraer demanda del primer delivery (estándar en este modelo)
      const weight = job.tasks?.deliveries?.[0]?.demand?.[0] || 0;
      acc[job.id] = weight;
      return acc;
    }, {});

    const vehiclePerformance = tours.map(tour => {
      const stops = tour.stops || [];
      const activities = stops.flatMap(s => s.activities || []);
      const deliveries = activities.filter(a => a.type === 'delivery');
      
      // Recuperar pesos reales mapeando el jobId de la actividad con el problema original
      const load = deliveries.reduce((acc, a) => acc + (jobWeightMap[a.jobId] || 0), 0);
      
      const startTimeRaw = stops[0]?.arrival?.time || "";
      const endTimeRaw = stops[stops.length - 1]?.arrival?.time || "";
      
      const rawType = tour.typeId || "Desconocido";
      const displayType = rawType.includes('Torton') ? 'Torton Propio' : 
                          rawType.includes('Tracto') ? 'Tracto Pesado' :
                          rawType.includes('Truck') ? 'Camión Tercero' : rawType;
      
      const capacity = rawType.includes('Tracto') ? 31000 : 
                       rawType.includes('Torton') ? 18000 : 6000;
      const utilization = (load / capacity) * 100;

      return {
        id: tour.vehicleId,
        type: displayType,
        start: startTimeRaw ? new Date(startTimeRaw).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : "06:00",
        end: endTimeRaw ? new Date(endTimeRaw).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : "18:00",
        stopsCount: deliveries.length,
        load,
        capacity,
        utilization,
        distance: Math.round((tour.statistic?.distance || 0) / 1000)
      };
    });

    const totalWeight = vehiclePerformance.reduce((acc, v) => acc + v.load, 0);
    const totalCapacity = vehiclePerformance.reduce((acc, v) => acc + v.capacity, 0);
    const globalUtilization = totalCapacity > 0 ? (totalWeight / totalCapacity) * 100 : 0;
    const totalDist = vehiclePerformance.reduce((acc, v) => acc + v.distance, 0);

    return {
      vehiclePerformance,
      globalUtilization,
      totalWeight,
      totalDist,
      unassigned,
      unassignedCount: unassigned.length,
      assignedJobsCount: tours.reduce((acc, t) => acc + t.stops.flatMap(s => s.activities).filter(a => a.type === 'delivery').length, 0),
      impactScore: totalDist > 0 ? Math.round((totalWeight / totalDist) * 10) / 10 : 0,
      totalJobsInProblem: problem.plan?.jobs?.length || 0,
      jobWeightMap
    };
  }, [result]);

  if (!analysis) return null;

  const translateReason = (code) => {
    const reasons = {
      'CANNOT_BE_SERVED_WITHIN_TIME_WINDOW': 'Fuera de ventana horaria del cliente',
      'NO_VEHICLE_WITH_REQUIRED_CAPACITY': 'Exceso de peso para la flota (Capacidad)',
      'CAPACITY_CONSTRAINT': 'Exceso de peso para la flota',
      'NO_VEHICLE_WITH_REQUIRED_SKILLS': 'Restricción de maniobra (Skill)',
      'SKILL_CONSTRAINT': 'Restricción de maniobra (Skill)',
      'WINDOW_CONSTRAINT': 'Fuera de ventana horaria',
      'RECHARGE_CONSTRAINT': 'Límite de autonomía/distancia',
      'NO_VEHICLE_AVAILABLE': 'No hay vehículos disponibles suficientes',
      'NO_VEHICLE_AVAILABLE_FOR_REQUIRED_TIME': 'Conflicto de disponibilidad vehicular',
      'PICKUP_DELIVERY_TIME_WINDOW_MISMATCH': 'Conflicto entre tiempos de carga/entrega'
    };
    return reasons[code] || code;
  };

  return (
    <div className="strategic-dashboard animate-fade-in">
      {/* CABECERA ESTRATÉGICA */}
      <div className="strategic-header">
        <div className="title-block">
          <BrainCircuit size={28} color="var(--primary-electric)" />
          <div>
            <h2>Diagnóstico de Operación Logística</h2>
            <p>Estrategia de última milla y eficiencia de activos</p>
          </div>
        </div>
        <div className="global-kpis">
          <div className="kpi-mini-card">
            <span className="kpi-label">Uso de Capacidad Flota</span>
            <div className="kpi-value-row">
              <span className="kpi-value">{analysis.globalUtilization.toFixed(1)}%</span>
              <Gauge size={16} />
            </div>
            <div className="kpi-progress">
              <div className="fill" style={{ width: `${analysis.globalUtilization}%`, background: analysis.globalUtilization > 80 ? '#00885a' : '#f59e0b' }}></div>
            </div>
          </div>
          <div className="kpi-mini-card highlight">
            <span className="kpi-label">Efectividad de Entrega</span>
            <div className="kpi-value-row">
              <span className="kpi-value">{Math.round((analysis.assignedJobsCount / analysis.totalJobsInProblem) * 100)}%</span>
              <Target size={16} />
            </div>
            <p className="kpi-subText">{analysis.assignedJobsCount} de {analysis.totalJobsInProblem} puntos consolidados</p>
          </div>
        </div>
      </div>

      {/* NOTA DE CONSOLIDACIÓN */}
      <div className="insight-banner" style={{ background: 'rgba(0, 88, 190, 0.05)', padding: '1.25rem', borderRadius: '12px', marginBottom: '2rem', display: 'flex', gap: '1rem', borderLeft: '4px solid var(--primary-electric)' }}>
        <Info size={20} color="var(--primary-electric)" />
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          <strong>Nota de Análisis:</strong> Los pedidos se han agrupado automáticamente por <strong>ID de Movimiento</strong>. 
          Si tu archivo tiene 100 filas pero el análisis muestra {analysis.totalJobsInProblem} puntos, es porque varias filas pertenecen al mismo destino. 
          El peso visualizado es la suma unificada de todos los artículos de dicho movimiento.
        </p>
      </div>

      {/* DETALLE POR UNIDAD */}
      <div className="report-section">
        <div className="section-title">
          <Truck size={18} />
          <h3>Desempeño por Vehículo</h3>
        </div>
        
        {analysis.vehiclePerformance.length > 0 ? (
          <div className="performance-table-wrapper">
            <table className="performance-table">
              <thead>
                <tr>
                  <th>Identificador</th>
                  <th>Tipo</th>
                  <th>Horario Real</th>
                  <th>Pedidos</th>
                  <th>Carga (kg)</th>
                  <th>Ocupación</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {analysis.vehiclePerformance.map((v, i) => (
                  <tr key={i}>
                    <td><strong>{v.id}</strong></td>
                    <td><span className="badge-type">{v.type}</span></td>
                    <td>
                      <div className="time-cell">
                        <Clock size={12} />
                        <span>{v.start} - {v.end}</span>
                      </div>
                    </td>
                    <td><span className="count-bubble">{v.stopsCount}</span></td>
                    <td><strong>{Math.round(v.load).toLocaleString()} kg</strong></td>
                    <td>
                      <div className="util-bar-container">
                        <div className="util-bar-bg">
                          <div className={`util-bar-fill ${v.utilization > 90 ? 'high' : v.utilization > 50 ? 'med' : 'low'}`} 
                               style={{ width: `${v.utilization}%` }}></div>
                        </div>
                        <span className="util-text">{Math.round(v.utilization)}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-tag ${v.utilization > 70 ? 'ok' : 'sub'}`}>
                        {v.utilization > 70 ? 'Eficiente' : 'Subutilizado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="no-data-alert">
            <ShieldAlert size={24} />
            <div>
              <strong style={{ display: 'block' }}>Sin Rutas Asignadas</strong>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>El modelo no pudo generar rutas válidas. Verifica las restricciones de capacidad y ventanas horarias abajo.</p>
            </div>
          </div>
        )}
      </div>

      {/* PEDIDOS NO ASIGNADOS */}
      {analysis.unassignedCount > 0 && (
        <div className="report-section unassigned-report">
          <div className="section-title error">
            <ShieldAlert size={18} />
            <h3>Pedidos sin Asignación ({analysis.unassignedCount})</h3>
          </div>
          
          <div className="unassigned-container">
            <div className="unassigned-grid-visual">
              <div className="unassigned-diagnosis-card">
                <h4>Diagnóstico de Incidencias</h4>
                <ul className="cause-list">
                  {Array.from(new Set(analysis.unassigned.flatMap(u => (u.reasons || []).map(r => r.code)))).map(code => {
                    const label = translateReason(code);
                    const count = analysis.unassigned.filter(u => (u.reasons || []).some(r => r.code === code)).length;
                    return (
                      <li key={code}>
                        <span className="dot"></span>
                        <strong>{label}</strong>
                        <p>{count} puntos de entrega rechazados</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="unassigned-suggestion-card">
                <BrainCircuit size={24} />
                <h4>Plan de Mitigación</h4>
                <p>
                  {analysis.globalUtilization < 50 
                    ? "Detectamos baja utilización. El rechazo se debe probablemente a ventanas horarias muy cerradas o incompatibilidad de habilidades (Skill). Intenta flexibilizar los horarios." 
                    : "La flota está operando cerca de su límite. Considera aumentar la capacidad de carga o habilitar más vehículos para absorber la demanda rechazada."}
                </p>
              </div>
            </div>

            {/* LISTA EXPLÍCITA DE PEDIDOS RECHAZADOS */}
            <div className="rejected-list-card" style={{ marginTop: '1.5rem', background: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Package size={18} color="var(--primary-electric)" />
                  Lista Detallada de Rechazos
                </h4>
                <span style={{ fontSize: '0.75rem', color: '#666' }}>Mapeo con columna de peso configurada</span>
              </div>
              <div className="rejected-table-wrapper" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="industrial-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>ID Punto</th>
                      <th>Peso (Total Grupo)</th>
                      <th>Causa Principal</th>
                      <th>Detalle Técnico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.unassigned.map((u, i) => (
                      <tr key={i}>
                        <td><strong>{u.jobId}</strong></td>
                        <td>{Math.round(analysis.jobWeightMap[u.jobId] || 0).toLocaleString()} kg</td>
                        <td style={{ color: '#c53030' }}>{translateReason(u.reasons?.[0]?.code)}</td>
                        <td style={{ color: '#666', fontSize: '0.75rem' }}>{u.reasons?.[0]?.description || 'Sin descripción'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogisticAnalyst;
