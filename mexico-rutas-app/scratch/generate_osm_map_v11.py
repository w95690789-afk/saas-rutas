import json
import math
import time
import urllib.request
import os
import shutil
import re
from datetime import datetime, timedelta
from collections import defaultdict

DEPOT_LAT = 18.91131092627553
DEPOT_LNG = -97.00090357086486

# Read geocoding lookup catalog
with open("/home/wilsonpintogaona/Documentos/Proyectos/Saas Rutas/problem_VH.json") as f:
    problem_vh = json.load(f)
with open("/home/wilsonpintogaona/Documentos/Proyectos/Saas Rutas/mexico-rutas-app/scratch/prueba_a.json") as f:
    prueba_a = json.load(f)

catalog = {}
for idx, j in enumerate(problem_vh["plan"]["jobs"]):
    place = j["tasks"]["deliveries"][0]["places"][0]
    ex = prueba_a[idx]
    
    client_code = (ex.get("cliente") or "").strip().upper()
    client_nom = (ex.get("nombre") or "").strip().upper()
    pob = (ex.get("poblacion") or "").strip().upper()
    edo = (ex.get("estado") or "").strip().upper()
    
    coord = {
        "lat": place["location"]["lat"],
        "lng": place["location"]["lng"],
        "city": ex.get("poblacion") or "",
        "state": ex.get("estado") or ""
    }
    
    if client_code: catalog[client_code] = coord
    if client_nom and pob: catalog[f"{client_nom}_{pob}"] = coord
    if pob and edo: catalog[f"{pob}_{edo}"] = coord
    if pob: catalog[pob] = coord

catalog_json_str = json.dumps(catalog, ensure_ascii=False)

def distance_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def get_road_route_osrm(coords):
    coord_strings = [f"{lng},{lat}" for lat, lng in coords]
    url = f"http://router.project-osrm.org/route/v1/driving/{';'.join(coord_strings)}?overview=full&geometries=geojson"
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data.get("code") == "Ok":
                route_geom = data["routes"][0]["geometry"]["coordinates"]
                return [[lat, lng] for lng, lat in route_geom]
    except Exception as e:
        pass
    return [[lat, lng] for lat, lng in coords]

def parse_appointment_info(job):
    ex = job.get("excel_info", {})
    agente = str(ex.get("agente", "")).strip()
    obs = str(ex.get("observaciones", "")).strip()
    req_date = str(ex.get("fecha_requerida", "")).strip()
    
    combined = f"{agente} | {obs}"
    has_cita = False
    cita_full_text = ""
    
    cita_match = re.search(r'CITA\s+([A-ZÁÉÍÓÚ]+)?\s*(\d{1,2}/\d{1,2}/\d{2,4})?\s*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)?', combined, re.IGNORECASE)
    if cita_match:
        has_cita = True
        cita_full_text = cita_match.group(0).strip()
    elif "CITA" in agente.upper():
        has_cita = True
        cita_full_text = agente
        
    return {
        "has_cita": has_cita,
        "cita_text": cita_full_text,
        "req_date": req_date
    }

