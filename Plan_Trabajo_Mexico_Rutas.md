# Plan de Trabajo Detallado: México Rutas SaaS

Este documento establece las fases, tareas y dependencias para la construcción del MVP de optimización logística.

## Fase 1: Ingeniería de Datos y Mapeador (Semana 1)
*   **1.1 Mapeador Dinámico (UI)**: Desarrollo del componente de UI para arrastrar y soltar columnas de CSV (Interface "Industrial Identity").
*   **1.2 Lógica de Transformación (ETL)**: Motor en el backend que traduce plantillas de usuario a la estructura JSON requerida por HERE.
*   **1.3 Limpieza Automática**: Manejo de coordenadas `latLong` erróneas y agrupación de pesos por `EmbarqueMovMovID`.
*   **1.4 Persistencia**: Almacenamiento en Supabase de configuraciones de mapeo por usuario.

## Fase 2: Motor de Optimización Async (Semanas 1-2)
*   **2.1 Integración HERE API (Asíncrono)**: Implementación del flujo POST -> Polling -> GET para la resolución de optimización de nivel V3.
*   **2.2 Implementación basada en request.json**: Uso estricto del modelo de datos validado en el archivo maestro de configuración.
*   **2.2 Configuración de Constraints**: 
    *   Ventanas de tiempo (Carga: 6AM-3PM).
    *   Buffer de tráfico para carga pesada (25-50 min).
    *   Capacidad de flota híbrida (Propio/Terceros).
*   **2.3 Lógica de Convoyes**: Parámetro de "vínculo de flota" para asegurar que los camiones de una misma ruta viajen juntos (Seguridad Guardia Nacional).

## Fase 3: Interfaz "Industrial Intelligence" (Semanas 2-3)
*   **3.1 Dashboard de Control & KPI**: Centro de decisiones con métricas de ocupación y ahorro.
*   **3.2 Sidebar Táctica**: Desarrollo de la barra lateral para configuración de CEDI y tiempos de servicio.
*   **3.3 Monitor de Rutas & Itinerarios**: Tabla detallada con botones de navegación (GMaps/HERE) y generador de PDF.
*   **3.4 Tablero de Excepciones**: Módulo para visualizar por qué un pedido no fue asignado (Feedback Técnico/Logístico).
*   **3.5 Botón de Acción**: Implementación del disparador de optimización con feedback visual de progreso.

## Fase 4: DevOps & Calidad (Paralela)
*   **4.1 Pipeline de Despliegue**: Configuración de GitHub Actions para despliegue automático en Supabase/Edge Functions.
*   **4.2 Suite de Pruebas**: Validación unitaria del cálculo de peso y validación de integración con la API de HERE.

## Fase 5: Pruebas de Campo & Pilotaje (Semana 4)
*   **5.1 Test con Datos Reales**: Procesamiento del archivo `pedidos.csv` actual.
*   **5.2 Ajuste de Algoritmo**: Calibración de tiempos de descarga basados en la realidad operativa.
*   **5.3 Entrega Final**: Transferencia de propiedad y documentación técnica.

---
**Checkpoint de Validación**: Cada fase termina con una revisión por parte del usuario antes de avanzar.
