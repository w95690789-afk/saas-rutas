from fastapi import FastAPI, Depends, Security, HTTPException, status
from fastapi.security import APIKeyHeader
import os

app = FastAPI(title="DDO BaaS Core", description="Sovereign Brain as a Service V4.0")

API_KEY_NAME = "X-DDO-TOKEN"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

def get_api_key(api_key: str = Security(api_key_header)):
    if api_key == os.getenv("DDO_AUTH_TOKEN"):
        return api_key
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Soberanía rechazada: Token no válido."
    )

@app.get("/")
async def root():
    return {
        "status": "DDO_CORE_ACTIVE",
        "version": "4.0",
        "brain": "Omnidireccional",
        "ignition": "Ready"
    }

@app.post("/ignite")
async def ignite(token: str = Depends(get_api_key)):
    # Fase Pre-0 Logic
    return {
        "message": "Fase Pre-0: Bootstrapping completado.",
        "sovereignty": "Total",
        "next_step": "Carga de Contexto via Supabase"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