def solve_hybrid_logistics_plans(all_jobs, depot_coords):
    depot_lat, depot_lng = depot_coords
    groups = defaultdict(list)
    
    for j in all_jobs:
        ex = j["excel_info"]
        client_code = str(ex.get("cliente", "")).strip().upper()
        client_nom = str(ex.get("nombre", "")).strip().upper()
        pob = str(ex.get("poblacion", "")).strip().upper()
        edo = str(ex.get("estado", "")).strip().upper()
        ped = str(ex.get("pedido", "")).strip()
        apt = parse_appointment_info(j)
        
        # 1. Tabasco FTL
        if "MONTERREY" in client_nom or "TABASCO" in (ex.get("ruta") or "").upper():
            if j["demand"] > 3000:
                groups["TABASCO_FTL"].append(j)
                continue
                
        # 2. Guadalupe Garcia Martinez (Chiapas FTL)
        if "GUADALUPE GARCIA" in client_nom or client_code == "A02018":
            groups["GUADALUPE_FTL"].append(j)
            continue
            
        # 3. Proveedora de Abarrotes Rivera (Puebla FTL)
        if "RIVERA" in client_nom or client_code == "B00062":
            groups["RIVERA_FTL"].append(j)
            continue
            
        # 4. Compañia Mayorista de Abarrotes (Chiapas)
        if "MAYORISTA" in client_nom or client_code == "A02542":
            if j["demand"] > 20000 or "450342" in ped or "450705" in ped:
                groups["MAYORISTA_TAPACHULA_FTL"].append(j)
            elif "448913" in ped or "448915" in ped or "448918" in ped or ("448916" in ped and j["demand"] < 5000):
                groups["MAYORISTA_TUXTLA_1_FTL"].append(j)
            else:
                groups["MAYORISTA_TUXTLA_2_FTL"].append(j)
            continue
            
        # 5. Yucatan (Merida)
        if "PANADERO" in client_nom or client_code == "B00200" or "YUCAT" in edo:
            groups["YUCATAN_TORTON"].append(j)
            continue
            
        # 6. Coatzacoalcos / Veracruz Sur
        if "PERFUMERIA" in client_nom or client_code == "B00035" or "COATZA" in pob or "JALTIPAN" in pob:
            if "22/08" in apt["cita_text"] or "450461" in ped or "450473" in ped:
                groups["COATZA_SABADO"].append(j)
            else:
                groups["COATZA_MIERCOLES"].append(j)
            continue
            
        # 7. Oaxaca Valles
        if "GUVIER" in client_nom or "CONCHA" in client_nom or "MIAHUAT" in pob or "OCOTLAN" in pob:
            groups["OAXACA_VALLES"].append(j)
            continue
            
        # 8. Oaxaca Istmo (Juchitan)
        if "TOLEDO" in client_nom or "JUCHIT" in pob or client_code == "B00084":
            groups["OAXACA_ISTMO"].append(j)
            continue
            
        # 9. Veracruz Centro-Norte (San Rafael / Martinez)
        if "MEUNIER" in client_nom or "ROSA MARIA" in client_nom or "JORGE ANDRES" in client_nom or "SAN RAFAEL" in pob or "MARTINEZ" in pob:
            groups["VERACRUZ_CENTRO_NORTE"].append(j)
            continue
            
        # 10. Veracruz Norte & Sierra de Puebla
        groups["SIERRA_POZA_RICA"].append(j)

    def generate_plan_structure(plan_type):
        plan_trips = []
        
        # 1. Direct FTLs (identical in all plans to guarantee business efficiency)
        plan_trips.append({
            "modalidad": "FTL Directo (Cliente Dedicado)",
            "corridor": "Tabasco (Villahermosa)",
            "color": "#3b82f6",
            "speed_kmh": 65.0,
            "vehicle_type": "Tracto",
            "fixed_cost": 10000,
            "dist_cost_per_km": 15,
            "jobs": groups["TABASCO_FTL"],
            "pref_dep": datetime(2026, 8, 18, 21, 30) # Salida 09:30 PM -> ETA 19/Ago 06:21 AM (Cita 07:00 AM)
        })
        
        plan_trips.append({
            "modalidad": "FTL Directo (Cliente Dedicado)",
            "corridor": "Chiapas (Suchiate / Cd. Hidalgo)",
            "color": "#8b5cf6",
            "speed_kmh": 55.0,
            "vehicle_type": "Tracto",
            "fixed_cost": 10000,
            "dist_cost_per_km": 15,
            "jobs": groups["GUADALUPE_FTL"],
            "pref_dep": datetime(2026, 8, 21, 14, 45) # Salida 02:45 PM -> ETA 22/Ago 07:15 AM
        })
        
        plan_trips.append({
            "modalidad": "FTL Directo (Cliente Dedicado)",
            "corridor": "Chiapas (Tapachula)",
            "color": "#8b5cf6",
            "speed_kmh": 55.0,
            "vehicle_type": "Tracto",
            "fixed_cost": 10000,
            "dist_cost_per_km": 15,
            "jobs": groups["MAYORISTA_TAPACHULA_FTL"],
            "pref_dep": datetime(2026, 8, 21, 15, 30) # Salida 03:30 PM -> ETA 22/Ago 07:21 AM (Cita 08:00 AM)
        })
        
        plan_trips.append({
            "modalidad": "FTL Directo (Cliente Dedicado)",
            "corridor": "Chiapas (Tuxtla Gutiérrez 1)",
            "color": "#8b5cf6",
            "speed_kmh": 55.0,
            "vehicle_type": "Tracto",
            "fixed_cost": 10000,
            "dist_cost_per_km": 15,
            "jobs": groups["MAYORISTA_TUXTLA_1_FTL"],
            "pref_dep": datetime(2026, 8, 21, 19, 15) # Salida 07:15 PM -> ETA 22/Ago 06:25 AM (Cita 07:00 AM)
        })
        
        plan_trips.append({
            "modalidad": "FTL Directo (Cliente Dedicado)",
            "corridor": "Chiapas (Tuxtla Gutiérrez 2)",
            "color": "#8b5cf6",
            "speed_kmh": 55.0,
            "vehicle_type": "Tracto",
            "fixed_cost": 10000,
            "dist_cost_per_km": 15,
            "jobs": groups["MAYORISTA_TUXTLA_2_FTL"],
            "pref_dep": datetime(2026, 8, 21, 19, 15) # Salida 07:15 PM -> ETA 22/Ago 06:25 AM (Cita 07:00 AM)
        })
        
        plan_trips.append({
            "modalidad": "FTL Directo (Cliente Dedicado)",
            "corridor": "Puebla Directo (Pq. Ind. 5 de Mayo)",
            "color": "#06b6d4",
            "speed_kmh": 60.0,
            "vehicle_type": "Tracto",
            "fixed_cost": 10000,
            "dist_cost_per_km": 15,
            "jobs": groups["RIVERA_FTL"],
            "pref_dep": datetime(2026, 8, 21, 6, 0)
        })
        
        # 2. Regional Corridors
        plan_trips.append({
            "modalidad": "Consolidado Península (Kanasín)",
            "corridor": "Península (Mérida)",
            "color": "#ec4899",
            "speed_kmh": 75.0,
            "vehicle_type": "Torton",
            "fixed_cost": 6000,
            "dist_cost_per_km": 10,
            "jobs": groups["YUCATAN_TORTON"],
            "pref_dep": datetime(2026, 8, 18, 14, 0)
        })
        
        plan_trips.append({
            "modalidad": "Consolidado Coatzacoalcos (Turno Miércoles)",
            "corridor": "Veracruz Sur (Coatzacoalcos)",
            "color": "#6366f1",
            "speed_kmh": 60.0,
            "vehicle_type": "Torton",
            "fixed_cost": 6000,
            "dist_cost_per_km": 10,
            "jobs": groups["COATZA_MIERCOLES"],
            "pref_dep": datetime(2026, 8, 19, 0, 30) # Salida 12:30 AM -> ETA 19/Ago 06:25 AM (Cita 07:00 AM)
        })
        
        plan_trips.append({
            "modalidad": "Consolidado Coatzacoalcos (Turno Sábado)",
            "corridor": "Veracruz Sur (Coatzacoalcos)",
            "color": "#6366f1",
            "speed_kmh": 60.0,
            "vehicle_type": "Torton",
            "fixed_cost": 6000,
            "dist_cost_per_km": 10,
            "jobs": groups["COATZA_SABADO"],
            "pref_dep": datetime(2026, 8, 22, 0, 30) # Salida 12:30 AM -> ETA 22/Ago 06:25 AM (Cita 07:00 AM)
        })
        
        plan_trips.append({
            "modalidad": "Consolidado Valles Centrales (Miahuatlán/Ocotlán)",
            "corridor": "Oaxaca (Valles Centrales)",
            "color": "#eab308",
            "speed_kmh": 48.0,
            "vehicle_type": "Torton",
            "fixed_cost": 6000,
            "dist_cost_per_km": 10,
            "jobs": groups["OAXACA_VALLES"],
            "pref_dep": datetime(2026, 8, 21, 5, 0)
        })
        
        plan_trips.append({
            "modalidad": "Consolidado Istmo de Tehuantepec (Juchitán)",
            "corridor": "Oaxaca (Istmo)",
            "color": "#f97316",
            "speed_kmh": 50.0,
            "vehicle_type": "Torton",
            "fixed_cost": 6000,
            "dist_cost_per_km": 10,
            "jobs": groups["OAXACA_ISTMO"],
            "pref_dep": datetime(2026, 8, 21, 4, 0)
        })
        
        plan_trips.append({
            "modalidad": "Consolidado Costa Centro-Norte (San Rafael/Mtz)",
            "corridor": "Veracruz Costa Centro-Norte",
            "color": "#14b8a6",
            "speed_kmh": 55.0,
            "vehicle_type": "Torton",
            "fixed_cost": 6000,
            "dist_cost_per_km": 10,
            "jobs": groups["VERACRUZ_CENTRO_NORTE"],
            "pref_dep": datetime(2026, 8, 21, 5, 30)
        })
        
        # 3. Sierra de Puebla & Poza Rica
        sierra_costa_jobs = groups["SIERRA_POZA_RICA"]
        
        if plan_type == 1:
            plan_trips.append({
                "modalidad": "Consolidado Sierra Norte & Costa (12 Paradas)",
                "corridor": "Veracruz Norte & Sierra Puebla",
                "color": "#10b981",
                "speed_kmh": 50.0,
                "vehicle_type": "Torton",
                "fixed_cost": 6000,
                "dist_cost_per_km": 10,
                "jobs": sierra_costa_jobs,
                "pref_dep": datetime(2026, 8, 18, 4, 0)
            })
        elif plan_type == 2:
            sierra = [j for j in sierra_costa_jobs if "PUEBLA" in (j["excel_info"].get("estado") or "").upper() or j["lat"] < 20.45]
            costa = [j for j in sierra_costa_jobs if j not in sierra]
            
            plan_trips.append({
                "modalidad": "Capilar Ágil (Sierra de Puebla - Xicotepec)",
                "corridor": "Sierra Norte de Puebla",
                "color": "#10b981",
                "speed_kmh": 50.0,
                "vehicle_type": "Torton" if sum(j["demand"] for j in sierra) > 7600 else "Camioneta 7t",
                "fixed_cost": 6000 if sum(j["demand"] for j in sierra) > 7600 else 3500,
                "dist_cost_per_km": 10 if sum(j["demand"] for j in sierra) > 7600 else 7,
                "jobs": sierra,
                "pref_dep": datetime(2026, 8, 18, 5, 0)
            })
            plan_trips.append({
                "modalidad": "Capilar Ágil (Costa Poza Rica / Papantla)",
                "corridor": "Veracruz Norte (Poza Rica)",
                "color": "#059669",
                "speed_kmh": 55.0,
                "vehicle_type": "Camioneta 7t",
                "fixed_cost": 3500,
                "dist_cost_per_km": 7,
                "jobs": costa,
                "pref_dep": datetime(2026, 8, 18, 4, 30)
            })
        else:
            xico = [j for j in sierra_costa_jobs if "XICOTEPEC" in (j["excel_info"].get("poblacion") or "").upper() or "XICOTEPEC" in (j["excel_info"].get("observaciones") or "").upper()]
            carranza = [j for j in sierra_costa_jobs if j not in xico and ("CARRANZA" in (j["excel_info"].get("observaciones") or "").upper() or "PUEBLA" in (j["excel_info"].get("estado") or "").upper())]
            poza = [j for j in sierra_costa_jobs if j not in xico and j not in carranza]
            
            for sub_nom, sub_list, col in [("Ruta Xicotepec de Juárez", xico, "#10b981"), ("Ruta Venustiano Carranza", carranza, "#059669"), ("Ruta Poza Rica & Papantla", poza, "#047857")]:
                if sub_list:
                    s_w = sum(j["demand"] for j in sub_list)
                    v_t = "Camioneta 7t" if s_w > 3800 else "Camioneta 4t"
                    plan_trips.append({
                        "modalidad": f"Reparto Rápido ({sub_nom})",
                        "corridor": f"Veracruz Norte & Sierra ({sub_nom})",
                        "color": col,
                        "speed_kmh": 55.0,
                        "vehicle_type": v_t,
                        "fixed_cost": 3500 if v_t == "Camioneta 7t" else 2500,
                        "dist_cost_per_km": 7 if v_t == "Camioneta 7t" else 5,
                        "jobs": sub_list,
                        "pref_dep": datetime(2026, 8, 18, 5, 0)
                    })
                    
        return plan_trips

    plans_out = {}
    for p_id, p_num, p_title in [("plan1", 1, "Plan 1: Máxima Consolidación (6 Tráilers + 7 Tortons)"), ("plan2", 2, "Plan 2: Flota Balanceada (Mix Tráiler, Torton y Camionetas)"), ("plan3", 3, "Plan 3: Nivel de Servicio & Citas (Rutas Capilares y Citas 7:00 AM)")]:
        raw_trips = generate_plan_structure(p_num)
        formatted = []
        
        for trip_idx, t in enumerate(raw_trips):
            emb_id = f"EMB-{trip_idx+1:02d}"
            loc_groups = defaultdict(list)
            for j in t["jobs"]:
                key = (j["lat"], j["lng"])
                loc_groups[key].append(j)
                
            unvisited = list(loc_groups.keys())
            cur_lat, cur_lng = depot_lat, depot_lng
            loc_seq = []
            
            while unvisited:
                nearest_idx = 0
                min_d = distance_km(cur_lat, cur_lng, unvisited[0][0], unvisited[0][1])
                for i in range(1, len(unvisited)):
                    d = distance_km(cur_lat, cur_lng, unvisited[i][0], unvisited[i][1])
                    if d < min_d:
                        min_d = d
                        nearest_idx = i
                sel = unvisited.pop(nearest_idx)
                loc_seq.append(sel)
                cur_lat, cur_lng = sel[0], sel[1]
                
            sequence = []
            total_dist = 0.0
            prev_lat, prev_lng = depot_lat, depot_lng
            
            for s_idx, loc in enumerate(loc_seq):
                s_jobs = loc_groups[loc]
                s_load = sum(j["demand"] for j in s_jobs)
                d = distance_km(prev_lat, prev_lng, loc[0], loc[1])
                total_dist += d * 1.3
                prev_lat, prev_lng = loc[0], loc[1]
                
                ex = s_jobs[0]["excel_info"]
                city_name = str(ex.get("poblacion") or "").strip()
                state_name = str(ex.get("estado") or "").strip()
                obs_text = str(ex.get("observaciones") or "").strip().upper()
                corridor_text = str(t.get("corridor") or "").strip().upper()

                if not city_name or city_name in ["Destino", "Chiapas", "Yucatán", "Veracruz", "Puebla", "Oaxaca"]:
                    if "TAPACHULA" in obs_text or "TAPACHULA" in corridor_text:
                        city_name = "Tapachula"
                        state_name = "Chiapas"
                    elif "TUXTLA" in obs_text or "TUXTLA" in corridor_text:
                        city_name = "Tuxtla Gutiérrez"
                        state_name = "Chiapas"
                    elif "COATZA" in obs_text or "COATZA" in corridor_text:
                        city_name = "Coatzacoalcos"
                        state_name = "Veracruz"
                    elif "XICOTEPEC" in obs_text:
                        city_name = "Xicotepec de Juárez"
                        state_name = "Puebla"
                    elif "CARRANZA" in obs_text:
                        city_name = "Venustiano Carranza"
                        state_name = "Puebla"
                    elif "HIDALGO" in obs_text or "SUCHIATE" in corridor_text:
                        city_name = "Ciudad Hidalgo / Suchiate"
                        state_name = "Chiapas"
                    elif "KANASIN" in obs_text or "MERIDA" in corridor_text:
                        city_name = "Kanasín"
                        state_name = "Yucatán"
                    elif ex.get("delegacion"):
                        city_name = ex.get("delegacion")
                    else:
                        city_name = state_name or city_name or "Destino"

                if not state_name:
                    if city_name in ["Tapachula", "Tuxtla Gutiérrez", "Ciudad Hidalgo / Suchiate"]:
                        state_name = "Chiapas"
                    elif city_name in ["Coatzacoalcos", "Poza Rica de Hidalgo", "Papantla de Olarte", "San Rafael", "Martínez de la Torre"]:
                        state_name = "Veracruz"
                    elif city_name in ["Xicotepec de Juárez", "Venustiano Carranza", "Puebla (Heroica Puebla)", "Puebla"]:
                        state_name = "Puebla"
                    elif city_name in ["Kanasín", "Mérida"]:
                        state_name = "Yucatán"
                    elif city_name in ["Villahermosa"]:
                        state_name = "Tabasco"
                    elif city_name in ["Ocotlán de Morelos", "Miahuatlán de Porfirio Díaz", "Juchitán (Juchitán de Zaragoza)"]:
                        state_name = "Oaxaca"

                sequence.append({
                    "seq": s_idx + 1,
                    "lat": loc[0],
                    "lng": loc[1],
                    "city": city_name,
                    "state": state_name,
                    "load": s_load,
                    "jobs": s_jobs,
                    "cita": parse_appointment_info(s_jobs[0])["cita_text"]
                })
                
            total_dist += distance_km(prev_lat, prev_lng, depot_lat, depot_lng) * 1.3
            
            cur_dt = t["pref_dep"]
            p_lat, p_lng = depot_lat, depot_lng
            stops_with_eta = []
            
            for s in sequence:
                leg_dist = distance_km(p_lat, p_lng, s["lat"], s["lng"]) * 1.3
                transit_hours = leg_dist / t["speed_kmh"]
                cur_dt += timedelta(hours=transit_hours)
                
                eta_str = cur_dt.strftime("%d/%b %I:%M %p")
                s["eta"] = eta_str
                stops_with_eta.append(s)
                
                unload_mins = min(120, 20 + (s["load"]/1000.0)*5)
                cur_dt += timedelta(minutes=unload_mins)
                p_lat, p_lng = s["lat"], s["lng"]
                
            ret_dist = distance_km(p_lat, p_lng, depot_lat, depot_lng) * 1.3
            cur_dt += timedelta(hours=ret_dist / t["speed_kmh"])
            return_str = cur_dt.strftime("%d/%b %I:%M %p")
            
            trip_cost = t["fixed_cost"] + (total_dist * t["dist_cost_per_km"])
            
            formatted.append({
                "emb_id": emb_id,
                "vehicle": f"{t['vehicle_type']}_{trip_idx+1:02d}",
                "type": t["vehicle_type"],
                "trip_idx": 1,
                "corridor": t["corridor"],
                "modalidad": t["modalidad"],
                "load": sum(j["demand"] for j in t["jobs"]),
                "orders_count": len(t["jobs"]),
                "color": t["color"],
                "distance": round(total_dist, 1),
                "cost": round(trip_cost),
                "departure": t["pref_dep"].strftime("%d/%b %I:%M %p"),
                "return_time": return_str,
                "stops": stops_with_eta,
                "stops_count": len(sequence)
            })
            
        plans_out[p_id] = {
            "title": p_title,
            "routes": formatted,
            "total_cost": sum(r["cost"] for r in formatted),
            "total_weight": sum(r["load"] for r in formatted),
            "total_trips": len(formatted),
            "unassigned": []
        }
        
    return plans_out

