
import sys

path = "/home/wilsonpintogaona/Documentos/Proyectos/Saas Rutas/mexico-rutas-app/src/components/LogisticAnalyst.jsx"
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_itinerary_code = """      const itinerary = stops.map((stop, index) => {
        const isDepot = index === 0 || index === stops.length - 1;
        const activities = stop.activities || [];
        const deliveries = activities.filter(a => a.type === 'delivery');
        const reloads = activities.filter(a => a.type === 'reload');
        const breaks = activities.filter(a => a.type === 'break' || a.type === 'rest');
        
        if (reloads.length > 0) {
          currentCycle++;
          cycleLoad = 0;
        }
        if (index === 0) cycleLoad = 0;

        let clientName = 'CEDI', address = '', isGrouped = false, isMultiClient = false, totalOrdersInStop = 0, stopWeight = 0;

        if (deliveries.length > 0) {
          deliveryIndex++;
          const allOrders = deliveries.flatMap(d => jobToOrdersMap[d.jobId] || []);
          totalOrdersInStop = allOrders.length;
          isGrouped = totalOrdersInStop > 1;
          stopWeight = deliveries.reduce((acc, d) => acc + (jobWeightMap[d.jobId] || 0), 0);
          cycleLoad += stopWeight;
          const clientEntities = new Set(allOrders.map(o => {
            const code = (o[mapping.clientCode] || o['Cliente'] || '').toString().trim();
            const name = (o[mapping.client] || o['Nombre'] || '').toString().trim();
            return `${code}|${name}`;
          }).filter(s => s !== '|'));
          isMultiClient = clientEntities.size > 1;
          const firstOrder = allOrders[0] || {};
          clientName = (firstOrder[mapping.clientCode] || firstOrder[mapping.client] || firstOrder['Cliente'] || 'Cliente S/N').toString().trim();
          address = firstOrder[mapping.address] || '';
        }

        const stopLabel = index === 0 ? 'Salida CEDI' : 
                          index === stops.length - 1 ? 'Retorno Final CEDI' : 
                          reloads.length > 0 ? 'Recarga en CEDI' : 
                          (breaks.length > 0 && deliveries.length === 0) ? '☕ Descanso / Pausa' :
                          isMultiClient ? `Parada Multi-cliente (${totalOrdersInStop} pedidos)` :
                          isGrouped ? `${clientName} (${totalOrdersInStop} pedidos)` : clientName;

        // --- RECALIBRACIÓN SOBERANA ---
        const originalArrival = normalizeToMs(getStopArrival(stop));
        const originalDeparture = normalizeToMs(getStopDeparture(stop));
        
        let transitMs = 0;
        if (index > 0) {
          const prevStopRaw = stops[index - 1];
          const prevDepRaw = normalizeToMs(getStopDeparture(prevStopRaw));
          if (prevDepRaw && originalArrival) transitMs = Math.max(0, originalArrival - prevDepRaw);
        }

        let arrivalMs, departureMs;
        if (index === 0) {
          const baseDate = new Date(originalArrival || Date.now());
          baseDate.setUTCHours(cOpeningHour, 0, 0, 0);
          arrivalMs = baseDate.getTime();
          departureMs = arrivalMs + (cLoadDurationMin * 60000);
          stop._shiftedDeparture = departureMs;
        } else {
          const prevShiftedDep = stops[index - 1]._shiftedDeparture;
          arrivalMs = (prevShiftedDep || 0) + transitMs;
          let serviceMsRaw = Math.max(0, originalDeparture - originalArrival);
          if (reloads.length > 0) serviceMsRaw = Math.max(serviceMsRaw, cLoadDurationMin * 60000);
          departureMs = arrivalMs + serviceMsRaw;
          stop._shiftedDeparture = departureMs;
        }

        let waitMs = 0, serviceMs = 0, breakMs = 0;
        const shiftOffset = arrivalMs - originalArrival;
        
        const stopSegments = [];
        if (arrivalMs && departureMs) {
          let lastTime = arrivalMs;
          const sortedActivities = activities
            .map(act => {
              const s = normalizeToMs(act.time?.start || act.startTime || act.time?.arrival || act.arrival?.time);
              const e = normalizeToMs(act.time?.end || act.endTime || act.time?.departure || act.departure?.time);
              return { ...act, start: s + shiftOffset, end: e + shiftOffset };
            })
            .filter(act => act.start && act.end)
            .sort((a, b) => a.start - b.start);

          sortedActivities.forEach((act) => {
            if (act.start > lastTime + 60000) {
              stopSegments.push({ type: 'wait', start: lastTime, end: act.start, label: 'Espera en Sitio' });
            }
            stopSegments.push({
              type: (act.type === 'rest' || act.type === 'break') ? (index === 0 ? 'depot' : 'break') : (act.type === 'reload' ? 'reload' : act.type),
              start: act.start,
              end: act.end,
              label: index === 0 && (act.type === 'break' || act.type === 'rest') ? 'Carga Inicial CEDI' :
                     act.type === 'delivery' ? 'Operación de Entrega' : 
                     act.type === 'reload' ? 'Operación de Recarga' : 
                     act.type === 'break' || act.type === 'rest' ? 'Descanso Reglamentario' : stopLabel,
              jobId: act.jobId
            });
            lastTime = act.end;
            if (act.type === 'delivery' || act.type === 'reload') serviceMs += (act.end - act.start);
            if (act.type === 'break' || act.type === 'rest') breakMs += (act.end - act.start);
          });
          
          if (departureMs > lastTime + 60000) {
            stopSegments.push({ type: 'wait', start: lastTime, end: departureMs, label: 'Espera / Preparación Salida' });
          }
          if (stopSegments.length === 0) {
            stopSegments.push({
              type: isDepot ? 'depot' : reloads.length > 0 ? 'reload' : (breaks.length > 0 && deliveries.length === 0) ? 'break' : 'delivery',
              start: arrivalMs, end: departureMs, label: stopLabel
            });
            serviceMs = departureMs - arrivalMs;
          }
          waitMs = Math.max(0, (departureMs - arrivalMs) - serviceMs - breakMs);
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
          cycleLoadAtStart: cycleLoad - stopWeight,
          cycleLoadAtEnd: cycleLoad,
          stopWeight,
          type: isDepot ? 'depot' : reloads.length > 0 ? 'reload' : (breaks.length > 0 && deliveries.length === 0) ? 'break' : 'delivery',
          location: stop.location,
          arrival: arrivalMs ? new Date(arrivalMs) : null,
          departure: departureMs ? new Date(departureMs) : null,
          waitMin: waitMs / 60000,
          serviceMin: serviceMs / 60000,
          breakMin: breakMs / 60000,
          segments: stopSegments,
          breakDetails: breaks.map(act => {
            const s = normalizeToMs(act.time?.start || act.startTime || act.time?.arrival || act.arrival?.time);
            const e = normalizeToMs(act.time?.end || act.endTime || act.time?.departure || act.departure?.time);
            return { start: s + shiftOffset, end: e + shiftOffset };
          }),
          jobs: deliveries.map(d => ({ jobId: d.jobId, orders: jobToOrdersMap[d.jobId] || [] }))
        };
      });"""

# We want to replace lines 306 to 528 (1-indexed)
start_line = 306 - 1
end_line = 528

new_lines = lines[:start_line] + [new_itinerary_code + "\\n"] + lines[end_line:]

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
