import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const fileXlsx = '/home/wilsonpintogaona/Documentos/Proyectos/Saas Rutas/PRUEBA a.xlsx';
const outputFile = '/home/wilsonpintogaona/Documentos/Proyectos/Saas Rutas/mexico-rutas-app/scratch/prueba_a.json';

function excelDateToStr(serial) {
  if (serial === undefined || serial === null) return '';
  if (isNaN(serial)) return serial.toString().trim();
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${d}/${m}/${y}`;
}

function preprocess() {
  if (!fs.existsSync(fileXlsx)) {
    console.error(`Excel file not found: ${fileXlsx}`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(fileXlsx);
  const worksheet = workbook.Sheets['Hoja1'];
  const excelData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const excelHeaders = excelData[0];
  const excelRows = excelData.slice(1);

  const getColIdx = (name) => excelHeaders.indexOf(name);
  const getColIndices = (name) => {
    const indices = [];
    excelHeaders.forEach((h, i) => {
      if (h === name) indices.push(i);
    });
    return indices;
  };

  const movIdx = getColIdx('Movimiento');
  const clientIdx = getColIdx('Cliente');
  
  const nameIndices = getColIndices('Nombre');
  const nameIdx = nameIndices[0] !== undefined ? nameIndices[0] : getColIdx('Nombre');
  const sucursalIdx = getColIdx('Sucursal Cliente') !== -1 ? getColIdx('Sucursal Cliente') : getColIdx('Sucursal');
  const addressIdx = getColIdx('Dirección');
  const cpIdx = getColIdx('Código Postal');
  const popIdx = getColIdx('Población');
  const stateIdx = getColIdx('Estado');
  const delegacionIdx = getColIdx('Delegación');
  const coloniaIdx = getColIdx('Colonia');
  const almacenIdx = getColIdx('Almacén');
  const fechaEmisionIdx = getColIdx('Fecha Emisión');
  const fechaRequeridaIdx = getColIdx('Fecha Requerida');
  const agenteIdx = getColIdx('Agente');
  const usuarioIdx = getColIdx('Usuario');
  const importeTotalIdx = getColIdx('Importe Total');
  const condicionesIdx = getColIdx('Condiciones');
  const rutaIdx = getColIdx('Ruta');
  const estatusIdx = getColIdx('Estatus');
  
  const obsIndices = getColIndices('Observaciones');

  const validRows = excelRows.filter(r => r[movIdx] !== undefined && r[movIdx] !== null && r[movIdx].toString().trim() !== '');

  const records = validRows.map(row => {
    // Gather and merge observations
    const obsList = [];
    obsIndices.forEach(idx => {
      if (row[idx] !== undefined && row[idx] !== null) {
        const val = row[idx].toString().trim();
        if (val !== '') obsList.push(val);
      }
    });
    const observations = obsList.join(' | ');

    return {
      pedido: row[movIdx] ? row[movIdx].toString().trim() : '',
      cliente: row[clientIdx] ? row[clientIdx].toString().trim() : '',
      nombre: row[nameIdx] ? row[nameIdx].toString().trim() : '',
      sucursal: row[sucursalIdx] ? row[sucursalIdx].toString().trim() : '',
      direccion: row[addressIdx] ? row[addressIdx].toString().trim() : '',
      cp: row[cpIdx] ? row[cpIdx].toString().trim() : '',
      poblacion: row[popIdx] ? row[popIdx].toString().trim() : '',
      estado: row[stateIdx] ? row[stateIdx].toString().trim() : '',
      delegacion: row[delegacionIdx] ? row[delegacionIdx].toString().trim() : '',
      colonia: row[coloniaIdx] ? row[coloniaIdx].toString().trim() : '',
      almacen: row[almacenIdx] ? row[almacenIdx].toString().trim() : '',
      fecha_emision: excelDateToStr(row[fechaEmisionIdx]),
      fecha_requerida: excelDateToStr(row[fechaRequeridaIdx]),
      agente: row[agenteIdx] ? row[agenteIdx].toString().trim() : '',
      usuario: row[usuarioIdx] ? row[usuarioIdx].toString().trim() : '',
      importe_total: row[importeTotalIdx] !== undefined ? row[importeTotalIdx] : 0,
      condiciones: row[condicionesIdx] ? row[condicionesIdx].toString().trim() : '',
      ruta: row[rutaIdx] ? row[rutaIdx].toString().trim() : '',
      estatus: row[estatusIdx] ? row[estatusIdx].toString().trim() : '',
      observaciones: observations
    };
  });

  fs.writeFileSync(outputFile, JSON.stringify(records, null, 2), 'utf-8');
  console.log(`Preprocessed ${records.length} Excel rows to ${outputFile}`);
}

preprocess();
