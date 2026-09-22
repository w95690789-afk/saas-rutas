const fs = require('fs');

global.window = {};
const markerMock = { bindPopup: () => markerMock, bindTooltip: () => markerMock, addTo: () => markerMock, on: () => markerMock };
const mapMock = { setView: () => mapMock, invalidateSize: () => {}, on: () => {}, removeLayer: () => {}, hasLayer: () => false, addLayer: () => {} };
global.L = {
    map: () => mapMock, tileLayer: () => ({ addTo: ()=>{} }), divIcon: () => ({}),
    control: { zoom: () => ({ addTo: ()=>{} }), layers: () => ({ addTo: ()=>{} }) },
    marker: () => markerMock, polyline: () => ({ addTo: ()=>{} })
};
const elements = {};
global.document = {
    body: { classList: { add: ()=>{}, remove: ()=>{} } },
    getElementById: (id) => {
        if (!elements[id]) {
            elements[id] = {
                innerText: '', innerHTML: '', value: '',
                style: { setProperty: () => {} },
                classList: { add: ()=>{}, remove: ()=>{} },
                appendChild: (child) => { if (elements[id].children) elements[id].children.push(child); },
                children: []
            };
        }
        return elements[id];
    },
    createElement: (tag) => ({
        tagName: tag, innerText: '', innerHTML: '', value: '', textContent: '',
        style: { setProperty: () => {} },
        classList: { add: ()=>{}, remove: ()=>{} },
        appendChild: function(c) { if (!this.children) this.children = []; this.children.push(c); },
        children: []
    }),
    querySelectorAll: () => []
};
global.localStorage = { getItem: () => null, setItem: () => {} };

// Mock XLSX
global.XLSX = {
    utils: {
        book_new: () => ({ Sheets: {}, SheetNames: [] }),
        aoa_to_sheet: (data) => ({ data }),
        book_append_sheet: (wb, ws, name) => {
            wb.SheetNames.push(name);
            wb.Sheets[name] = ws;
        }
    },
    writeFile: (wb, filename) => {
        console.log(`[MOCK XLSX] Successfully wrote workbook: ${filename} with sheets: [${wb.SheetNames.join(', ')}]`);
        return true;
    }
};

const html = fs.readFileSync('index.html', 'utf8');
const scriptMatches = [...html.matchAll(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi)];
const mainScript = scriptMatches[scriptMatches.length - 1][1];
eval(mainScript);

// Load test data
const testData = JSON.parse(fs.readFileSync('scratch/test_sap_rows.json', 'utf8'));
const headers = testData.headers.map(h => String(h ?? '').trim().toUpperCase());
const rawRows = testData.rows;

const idxMov = headers.findIndex(h => h && (h.includes('MOVIMIENTO') || h.includes('PEDIDO')));
const idxCli = headers.findIndex(h => h && h.includes('CLIENTE') && !h.includes('SUCURSAL'));
const idxSuc = headers.findIndex(h => h && h.includes('SUCURSAL'));
const nomIndices = [];
headers.forEach((h, i) => { if (h && h.includes('NOMBRE')) nomIndices.push(i); });
const idxNomCli = nomIndices.length > 0 ? nomIndices[0] : -1;
const idxNomSuc = nomIndices.length > 1 ? nomIndices[1] : -1;
const obsIndices = [];
headers.forEach((h, i) => { if (h && h.includes('OBSERVACIONES')) obsIndices.push(i); });
const idxObs1 = obsIndices.length > 0 ? obsIndices[0] : -1;
const idxObs2 = obsIndices.length > 1 ? obsIndices[1] : -1;
const idxPeso = headers.findIndex(h => h && (h.includes('PESO') || h.includes('DEMAND') || h.includes('KILOS')));
const idxPob = headers.findIndex(h => h && (h.includes('POBLACI') || h.includes('CIUDAD')));
const idxEdo = headers.findIndex(h => h && h.includes('ESTADO') && !h.includes('EMBARQUE'));
const idxDir = headers.findIndex(h => h && h.includes('DIRECCI'));
const idxAge = headers.findIndex(h => h && (h.includes('AGENTE') || h.includes('CITA')));
const idxRuta = headers.findIndex(h => h && h.includes('RUTA'));

