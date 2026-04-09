# ACTA DE REUNIÓN: SESIÓN INICIAL DE PLANEACIÓN LOGÍSTICA
**PROYECTO:** Optimización de Red Logística "México Rutas"
**FECHA:** 17 de Marzo de 2026
**UBICACIÓN:** Virtual (Teams/Tips)
**PARTICIPANTES:**
- Froylan Campos (Líder del Proyecto / Product Owner)
- Wilson Pinto (Arquitecto de Soluciones / CTO)
- Enrique (Equipo de Operaciones)
- Lourdes (Equipo de Finanzas)

---

## 1. OBJETIVO DE LA REUNIÓN
Definir los requerimientos iniciales para el desarrollo de un modelo de optimización de rutas transitorio (MVP) para una empresa distribuidora de granos, con el fin de reducir costos operativos y mejorar el rendimiento por kilómetro.

## 2. CONTEXTO DEL NEGOCIO
- **Producto:** Empaque y distribución de granos a mayoristas y autoservicios.
- **Flota Operativa:**
  - 3 Tractocamiones (30T).
  - 20-25 Torton (16T) propios.
  - ~25 Unidades de externos/permisionarios (Capacidad variable).
  - Total: ~50 vehículos disponibles.
- **Volumen Mensual:** ~4,500 viajes.
- **Alcance Geográfico:** 47 rutas principales con aproximadamente 500 puntos de entrega totales.

## 3. PUNTOS CLAVE DISCUTIDOS
### 3.1. Proceso de Carga y Descarga
- **Carga:** Se realiza en un turno (6:00 AM a 3:00 PM). El tiempo promedio de carga es de 2 horas.
- **Descarga:** Restricciones de citas/ventanas en autoservicios y algunos mayoristas. Penalizaciones por estadía solo aplican en la descarga.
- **Capacidad de Andenes:** Se requiere validación de cuántos camiones pueden cargar simultáneamente (estimado: 5-10 según equipo).

### 3.2. Ventana de Planeación
- **Actual:** 50% de pedidos se programan 24h antes, 50% durante la operación (Inyecta ineficiencia).
- **Ideal:** Corte de pedidos a las 4:00 PM (Día Lunes) para cargar Día Martes y entregar Día Miércoles (Separación de 24h completa).

### 3.3. Restricciones de Seguridad
- Existencia de "Convoyes" escoltados por la Guardia Nacional en rutas críticas con horarios de salida fijos (Ej: 10:00 AM). La carga debe estar lista para no perder la escolta.

### 3.4. Infraestructura de Datos
- **Fuente:** ERP Infosys. Los datos llegan de portales de autoservicio, vendedores y manuales, consolidándose en Excel.
- **Georreferenciación:** Actualmente basada en Google Maps (Monitoreo histórico disponible).

## 4. ACUERDOS TÉCNICOS (SOLUCIÓN PROPUESTA)
1. **Modelo "Caja Negra":** Desarrollo de un Backend que consuma Excels de pedidos/vehículos y devuelva itinerarios optimizados.
2. **Entregables:** El sistema generará archivos Excel/PDF con links de navegación (Google Maps) integrados para los conductores.
3. **Optimización:** Priorizar el uso de flota propia antes que terceros.

## 5. ACCIONES PENDIENTES (ACTION ITEMS)
- [ ] Validar capacidad máxima de carga simultánea en CEDI.
- [ ] Mapeo de columnas del archivo de exportación de Infosys.
- [ ] Definir catálogo de prioridades dinámicas (Seguridad vs. ETA).

---
**Firma de Conformidad:**
*Equipo Will-Master-Protocol / México Rutas*
