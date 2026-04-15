# Script de Inicio Automático para Antigravity
# Este script levanta el servidor de desarrollo Vite para el proyecto Saas Rutas

Write-Host "🚀 Antigravity activando motor logístico..." -ForegroundColor Cyan

$projectPath = "c:\Users\Familiatrabajo\OneDrive\Documentos\Saas Rutas\mexico-rutas-app"
if (Test-Path $projectPath) {
    Set-Location $projectPath
    Write-Host "✅ Carpeta localizada. Iniciando servidor..." -ForegroundColor Green
    npm run dev
} else {
    Write-Host "❌ Error: No se encontró la carpeta del proyecto en $projectPath" -ForegroundColor Red
}
