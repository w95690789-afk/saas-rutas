import os
import sys

def ddo_hybrid_boot():
    print("-" * 50)
    print("\033[96m[DDO HYBRID LINKER] Activando Puente de Soberanía...\033[0m")
    
    # 1. Validación de Bóveda Cloud (.env)
    if not os.path.exists(".env"):
        print("\033[91m[ERROR] No se encontró el archivo .env. Copia el archivo .env desde DDO_MASTER_CORE.\033[0m")
        sys.exit(1)
        
    # 2. Protección de RAM (8GB Shield)
    # Buscamos si hay carpetas masivas de skills que deban ignorarse
    massive_folders = [".agent/skills", "legacy_skills", "archive"]
    for folder in massive_folders:
        if os.path.exists(folder):
            print(f"\033[93m[AVISO] Detectada carpeta pesada: {folder}. El modo híbrido la ignorará para ahorrar RAM.\033[0m")

    # 3. Conexión con Supabase BaaS
    supabase_url = os.environ.get("SUPABASE_URL")
    if supabase_url:
        print(f"\033[92m[EXITO] Enlace Cloud detectado en: {supabase_url[:15]}...\033[0m")
    else:
        print("\033[93m[AVISO] Trabajando en modo local-solo. Para BaaS, configura el .env.\033[0m")

    print("\033[94m[MODO HÍBRIDO]: ACTIVO\033[0m")
    print("-" * 50)
    print("Misión: 'Usa la inteligencia de la nube, no el peso del disco'.")

if __name__ == "__main__":
    ddo_hybrid_boot()
