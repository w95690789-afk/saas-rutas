# ALCANCE DEL PROYECTO: MÉXICO RUTAS (SaaS RUTAS)

Este documento define el alcance detallado del MVP de optimización de rutas, estructurado en dos vertientes: Logística (Operacional) y Técnica (Arquitectura).

---

## 1. ALCANCE LOGÍSTICO (ESPECIFICACIONES OPERATIVAS)

El enfoque principal es la transformación del modelo de ruteo empírico a un modelo algorítmico que maximice la eficiencia de transporte de granos.

### 1.1. Gestión de Flota y Capacidad
*   **Segmentación de Flota:** 
    *   **Propia (Prioritaria):** 3 Tractocamiones (30T) y ~20-25 Torton (16T).
    *   **Terceros (Variable):** ~25 unidades externas para cubrir excedentes de demanda.
*   **Regla de Negocio:** El sistema debe agotar la capacidad de la flota propia antes de sugerir el uso de permisionarios externos para minimizar costos fijos.

### 1.2. Restricciones de Operación en CEDI (Carga)
*   **Horarios de Carga:** Turno operativo de 06:00 AM a 03:00 PM.
*   **Tiempo de Carga Promedio:** 2 horas por unidad.
*   **Saturación de Andenes:** Restricción de carga simultánea de 5 a 10 unidades (valor a confirmar dinámicamente).

### 1.3. Restricciones de Entrega (Descarga)
*   **Ventanas de Tiempo:** 
    *   **Supermercados (Autoservicio):** Citas estrictas de descarga; requieren cumplimiento de ETA de ±15 min.
    *   **Mayoristas:** Restricciones horarias variables según sucursal.
*   **Penalizaciones:** Prevención de costos por estadía (Standby) en descarga mediante cumplimiento de citas.

### 1.4. Seguridad y "Convoyes"
*   **Escoltas Guardia Nacional:** Programación de rutas críticas para coincidir con las ventanas del convoy (ej. salidas fijas 10:00 AM).
*   **Priorización de Seguridad:** Posibilidad de forzar la carga de ciertos vehículos para cumplir horarios de seguridad nacional sobre la optimización de distancia.

### 1.5. Ventana de Planeación
*   **Objetivo:** Transición de planeación ad-hoc a una ventana de 24-48 horas.
*   **Corte de Pedidos:** 4:00 PM (Día Lunes) -> Carga (Día Martes) -> Entrega (Día Miércoles).

---

## 2. ALCANCE TÉCNICO (ARQUITECTURA Y DESARROLLO)

La solución técnica se concibe como una "Caja Negra" de optimización que consume datos de negocio y devuelve planes accionables.

### 2.1. Arquitectura de la Solución
*   **Modelo "Black Box Backend":** Desarrollo de un servicio en la nube (Supabase/Edge Functions) que encapsula la lógica de optimización.
*   **Motor de Optimización:** Integración con la API de **HERE Tour Planning** para la resolución de VRP (Vehicle Routing Problem).
*   **Parámetros de Ruta:** Uso de perfiles de camión ("Truck Profile") considerando restricciones físicas de vías en México.

### 2.2. Manejo de Datos e Integración
*   **Entrada (Input):**
    *   Procesamiento de archivos **Excel/CSV** exportados desde el ERP **Infofin**.
    *   **Mapeador Dinámico (ETL Inteligente):** Interfaz de configuración que permite al usuario mapear columnas de Infofin (ej. 'Peso2' -> 'demand') de forma visual, asegurando compatibilidad con cambios futuros en el ERP.
    *   Consolidación manual de pedidos de portales de clientes y vendedores.
*   **Georreferenciación:**
    *   Mapeo de direcciones mediante coordenadas Lat/Lng.
    *   Integración de datos históricos de monitoreo GPS para refinar los tiempos estimados de descarga por punto de entrega.

