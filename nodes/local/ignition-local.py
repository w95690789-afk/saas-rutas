import os
import sys

def ddo_print(msg, type="INFO"):
    colors = {"INFO": "\033[94m", "SUCCESS": "\033[92m", "WARNING": "\033[93m", "ERROR": "\033[91m", "END": "\033[0m"}
    print(f"{colors.get(type, '')}[DDO {type}]{colors['END']} {msg}")

def bootstrap():
    ddo_print("Iniciando Fase Pre-0: Ignición Local...", "INFO")
    
    # 1. Verificar .env
    if not os.path.exists(".env"):
        ddo_print(".env no encontrado. Buscando .env.example...", "WARNING")
        if os.path.exists(".env.example"):
            os.rename(".env.example", ".env")
            ddo_print(".env restaurado desde .env.example.", "SUCCESS")
        else:
            ddo_print("Error Fatal: No se encontró .env ni .env.example.", "ERROR")
            sys.exit(1)
            
    # 2. Cargar Protocolo
    if os.path.exists("DDO_MASTER_ULTIMATE.md"):
        ddo_print("Protocolo V4.0 Cargado.", "SUCCESS")
    else:
        ddo_print("Advertencia: No se encontró el protocolo maestro en la raíz.", "WARNING")

    ddo_print("Soberanía Técnica Activa. Nodo Local listo para operar.", "SUCCESS")

def main():
    bootstrap()
    print("-" * 50)
    task = input("\033[96m[DDO] ¿Cuál es la misión de hoy? > \033[0m")
    print("-" * 50)
    ddo_print(f"Misión recibida: '{task}'", "INFO")
    ddo_print("Activando Capa CORTEX para razonamiento...", "INFO")
    # Aquí iría el puente de ejecución con la IA
    print("\033[95m[DDO CORTEX] Razonando... (Simulación)\033[0m")
    print(f"\033[92m[DDO] Objetivo detectado: {task}. Iniciando secuencia ROSAS...\033[0m")

if __name__ == "__main__":
    main()
