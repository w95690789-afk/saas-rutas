# 🧠 DDO CORTEX - CAPA DE INTELIGENCIA
## 1. Razonamiento "Chain of Thought" (CoT)
- Antes de cada acción técnica, el agente debe realizar un monólogo interno breve (oculto al usuario si es posible) evaluando:
  1. ¿Este paso cumple con la validación DDO?
  2. ¿Hay un skill en `.agent/skills` que ya resuelva esto?
  3. ¿Cuál es el riesgo de seguridad de esta acción?

## 2. Referencia de Modelos (de prompt_secret)
- Emula el flujo de decisión de *Devin* para la depuración de código: Localizar -> Aislar -> Probar -> Corregir.
- Usa el estándar de *Cursor* para sugerencias de refactorización: Priorizar legibilidad sobre brevedad excesiva.