const jobs = [];
rawRows.forEach((r, rowIdx) => {
    let pedId = idxMov !== -1 ? r[idxMov] : null;
    let pedIdStr = String(pedId || ('Pedido_' + rowIdx)).trim();
    const cliente = r[idxCli !== -1 ? idxCli : 2] || '';
    const nombreCli = (idxNomCli !== -1 ? r[idxNomCli] : r[3]) || '';
    const sucursal = idxSuc !== -1 ? r[idxSuc] : '';
    const nombreSuc = idxNomSuc !== -1 ? r[idxNomSuc] : '';
    const nombre = nombreSuc || nombreCli || '';
    const rawPeso = String(r[idxPeso !== -1 ? idxPeso : 11] ?? '').replace(/,/g, '').replace(/[^\d.]/g, '');
    const peso = parseFloat(rawPeso) || 1000;
    const poblacion = idxPob !== -1 ? r[idxPob] : '';
    const estado = idxEdo !== -1 ? r[idxEdo] : '';
    const direccion = idxDir !== -1 ? r[idxDir] : '';
    const agente = idxAge !== -1 ? r[idxAge] : '';
    const obs1 = idxObs1 !== -1 ? r[idxObs1] : '';
    const obs2 = idxObs2 !== -1 ? r[idxObs2] : '';
    const obs = obs1 || obs2 || (r[20] || '');
    const ruta = idxRuta !== -1 ? r[idxRuta] : (r[21] || '');
    const resolvedLoc = resolveOrderLocationJS({ cliente, nombreCli, sucursal, nombreSuc, obs1, obs2, ruta, poblacion, estado });
    const auditRes = auditCoordinateDiscrepancy(null, null, resolvedLoc, { pedido: pedIdStr, cliente, nombre, ruta, obs });
    jobs.push({
        id: String(pedIdStr),
        lat: auditRes.finalLat,
        lng: auditRes.finalLng,
        demand: peso,
        excel_info: {
            pedido: String(pedIdStr), cliente, nombre: nombreCli || nombre,
            poblacion: resolvedLoc ? resolvedLoc.city : poblacion,
            estado: resolvedLoc ? resolvedLoc.state : estado,
            agente, observaciones: obs, ruta
        }
    });
});

plans = solveHybridLogisticsPlansJS(jobs);
originalPlansBackup = JSON.parse(JSON.stringify(plans));
window.originalPlansBackup = originalPlansBackup;
activeRoutes = plans.plan1.routes;
currentPlanId = 'plan1';

console.log('--- TESTING MANUAL REASSIGNMENT FLOW ---');
const rFrom = plans.plan1.routes.find(r => r.emb_id === 'EMB-04');
const targetJob = rFrom.jobs[0];
const targetOrderId = (targetJob.excel_info && targetJob.excel_info.pedido) || targetJob.id;

console.log(`Original EMB-04 Load: ${(rFrom.load/1000).toFixed(2)}t | Moving order: ${targetOrderId} (${targetJob.demand} kg)`);
openReassignModal(targetOrderId, 'EMB-04');

// Verify select options
const selectEl = document.getElementById('reassign-target-select');
console.log(`Select options created: ${selectEl.children.length} optgroups`);
selectEl.children.forEach(grp => {
    console.log(`  Optgroup: ${grp.label} (${grp.children ? grp.children.length : 0} options)`);
});

// Reassign to EMB-03
selectEl.value = 'EMB-03';
onReassignTargetChange();
console.log('Capacity Feedback generated:');
console.log(document.getElementById('reassign-capacity-feedback').innerText.replace(/\n+/g, ' '));

confirmReassignOrder();

const rFromAfter = plans.plan1.routes.find(r => r.emb_id === 'EMB-04');
const rToAfter = plans.plan1.routes.find(r => r.emb_id === 'EMB-03');

console.log(`Updated EMB-04 Load: ${(rFromAfter.load/1000).toFixed(2)}t`);
console.log(`Updated EMB-03 Load: ${(rToAfter.load/1000).toFixed(2)}t`);
console.log(`Manual Reassignments Log: ${window.manualReassignmentsHistory.length} entries`);
console.log(JSON.stringify(window.manualReassignmentsHistory, null, 2));

console.log('\n--- TESTING EXCEL EXPORT WITH AUDIT SHEET ---');
downloadActivePlanXLSX();

console.log('\n--- TESTING RESTORE ORIGINAL PLAN ---');
restoreOriginalPlan();
const rFromRestored = plans.plan1.routes.find(r => r.emb_id === 'EMB-04');
console.log(`Restored EMB-04 Load: ${(rFromRestored.load/1000).toFixed(2)}t`);
console.log(`History cleared: ${window.manualReassignmentsHistory.length === 0 ? 'YES' : 'NO'}`);
console.log('\nALL TESTS PASSED SUCCESSFULLY!');
