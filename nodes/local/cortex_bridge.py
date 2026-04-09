import urllib.request
import urllib.error
import urllib.parse
import json
import sys
import os

def load_env():
    env_vars = {}
    if os.path.exists('.env'):
        with open('.env', 'r', encoding='utf-8') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key, val = line.strip().split('=', 1)
                    env_vars[key.strip()] = val.strip().strip("'").strip('"')
    return env_vars

def invoke_cortex_baas(mission_text):
    env = load_env()
    
    # URL and Token configurations
    base_url = env.get("BAAS_EDGE_URL", "https://tu-proyecto.supabase.co/functions/v1/brain")
    token = env.get("X_DDO_TOKEN", "TU_TOKEN_SECRETO_AQUI")
    
    # Validate
    if base_url == "https://tu-proyecto.supabase.co/functions/v1/brain" or token == "TU_TOKEN_SECRETO_AQUI":
        print("\033[93m[DDO AVISO]\033[0m Estás usando los valores genéricos de prueba. Por favor configura BAAS_EDGE_URL y X_DDO_TOKEN en tu .env.")

    print(f"\033[96m[DDO CORTEX BRIDGE]\033[0m Transmitiendo misión al BaaS en la Nube...")
    
    # Preparar el paquete de datos
    data = json.dumps({"mision": mission_text}).encode('utf-8')
    
    request = urllib.request.Request(base_url, data=data)
    request.add_header('Content-Type', 'application/json')
    request.add_header('X-DDO-TOKEN', token)
    
    try:
        # Petición HTTP directa sin librerías externas para proteger RAM/ROM
        response = urllib.request.urlopen(request, timeout=30)
        result_bytes = response.read()
        res_json = json.loads(result_bytes.decode('utf-8'))
        
        print("\n\033[92m[DDO BAAS RESPUESTA EXXITOSA]\033[0m")
        print("-" * 50)
        # Mostrar la respuesta
        output = res_json.get("report_intelligence", res_json)
        if isinstance(output, dict):
            print(json.dumps(output, indent=2, ensure_ascii=False))
        else:
            print(output)
        print("-" * 50)
        
    except urllib.error.HTTPError as e:
        print(f"\n\033[91m[DDO ERROR DEL SERVIDOR]\033[0m Código {e.code}: {e.reason}")
        print(f"Detalle: {e.read().decode('utf-8')}")
    except urllib.error.URLError as e:
        print(f"\n\033[91m[DDO ERROR DE RED]\033[0m Falló la conexión al puente de la Nube.")
        print(f"Motivo: {e.reason}")
    except Exception as ex:
        print(f"\n\033[91m[DDO ERROR CRÍTICO]\033[0m Fallo general: {str(ex)}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\033[91m[ERROR]\033[0m Debes proporcionar una misión.")
        print('Uso: python cortex_bridge.py "Revisa el estatus del servidor de logs"')
        sys.exit(1)
        
    mission = sys.argv[1]
    invoke_cortex_baas(mission)