### 2.3. Lógica de Optimización Algorítmica
*   **Objetivos del Algoritmo:**
    1.  Minimizar unidades sin asignar (Unassigned Jobs).
    2.  Minimizar costos totales (Costo fijo + Kilometraje + Tiempo).
*   **Consideraciones de Tráfico:** Uso de tráfico histórico para el cálculo de ETAs, aplicando un "buffer" de seguridad para vehículos pesados (ej. 25-50 min extra en rutas largas).

### 2.4. Entregables y Salida (Output)
*   **Itinerarios Digitales:** Generación de un reporte (PDF/Excel) organizado por vehículo y secuencia de entrega.
*   **Soporte de Navegación Dual:** Inclusión de botones de navegación para **Google Maps** y **HERE WeGo** por cada parada.
*   **Visualización:** Representación de la ruta optimizada (Polilíneas) para validación del coordinador logístico.

### 2.5. Funcionalidades Esenciales de Interfaz (UI Dashboard)
*   **Visor de Datos Primarios:** Visualización del contenido del archivo cargado previo a su procesamiento para corrección rápida.
*   **Sidebar Detallada de Configuración:** Herramienta lateral para edición de variables del CEDI (Nombre, Lat/Lng, Horarios inicio/fin, Capacidad de andenes).
*   **Editor de Tiempos de Servicio:** Interfaz para definir minutos de carga en CEDI y descarga en cliente.
*   **Tablero de Análisis de Excepciones:** Diagnóstico detallado de pedidos no asignados con explicaciones técnicas (ej. capacidad) y logísticas (ej. ventanas de tiempo).
*   **Botón de Optimización Maestro:** Disparador del proceso de cálculo VRP.
*   **Centro de Decisiones:** Tablero principal con métricas de KPI (Costo/KM, Ocupación, Cumplimiento de Ventanas).

---

## 3. ALCANCE DE DISEÑO (ESTÉTICA Y UI/UX)

La plataforma SaaS se basará en el sistema de diseño **"Industrial Intelligence"** definido en [Stitch Project #8641819308944758806](https://stitch.withgoogle.com/projects/8641819308944758806).

### 3.1. Filosofía Visual: "The Precision Architect"
*   **Norte Creativo:** Alta sofisticación industrial que prioriza la claridad y autoridad editorial sobre el desorden utilitario.
*   **Tonalidad:** Uso de grandes espacios en blanco y jerarquía estricta para reducir el estrés en la toma de decisiones críticas.

### 3.2. Tokens de Diseño Principales
*   **Colores Core:** 
    *   Primario: `#031636` (Industrial Deep Blue) para estructuras y navegación.
    *   Secundario: `#0058be` (Interactivo Eléctrico) para acciones primarias y estados activos.
    *   Superficie: `#f7f9fb` (Gris Sofisticado) para fondos de descanso visual.
*   **Tipografía:** Familia **Inter** en pesos variables para títulos impactantes y legibilidad táctica en tablas de datos.
*   **Regla "No-Border":** Eliminación de líneas divisorias de 1px; separación visual mediante capas tonales de fondo.

### 3.3. Experiencia de Usuario (UX)
*   **Módulo de Carga Inteligente:** Interfaz optimizada para el procesamiento de archivos de **Infofin**.
*   **Visualización de Resultados:** Zebra striping en tablas y polilíneas de ruta integradas.
*   **UX para Conductor:** Diseño de itinerario PDF/Móvil con tipografía de alta legibilidad y botones de navegación directos.

---

## 4. RESUMEN DE ENTREGAS DEL PROYECTO (MVP)
1.  **Backend de Optimización** conectado a HERE API.
2.  **Interfaz SaaS de Alta Fidelidad** (Diseño Industrial Intelligence).
3.  **Cargador de Archivos Infofin** con validación de datos.
4.  **Generador de Itinerarios** dinámicos con Deep Links de Google Maps.

---
**Firma de Conformidad Técnica, Logística y de Diseño:**
*Equipo Antigravity / México Rutas 2026*
