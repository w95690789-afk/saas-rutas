import React, { useMemo, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Upload, Plus, MapPin, AlertTriangle, CheckCircle2, Target, FileDown, LocateFixed
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

  // Fallback para respuestas que no incluyen scoring (común en reverse geocode)
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
  const [customCenter, setCustomCenter] = useState(DEFAULT_CENTER);
  const [useCustomCenter, setUseCustomCenter] = useState(false);

  const normalizeRecord = (raw, idx) => {
    const address = raw.address || raw.direccion || raw.dirección || raw.street || raw.calle || '';
    const city = raw.city || raw.ciudad || raw.municipio || '';
    const state = raw.state || raw.estado || raw.provincia || '';
    const postalCode = raw.postalCode || raw.cp || raw.codigo_postal || raw['código_postal'] || '';
    const country = raw.country || raw.pais || raw.país || 'MX';
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
    if (ext === 'csv' || ext === 'txt') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const parsed = (res.data || []).map((row, i) => normalizeRecord(row, i)).filter(r => r.fullAddress);
          setRows(prev => [...prev, ...parsed]);
        }
      });
      return;
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const parsed = data.map((row, i) => normalizeRecord(row, i)).filter(r => r.fullAddress);
      setRows(prev => [...prev, ...parsed]);
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
      ...quality
    };
  };

  const runGeocoding = async () => {
    if (!rows.length) return;
    setIsProcessing(true);
    try {
      const pending = rows.filter(r => !r.geocoded);
      const processed = [];
      for (const rec of pending) {
        // Secuencial para proteger cuota API y facilitar trazabilidad
        // eslint-disable-next-line no-await-in-loop
        processed.push(await geocodeOne(rec));
      }
      setRows(prev => prev.map(r => processed.find(p => p.id === r.id) || r));
    } catch (err) {
      console.error('Geocoding error:', err);
      alert(`Error al georreferenciar: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
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
    const medias = rows.filter(r => r.exactitud === 'Media').length;
    const bajas = rows.filter(r => r.exactitud === 'Baja' || r.exactitud === 'No confiable').length;
    const critico = rows.filter(r => r.riesgo === 'Critico').length;
    const alto = rows.filter(r => r.riesgo === 'Alto').length;
    const unresolved = rows.filter(r => r.geocoded && (!r.lat || !r.lng)).length;
    const avgScore = done ? Math.round(rows.filter(r => r.geocoded).reduce((acc, r) => acc + (r.score || 0), 0) / done) : 0;
    return { total, done, exactas, medias, bajas, critico, alto, unresolved, avgScore };
  }, [rows]);

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
        resolucion: r.resolucion,
        ajusteManual: r.manualAdjusted,
        estadoGeocoder: r.geocodeStatus,
        errorGeocoder: r.geocodeError || ''
      }))
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `informe_georreferenciacion_${Date.now()}.json`;
    a.click();
  };

  const geocodeSingle = async (recordId) => {
    const target = rows.find(r => r.id === recordId);
    if (!target) return;
    setRows(prev => prev.map(r => (r.id === recordId ? { ...r, geocodeStatus: 'procesando', geocodeError: '' } : r)));
    try {
      const processed = await geocodeOne(target);
      setRows(prev => prev.map(r => (r.id === recordId ? {
        ...processed,
        geocodeStatus: processed.lat && processed.lng ? 'ok' : 'error',
        geocodeError: processed.lat && processed.lng ? '' : 'Sin coordenadas devueltas por geocoder',
        geocodedAt: new Date().toISOString()
      } : r)));
    } catch (err) {
      setRows(prev => prev.map(r => (r.id === recordId ? {
        ...r,
        geocodeStatus: 'error',
        geocodeError: err.message || 'Fallo en geocoder'
      } : r)));
    }
  };

  const openMap = (record) => {
    const center = useCustomCenter
      ? customCenter
      : record?.lat && record?.lng
        ? { lat: record.lat, lng: record.lng }
        : record?.mapView
          ? { lat: (record.mapView.north + record.mapView.south) / 2, lng: (record.mapView.east + record.mapView.west) / 2 }
          : mapCenter;
    setMapCenter(center);
    setSelected({ ...record });
    setDraftPoint({
      lat: record?.lat || center.lat,
      lng: record?.lng || center.lng
    });
  };

  const confirmPointerLocation = async () => {
    if (!selected || !draftPoint) return;
    setIsConfirmingPoint(true);
    try {
      const reverseUrl = `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${draftPoint.lat},${draftPoint.lng}&lang=es-MX&apiKey=${apiKey}`;
      const res = await fetch(reverseUrl);
      const payload = await res.json();
      const reverseItem = payload.items?.[0] || null;
      const resolvedLabel = reverseItem?.address?.label || reverseItem?.title || selected.providerLabel || selected.fullAddress;

      const updated = {
        ...selected,
        lat: draftPoint.lat,
        lng: draftPoint.lng,
        providerLabel: resolvedLabel,
        mapView: reverseItem?.mapView || selected.mapView,
        manualAdjusted: true,
        geocoded: true,
        ...computeQuality(reverseItem),
        geocodeStatus: 'ok',
        geocodeError: '',
        geocodedAt: new Date().toISOString()
      };

      setRows(prev => prev.map(r => (r.id === selected.id ? updated : r)));
      setSelected(updated);
    } catch (err) {
      setRows(prev => prev.map(r => (r.id === selected.id ? {
        ...r,
        geocodeStatus: 'error',
        geocodeError: err.message || 'Fallo reverse geocoder'
      } : r)));
      alert(`No se pudo confirmar la ubicación con reverse geocoder: ${err.message}`);
    } finally {
      setIsConfirmingPoint(false);
    }
  };

  const saveMapAdjust = () => {
    if (!selected) return;
    setSelected(null);
    setDraftPoint(null);
  };

  return (
    <div className="strategic-dashboard animate-fade-in" style={{ marginTop: 0 }}>
      <div className="strategic-header" style={{ marginBottom: '1.2rem' }}>
        <div className="title-block">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <LocateFixed size={24} color="var(--primary-electric)" />
            <h2 style={{ margin: 0 }}>Modulo de Georreferenciacion</h2>
          </div>
          <p>Carga masiva o manual, scoring experto de exactitud, riesgo y correccion cartografica asistida.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-secondary-dark" onClick={runGeocoding} disabled={isProcessing || !rows.length}>
            {isProcessing ? 'Georreferenciando pendientes...' : `Geocodificar pendientes (${rows.filter(r => !r.geocoded || r.geocodeStatus === 'error').length})`}
          </button>
          <button className="btn-primary" onClick={exportReport} disabled={!rows.length} style={{ width: 'auto', padding: '0.75rem 1rem' }}>
            <FileDown size={16} style={{ marginRight: 8 }} />
            Exportar informe externo
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '14px', marginBottom: '14px' }}>
        <div className="nav-card" style={{ padding: '14px' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Carga de Direcciones</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label className="btn-secondary-dark" style={{ cursor: 'pointer' }}>
              <Upload size={14} style={{ marginRight: 6 }} />
              Archivo plano / Excel
              <input
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])}
              />
            </label>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Soporta CSV, TXT, XLSX y XLS</span>
          </div>
          <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 0.8fr 0.7fr auto', gap: '8px' }}>
            <input placeholder="Dirección completa" value={manual.address} onChange={(e) => setManual({ ...manual, address: e.target.value })} />
            <input placeholder="Ciudad / Municipio" value={manual.city} onChange={(e) => setManual({ ...manual, city: e.target.value })} />
            <input placeholder="Estado / Provincia" value={manual.state} onChange={(e) => setManual({ ...manual, state: e.target.value })} />
            <input placeholder="CP" value={manual.postalCode} onChange={(e) => setManual({ ...manual, postalCode: e.target.value })} />
            <input placeholder="País" value={manual.country} onChange={(e) => setManual({ ...manual, country: e.target.value })} />
            <button className="btn-mini" onClick={addManual}><Plus size={14} />Agregar fila</button>
          </div>
        </div>

        <div className="nav-card" style={{ padding: '14px', display: 'grid', gap: '10px' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Estadistica experta</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
            <div><small>Total</small><div><strong>{stats.total}</strong></div></div>
            <div><small>Procesadas</small><div><strong>{stats.done}</strong></div></div>
            <div><small>Score prom.</small><div><strong>{stats.avgScore}</strong></div></div>
            <div><small>Exactas/Altas</small><div style={{ color: '#16a34a' }}><strong>{stats.exactas}</strong></div></div>
            <div><small>Riesgo Alto</small><div style={{ color: '#ea580c' }}><strong>{stats.alto}</strong></div></div>
            <div><small>Riesgo Critico</small><div style={{ color: '#dc2626' }}><strong>{stats.critico}</strong></div></div>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#475569', display: 'grid', gap: 4 }}>
            <span><strong>Consumo de API geocoder:</strong> se ejecuta al dar click en "Geocodificar pendientes" o en "Geocodificar fila".</span>
            <span><strong>Consumo de reverse geocoder:</strong> solo se ejecuta al confirmar en el modal (no durante el drag/click).</span>
          </div>
          <div style={{ background: 'rgba(2,132,199,0.06)', border: '1px solid rgba(2,132,199,0.2)', borderRadius: 10, padding: '10px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px' }}>Cómo interpretamos la exactitud</div>
            <div style={{ fontSize: '0.72rem', color: '#475569', lineHeight: 1.45 }}>
              <strong>Exacta/Alta</strong>: alta coincidencia entre texto y punto del geocoder.<br />
              <strong>Media</strong>: dirección parcialmente resuelta; requiere validación operativa.<br />
              <strong>Baja/No confiable</strong>: bajo match; se recomienda corrección manual en mapa.<br />
              El riesgo aumenta cuando el score baja o falta nivel calle/número.
            </div>
          </div>
        </div>
      </div>

      <div className="nav-card" style={{ padding: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong>Informe operativo de georreferenciacion</strong>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
            API recomendada: HERE Geocoding & Search v1 (`/geocode`)
          </span>
        </div>
        <div style={{ maxHeight: '360px', overflow: 'auto' }}>
          <table className="industrial-table">
            <thead>
              <tr>
                <th>Direccion</th>
                <th>Resultado geocoder</th>
                <th>Exactitud</th>
                <th>Score</th>
                <th>Riesgo</th>
                <th>Estado API</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.fullAddress}</td>
                  <td>{r.providerLabel || '-'}</td>
                  <td>{r.exactitud}</td>
                  <td>{r.score || 0}</td>
                  <td>
                    <span style={{
                      color: r.riesgo === 'Critico' ? '#dc2626' : r.riesgo === 'Alto' ? '#ea580c' : '#16a34a',
                      fontWeight: 700
                    }}>
                      {r.riesgo}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      fontWeight: 700,
                      color:
                        r.geocodeStatus === 'ok' ? '#16a34a' :
                          r.geocodeStatus === 'procesando' ? '#2563eb' :
                            r.geocodeStatus === 'error' ? '#dc2626' : '#64748b'
                    }}>
                      {r.geocodeStatus === 'ok' ? 'OK' :
                        r.geocodeStatus === 'procesando' ? 'Procesando' :
                          r.geocodeStatus === 'error' ? 'Error' : 'Pendiente'}
                    </span>
                    {r.geocodeError && (
                      <div style={{ fontSize: '0.66rem', color: '#dc2626', marginTop: 3, maxWidth: 180 }}>
                        {r.geocodeError}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn-mini" onClick={() => geocodeSingle(r.id)} disabled={r.geocodeStatus === 'procesando'}>
                        Geocodificar fila
                      </button>
                      {(r.riesgo === 'Critico' || !r.lat || !r.lng || r.riesgo === 'Alto' || r.exactitud === 'Baja') ? (
                        <button className="btn-mini" onClick={() => openMap(r)}>
                          <MapPin size={13} />
                          Revisar en mapa
                        </button>
                      ) : (
                        <span style={{ color: '#16a34a', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center' }}>
                          <CheckCircle2 size={13} style={{ marginRight: 4 }} />
                          OK
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="audit-overlay">
          <div className="audit-modal" style={{ width: '92vw', maxWidth: 1100 }}>
            <header className="audit-header">
              <div className="audit-title-group">
                <div className="audit-icon-box"><Target size={18} /></div>
                <div>
                  <h3>Ajuste Cartografico Asistido</h3>
                  <p>{selected.fullAddress}</p>
                </div>
              </div>
              <button className="close-btn" onClick={() => { setSelected(null); setDraftPoint(null); }}>&times;</button>
            </header>

            <div style={{ display: 'flex', gap: '10px', padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
                <input type="checkbox" checked={useCustomCenter} onChange={(e) => setUseCustomCenter(e.target.checked)} />
                Centro personalizado
              </label>
              <input type="number" step="0.0001" value={customCenter.lat} onChange={(e) => setCustomCenter({ ...customCenter, lat: parseFloat(e.target.value || 0) })} />
              <input type="number" step="0.0001" value={customCenter.lng} onChange={(e) => setCustomCenter({ ...customCenter, lng: parseFloat(e.target.value || 0) })} />
              <button className="btn-mini" onClick={() => setMapCenter(useCustomCenter ? customCenter : (selected.lat && selected.lng ? { lat: selected.lat, lng: selected.lng } : DEFAULT_CENTER))}>
                Centrar mapa
              </button>
            </div>

            <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#475569', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>Punto seleccionado: <strong>{draftPoint?.lat?.toFixed(6)}, {draftPoint?.lng?.toFixed(6)}</strong></span>
              <span>1) Ajusta el marcador 2) Confirma ubicación 3) Guarda y cierra</span>
            </div>

            <div style={{ height: '58vh' }}>
              <MapContainer
                center={mapCenter}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
                key={`${mapCenter.lat}-${mapCenter.lng}-${selected.id}`}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MarkerDragController
                  position={{
                    lat: draftPoint?.lat || selected.lat || mapCenter.lat,
                    lng: draftPoint?.lng || selected.lng || mapCenter.lng
                  }}
                  onChange={(pos) => setDraftPoint(pos)}
                />
              </MapContainer>
            </div>

            <div className="audit-toolbar" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                <AlertTriangle size={14} style={{ marginRight: 5 }} />
                Arrastra el marcador o haz click en el mapa para corregir la ubicacion.
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn-secondary-dark"
                  style={{ width: 'auto', padding: '0.6rem 1rem' }}
                  disabled={isConfirmingPoint || !draftPoint}
                  onClick={confirmPointerLocation}
                >
                  {isConfirmingPoint ? 'Confirmando...' : 'Confirmar ubicación'}
                </button>
                <button className="btn-primary" style={{ width: 'auto', padding: '0.6rem 1rem' }} onClick={saveMapAdjust}>
                  Guardar y cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeoreferenceModule;