def main():
    depot = (DEPOT_LAT, DEPOT_LNG)
    
    with open("/home/wilsonpintogaona/Documentos/Proyectos/Saas Rutas/problem_VH.json") as f:
        problem_data = json.load(f)
    jobs = problem_data["plan"]["jobs"]
    
    with open("/home/wilsonpintogaona/Documentos/Proyectos/Saas Rutas/mexico-rutas-app/scratch/prueba_a.json") as f:
        excel_rows = json.load(f)
        
    job_items = []
    for idx, j in enumerate(jobs):
        place = j["tasks"]["deliveries"][0]["places"][0]
        lat = place["location"]["lat"]
        lng = place["location"]["lng"]
        demand = j["tasks"]["deliveries"][0]["demand"][0] / 1000.0
        
        job_items.append({
            "id": j["id"],
            "lat": lat,
            "lng": lng,
            "demand": demand,
            "excel_info": excel_rows[idx]
        })
        
    print("Solving Hybrid Logistics Plans...")
    plans = solve_hybrid_logistics_plans(job_items, depot)
    
    # Fetch road geometries for all trips in all plans
    for p_id in ["plan1", "plan2", "plan3"]:
        print(f"Fetching OSRM geometries for {p_id}...")
        for idx, t in enumerate(plans[p_id]["routes"]):
            coords = [depot]
            for stop in t["stops"]:
                coords.append((stop["lat"], stop["lng"]))
            coords.append(depot)
            t["road_geometry"] = get_road_route_osrm(coords)
            print(f"  {p_id} {t['emb_id']} ({idx+1}/{len(plans[p_id]['routes'])}) fetched.")
            time.sleep(0.1)
            
    plans_json_str = json.dumps(plans, ensure_ascii=False)
    
    tmpl_path = "/home/wilsonpintogaona/Documentos/Proyectos/Saas Rutas/mexico-rutas-app/scratch/template.html"
    if not os.path.exists(tmpl_path):
        tmpl_path = "/home/wilsonpintogaona/.gemini/antigravity/brain/e949a076-47db-4d03-ad2f-d0339939a208/scratch/template.html"
    with open(tmpl_path, "r", encoding="utf-8") as f:
        template_text = f.read()
        
    output_html = template_text.replace("__PLANS_JSON_PLACEHOLDER__", plans_json_str)
    output_html = output_html.replace("__GEOLOOKUP_JSON_PLACEHOLDER__", catalog_json_str)
    output_html = output_html.replace("__DEPOT_LAT__", str(DEPOT_LAT))
    output_html = output_html.replace("__DEPOT_LNG__", str(DEPOT_LNG))
    
    with open("/home/wilsonpintogaona/Documentos/Proyectos/Saas Rutas/index.html", "w", encoding="utf-8") as f:
        f.write(output_html)
    with open("/home/wilsonpintogaona/Documentos/Proyectos/Saas Rutas/routes_map.html", "w", encoding="utf-8") as f:
        f.write(output_html)
        
    print("SUCCESS! index.html and routes_map.html generated perfectly!")

if __name__ == "__main__":
    main()
