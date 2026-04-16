import React, { useMemo, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Upload, Plus, MapPin, AlertTriangle, CheckCircle2, Target, FileDown, LocateFixed, Settings, PlayCircle, RefreshCw
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

const DEFAULT_CENTER = { lat: 19.4326, lng: -99.1332 };

const computeQuality = (item) => {
  if (!item) {
    return {
      score: 0,
      exactitud: 'No georreferenciada',
      riesgo: 'Critico',
      resolucion: 'Fallo geocodificacion'
    };
  }

  const queryScore = item.scoring?.queryScore ?? null;
  const fields = Object.values(item.scoring?.fieldScore || {});
  const fieldScoreAvg = fields.length ? fields.reduce((a, b) => a + b, 0) / fields.length : queryScore;
  const resultType = (item.resultType || '').toLowerCase();

  let score;
  if (queryScore !== null && queryScore !== undefined) {
    score = Math.round(((queryScore * 0.7) + ((fieldScoreAvg ?? queryScore) * 0.3)) * 100);
  } else if (resultType === 'housenumber' || resultType === 'housenumber') {
    score = 92;
  } else if (resultType === 'street') {
    score = 82;
  } else if (resultType === 'intersection') {
    score = 72;
  } else if (resultType === 'locality' || resultType === 'postalcode') {
    score = 60;
  } else {
    score = 50;
  }

  let exactitud = 'No confiable';
  if (score >= 90 && (resultType === 'houseNumber' || resultType === 'housenumber')) exactitud = 'Exacta';
  else if (score >= 80) exactitud = 'Alta';
  else if (score >= 65) exactitud = 'Media';
  else if (score >= 50) exactitud = 'Baja';

  let riesgo = 'Bajo';
  if (score < 50) riesgo = 'Critico';
  else if (score < 65) riesgo = 'Alto';
  else if (score < 80) riesgo = 'Moderado';

  return {
    score,
    exactitud,
    riesgo,
    resolucion: item.resultType || 'No definido'
  };
};

const MarkerDragController = ({ position, onChange }) => {
  const [markerPos, setMarkerPos] = useState(position);
  useMapEvents({
    click(e) {
      const next = { lat: e.latlng.lat, lng: e.latlng.lng };
      setMarkerPos(next);
      onChange(next);
    }
  });

  return (
    <Marker
      draggable
      position={markerPos}
      eventHandlers={{
        dragend: (e) => {
          const latlng = e.target.getLatLng();
          const next = { lat: latlng.lat, lng: latlng.lng };
          setMarkerPos(next);
          onChange(next);
        }
      }}
    />
  );
};

const GeoreferenceModule = ({ apiKey }) => {
  const [rows, setRows] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manual, setManual] = useState({ address: '', city: '', state: '', postalCode: '', country: 'MX' });
  const [selected, setSelected] = useState(null);
  const [draftPoint, setDraftPoint] = useState(null);
  const [isConfirmingPoint, setIsConfirmingPoint] = useState(false);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);

  // States for Batch Mapping
  const [fileHeaders, setFileHeaders] = useState([]);
  const [fileRawData, setFileRawData] = useState([]);
  const [isMapping, setIsMapping] = useState(false);
  const [geoMapping, setGeoMapping] = useState({
    address: '', city: '', state: '', postalCode: '', country: ''
  });

  const normalizeRecord = (raw, mappingUsed, idx) => {
    const address = raw[mappingUsed.address] || '';
    const city = raw[mappingUsed.city] || '';
    const state = raw[mappingUsed.state] || '';
    const postalCode = raw[mappingUsed.postalCode] || '';
    const country = raw[mappingUsed.country] || 'MX';
    const fullAddress = [address, city, state, postalCode, country].filter(Boolean).join(', ');

    return {
      id: `addr_${Date.now()}_${idx}`,
      source: 'archivo',
      address,
      city,
      state,
      postalCode,
      country,
      fullAddress,
      geocoded: false,
      lat: null,
      lng: null,
      score: 0,
      exactitud: 'Pendiente',
      riesgo: 'Pendiente',
      resolucion: '',
      providerLabel: '',
      mapView: null,
      manualAdjusted: false,
      geocodeStatus: 'pendiente',
      geocodeError: '',
      geocodedAt: null
    };
  };

  const parseFile = async (file) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const handleData = (data) => {
      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        setFileHeaders(headers);
        setFileRawData(data);
        setIsMapping(true);
        
        // Auto-detect headers
        const newMap = { address: '', city: '', state: '', postalCode: '', country: '' };
        const detection = {
          address: ['address', 'direccion', 'dirección', 'calle', 'street'],
          city: ['city', 'ciudad', 'municipio', 'locality'],
          state: ['state', 'estado', 'provincia', 'region'],
          postalCode: ['postalCode', 'cp', 'zip', 'codigo_postal', 'código_postal'],
          country: ['country', 'pais', 'país']
        };
        Object.entries(detection).forEach(([field, keywords]) => {
          const found = headers.find(h => keywords.some(k => h.toLowerCase() === k.toLowerCase()));
          if (found) newMap[field] = found;
        });
        setGeoMapping(newMap);
      }
    };

    if (ext === 'csv' || ext === 'txt') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => handleData(res.data)
      });
      return;
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
      handleData(data);
    }
  };

  const geocodeOne = async (record) => {
    const q = encodeURIComponent(record.fullAddress);
    const url = `https://geocode.search.hereapi.com/v1/geocode?q=${q}&limit=1&lang=es-MX&apiKey=${apiKey}`;
    const res = await fetch(url);
    const payload = await res.json();
    const item = payload.items?.[0] || null;
    const quality = computeQuality(item);
    return {
      ...record,
      geocoded: true,
      lat: item?.position?.lat ?? null,
      lng: item?.position?.lng ?? null,
      providerLabel: item?.title || '',
      mapView: item?.mapView || null,
      ...quality,
      geocodeStatus: item?.position ? 'ok' : 'error'
    };
  };

  const startBatchGeocoding = async () => {
    if (!fileRawData.length) return;
    const normalized = fileRawData.map((row, i) => normalizeRecord(row, geoMapping, i)).filter(r => r.fullAddress);
    setRows(prev => [...prev, ...normalized]);
    setIsMapping(false);
    setIsProcessing(true);

    // Process batch sequentially to avoid rate limiting and allow UI updates
    let currentResults = [...normalized];
    for (let i = 0; i < currentResults.length; i++) {
      try {
        const res = await geocodeOne(currentResults[i]);
        setRows(prev => prev.map(r => r.id === res.id ? res : r));
      } catch (err) {
        console.error('Batch error:', err);
      }
    }
    setIsProcessing(false);
  };

  const runPendingGeocoding = async () => {
    const pending = rows.filter(r => !r.geocoded || r.geocodeStatus === 'error');
    if (!pending.length) return;
    setIsProcessing(true);
    for (const rec of pending) {
      try {
        const res = await geocodeOne(rec);
        setRows(prev => prev.map(r => r.id === res.id ? res : r));
      } catch (err) {
        console.error('Retry error:', err);
      }
    }
    setIsProcessing(false);
  };

  const addManual = () => {
    const fullAddress = [manual.address, manual.city, manual.state, manual.postalCode, manual.country]
      .filter(Boolean).join(', ');
    if (!fullAddress) return;
    setRows(prev => [
      ...prev,
      {
        id: `manual_${Date.now()}`,
        source: 'manual',
        address: manual.address,
        city: manual.city,
        state: manual.state,
        postalCode: manual.postalCode,
        country: manual.country || 'MX',
        fullAddress,
        geocoded: false,
        lat: null,
        lng: null,
        score: 0,
        exactitud: 'Pendiente',
        riesgo: 'Pendiente',
        resolucion: '',
        providerLabel: '',
        mapView: null,
        manualAdjusted: false,
        geocodeStatus: 'pendiente',
        geocodeError: '',
        geocodedAt: null
      }
    ]);
    setManual({ address: '', city: '', state: '', postalCode: '', country: 'MX' });
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const done = rows.filter(r => r.geocoded).length;
    const exactas = rows.filter(r => r.exactitud === 'Exacta' || r.exactitud === 'Alta').length;
    const avgScore = done ? Math.round(rows.filter(r => r.geocoded).reduce((acc, r) => acc + (r.score || 0), 0) / done) : 0;
    const alto = rows.filter(r => r.riesgo === 'Alto' || r.riesgo === 'Critico').length;
    return { total, done, exactas, avgScore, alto };
  }, [rows]);
  
  const displayedRows = useMemo(() => {
    return rows.filter(r => 
      r.riesgo === 'Critico' || 
      r.riesgo === 'Alto' || 
      r.riesgo === 'Moderado' ||
      r.riesgo === 'Pendiente'
    );
  }, [rows]);

  const exportCSV = () => {
    const data = rows.map(r => ({
      Direccion: r.fullAddress,
      Latitud: r.lat,
      Longitud: r.lng,
      Exactitud: r.exactitud,
      Score: r.score,
      Riesgo: r.riesgo,
      Manual: r.manualAdjusted ? 'SI' : 'NO'
    }));
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `georef_results_${Date.now()}.csv`;
    a.click();
  };

  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      api: 'HERE Geocoding and Search API v1',
      metrics: stats,
      records: rows.map(r => ({
        direccion: r.fullAddress,
        lat: r.lat,
        lng: r.lng,
        exactitud: r.exactitud,
        score: r.score,
        riesgo: r.riesgo,
        resolucion: r.resolucion
      }))
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `georef_batch_${Date.now()}.json`;
    a.click();
  };

  const openMap = (record) => {
    const center = record?.lat && record?.lng ? { lat: record.lat, lng: record.lng } : DEFAULT_CENTER;
    setSelected({ ...record });
    setDraftPoint({ lat: record?.lat || center.lat, lng: record?.lng || center.lng });
  };

  const confirmPointerLocation = async () => {
    if (!selected || !draftPoint) return;
    setIsConfirmingPoint(true);
    try {
      const reverseUrl = `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${draftPoint.lat},${draftPoint.lng}&lang=es-MX&apiKey=${apiKey}`;
      const res = await fetch(reverseUrl);
      const payload = await res.json();
      const item = payload.items?.[0] || null;
      const quality = computeQuality(item);

      const updated = {
        ...selected,
        lat: draftPoint.lat,
        lng: draftPoint.lng,
        providerLabel: item?.title || selected.providerLabel,
        manualAdjusted: true,
        geocoded: true,
        ...quality,
        geocodeStatus: 'ok'
      };

      setRows(prev => prev.map(r => (r.id === selected.id ? updated : r)));
      setSelected(null);
      setDraftPoint(null);
    } catch (err) {
      console.error('Reverse Geocode error:', err);
      alert(`No se pudo validar la ubicación: ${err.message}`);
    } finally {
      setIsConfirmingPoint(false);
    }
  };

  return (
    <div className="strategic-dashboard animate-fade-in" style={{ marginTop: 0 }}>
      {/* HEADER SECTION */}
      <div className="strategic-header" style={{ marginBottom: '1.2rem' }}>
        <div className="title-block">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <LocateFixed size={24} color="var(--primary-electric)" />
            <h2 style={{ margin: 0 }}>Módulo de Geocodificación Masiva</h2>
          </div>
          <p>Sube archivos, mapea columnas y procesa batch con scoring de riesgo en tiempo real.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-secondary" onClick={exportCSV} disabled={!rows.length} style={{ width: 'auto', padding: '0.75rem 1rem', background: '#fff', border: '1px solid #e2e8f0' }}>
            <FileDown size={14} style={{ marginRight: 8, color: '#16a34a' }} />
            Descargar CSV
          </button>
          <button className="btn-primary" onClick={exportReport} disabled={!rows.length} style={{ width: 'auto', padding: '0.75rem 1.2rem' }}>
            <FileDown size={14} style={{ marginRight: 8 }} />
            Descargar JSON
          </button>
          <button 
            className="btn-secondary" 
            onClick={runPendingGeocoding} 
            disabled={isProcessing || !rows.filter(r => r.geocodeStatus === 'error').length}
            style={{ 
              width: 'auto', 
              padding: '0.75rem 1rem', 
              background: '#fef2f2', 
              border: '1px solid #fee2e2', 
              color: '#dc2626',
              fontSize: '0.75rem',
              fontWeight: 800
            }}
          >
            <RefreshCw size={14} style={{ marginRight: 8 }} className={isProcessing ? 'animate-spin' : ''} />
            RELANZAR FALLIDOS ({rows.filter(r => r.geocodeStatus === 'error').length})
          </button>
        </div>
      </div>

      {/* UPLOAD & MAPPING SECTION */}
      <div style={{ display: 'grid', gridTemplateColumns: isMapping ? '1fr' : '1.4fr 1fr', gap: '14px', marginBottom: '14px' }}>
        <div className="nav-card" style={{ padding: '20px', transition: 'all 0.3s ease' }}>
          {!isMapping ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Upload size={16} color="var(--primary-electric)" />
                Carga de Archivos (CSV, Excel)
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'rgba(0,88,190,0.03)', padding: '20px', borderRadius: '12px', border: '1px dashed rgba(0,88,190,0.2)' }}>
                <label className="btn-primary" style={{ cursor: 'pointer', width: 'auto', padding: '0.75rem 2rem' }}>
                  <Plus size={16} style={{ marginRight: 8 }} />
                  Subir Nuevo Archivo
                  <input type="file" accept=".csv,.txt,.xlsx,.xls" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])} />
                </label>
                <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.5 }}>
                  Al subir un archivo entrarás en el **Modo Mapeo**.<br/>
                  Podrás elegir qué columna contiene la calle, ciudad, etc.
                </div>
              </div>
              
              <div style={{ marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '12px' }}>
                  <div style={{ width: 4, height: 16, background: 'var(--primary-electric)', borderRadius: 2 }}></div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Entrada Manual Express (Punto Único)</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.8fr 0.6fr auto', gap: '10px' }}>
                  <div className="form-item">
                    <input style={{ background: '#fff' }} placeholder="Calle y Número..." value={manual.address} onChange={(e) => setManual({ ...manual, address: e.target.value })} />
                  </div>
                  <div className="form-item">
                    <input style={{ background: '#fff' }} placeholder="Ciudad..." value={manual.city} onChange={(e) => setManual({ ...manual, city: e.target.value })} />
                  </div>
                  <div className="form-item">
                    <input style={{ background: '#fff' }} placeholder="Estado..." value={manual.state} onChange={(e) => setManual({ ...manual, state: e.target.value })} />
                  </div>
                  <div className="form-item">
                    <input style={{ background: '#fff' }} placeholder="CP..." value={manual.postalCode} onChange={(e) => setManual({ ...manual, postalCode: e.target.value })} />
                  </div>
                  <div className="form-item">
                    <input style={{ background: '#f8fafc', textAlign: 'center', fontWeight: 700 }} value="MX" disabled />
                  </div>
                  <button className="btn-primary" onClick={addManual} style={{ height: '42px', borderRadius: '8px', minWidth: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="animate-slide-up">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Settings size={22} color="var(--primary-electric)" />
                    Configuración de Mapeo Batch
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Detectadas {fileRawData.length} direcciones para procesar.</p>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn-secondary" style={{ width: 'auto', padding: '0.7rem 1.5rem' }} onClick={() => setIsMapping(false)}>Descartar archivo</button>
                  <button className="btn-primary" style={{ width: 'auto', padding: '0.7rem 2.5rem' }} onClick={startBatchGeocoding}>
                    <PlayCircle size={18} style={{ marginRight: 8 }} />
                    Lanzar Geocodificación Masiva
                  </button>
                </div>
              </div>

              <div style={{ 
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', 
                background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
              }}>
                <div className="form-item">
                  <label style={{ color: 'var(--primary-electric)', fontWeight: 700 }}>Calle y Número (Address) *</label>
                  <select value={geoMapping.address} onChange={e => setGeoMapping({...geoMapping, address: e.target.value})} style={{ border: '2px solid #e2e8f0' }}>
                    <option value="">-- Seleccionar Columna --</option>
                    {fileHeaders.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-item">
                  <label style={{ fontWeight: 700 }}>Ciudad / Municipio *</label>
                  <select value={geoMapping.city} onChange={e => setGeoMapping({...geoMapping, city: e.target.value})}>
                    <option value="">-- Seleccionar Columna --</option>
                    {fileHeaders.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-item">
                  <label>Estado / Provincia</label>
                  <select value={geoMapping.state} onChange={e => setGeoMapping({...geoMapping, state: e.target.value})}>
                    <option value="">-- Opcional --</option>
                    {fileHeaders.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-item">
                  <label>Código Postal</label>
                  <select value={geoMapping.postalCode} onChange={e => setGeoMapping({...geoMapping, postalCode: e.target.value})}>
                    <option value="">-- Opcional --</option>
                    {fileHeaders.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {!isMapping && (
          <div className="nav-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: '0.85rem' }}>Métricas de Procesamiento</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="glass-card" style={{ padding: '15px', textAlign: 'center', background: 'white' }}>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>TOTAL</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{stats.total}</div>
              </div>
              <div className="glass-card" style={{ padding: '15px', textAlign: 'center', background: 'rgba(0,88,190,0.05)', border: '1px solid rgba(0,88,190,0.1)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--primary-electric)', fontWeight: 700 }}>LISTO</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--primary-electric)' }}>{stats.done}</div>
              </div>
              <div className="glass-card" style={{ padding: '15px', textAlign: 'center', background: 'rgba(22,163,74,0.05)', border: '1px solid rgba(22,163,74,0.1)' }}>
                <div style={{ fontSize: '0.65rem', color: '#16a34a', fontWeight: 700 }}>CALIDAD ALTA</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#16a34a' }}>{stats.exactas}</div>
              </div>
              <div className="glass-card" style={{ padding: '15px', textAlign: 'center', background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.1)' }}>
                <div style={{ fontSize: '0.65rem', color: '#dc2626', fontWeight: 700 }}>RIESGO/FALLO</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#dc2626' }}>{stats.alto}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RESULTS TABLE */}
      <div className="nav-card" style={{ padding: '0', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
          <strong style={{ fontSize: '0.9rem', color: '#334155' }}>Visor de Resultados Geocodificados</strong>
          {isProcessing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="loader-dots"></div>
              <span style={{ fontSize: '0.75rem', color: 'var(--primary-electric)', fontWeight: 800 }}>PROCESANDO BATCH...</span>
            </div>
          )}
        </div>
        <div style={{ maxHeight: '480px', overflow: 'auto' }}>
          <table className="industrial-table">
            <thead>
              <tr>
                <th>Dirección</th>
                <th>API Match (HERE)</th>
                <th>Coordenadas</th>
                <th>Exactitud</th>
                <th>Riesgo</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Logística</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', fontStyle: 'italic' }}>No hay datos para mostrar. Sube un archivo o ingresa una dirección manual.</td>
                </tr>
              )}
              {displayedRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ maxWidth: '220px', fontWeight: 600, fontSize: '0.9rem' }}>{r.fullAddress}</td>
                  <td style={{ fontSize: '0.8rem', color: '#475569' }}>{r.providerLabel || '-'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--primary-electric)', fontWeight: 700 }}>
                    {r.lat ? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}` : '-'}
                  </td>
                  <td>
                    <span style={{ 
                      padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800,
                      background: r.exactitud === 'Exacta' ? '#dcfce7' : r.exactitud === 'Alta' ? '#f0fdf4' : '#fefce8',
                      color: r.exactitud === 'Exacta' ? '#166534' : r.exactitud === 'Alta' ? '#15803d' : '#854d0e',
                      border: '1px solid currentColor',
                      display: 'inline-block'
                    }}>
                      {r.exactitud.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span style={{ 
                      color: r.riesgo === 'Critico' ? '#dc2626' : r.riesgo === 'Alto' ? '#ea580c' : '#16a34a',
                      fontWeight: 900, fontSize: '0.8rem'
                    }}>
                      {r.riesgo}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ 
                        width: 10, height: 10, borderRadius: '50%', 
                        background: r.geocodeStatus === 'ok' ? '#16a34a' : r.geocodeStatus === 'error' ? '#dc2626' : '#94a3b8' 
                      }}></div>
                      <span style={{ fontWeight: 800, fontSize: '0.8rem' }}>{r.geocodeStatus.toUpperCase()}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-mini" onClick={() => openMap(r)} style={{ minWidth: '100px', justifyContent: 'center' }}>
                      <MapPin size={12} style={{ marginRight: 6 }} />
                      Auditar Mapa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MAP MODAL */}
      {selected && (
        <div className="audit-overlay">
          <div className="audit-modal" style={{ width: '90vw', maxWidth: 1000 }}>
            <header className="audit-header">
              <div className="audit-title-group">
                <div className="audit-icon-box" style={{ background: 'var(--primary-electric)' }}><Target size={18} color="white" /></div>
                <div>
                  <h3 style={{ margin: 0 }}>Corrección Manual de Punto Geográfico</h3>
                  <p style={{ margin: 0, fontSize: '0.8rem' }}>Ajusta el marcador para {selected.fullAddress}</p>
                </div>
              </div>
              <button className="close-btn" onClick={() => { setSelected(null); setDraftPoint(null); }}>&times;</button>
            </header>

            <div style={{ height: '55vh', borderBottom: '1px solid #e2e8f0' }}>
              <MapContainer center={{ lat: selected.lat || DEFAULT_CENTER.lat, lng: selected.lng || DEFAULT_CENTER.lng }} zoom={16} style={{ height: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MarkerDragController
                  position={{ lat: draftPoint?.lat || selected.lat || DEFAULT_CENTER.lat, lng: draftPoint?.lng || selected.lng || DEFAULT_CENTER.lng }}
                  onChange={(pos) => setDraftPoint(pos)}
                />
              </MapContainer>
            </div>

            <div className="audit-toolbar" style={{ padding: '20px 30px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#475569', fontSize: '0.8rem' }}>
                <AlertTriangle size={18} color="#ea580c" />
                <span>Mueve el marcador al punto exacto. El estado en la tabla cambiará a OK al confirmar.</span>
              </div>
              <button 
                className="btn-primary" 
                style={{ 
                  width: 'auto', 
                  padding: '0.8rem 3rem', 
                  background: 'var(--primary-electric)', 
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(0, 88, 190, 0.3)'
                }} 
                onClick={confirmPointerLocation} 
                disabled={isConfirmingPoint}
              >
                {isConfirmingPoint ? 'GUARDANDO...' : 'CONFIRMAR Y CERRAR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeoreferenceModule;
