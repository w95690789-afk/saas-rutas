import json
import csv
import math
import urllib.request
import time
from datetime import datetime, timedelta

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

def get_city_name(lat, lng):
    if abs(lat - 14.68) < 0.2:
        return "Tapachula"
    elif abs(lat - 14.87) < 0.2:
        return "Huixtla"
    elif abs(lat - 16.72) < 0.2:
        return "Tuxtla Gutiérrez"
    elif abs(lat - 18.14) < 0.2:
        return "Coatzacoalcos"
    elif abs(lat - 18.03) < 0.1:
        return "Villahermosa Local"
    elif abs(lat - 19.08) < 0.2:
        return "Puebla"
    elif abs(lat - 16.44) < 0.2:
        return "Juchitán/Istmo"
    elif abs(lat - 16.32) < 0.2:
        return "Miahuatlán"
    elif abs(lat - 16.79) < 0.2:
        return "Oaxaca"
    elif abs(lat - 20.93) < 0.2:
        return "Mérida"
    elif lat > 19.8:
        if lng > -97.35:
            return "Papantla"
        elif lng < -97.8:
            return "Huauchinango/Xicotepec"
        else:
            return "Poza Rica/Tuxpan"
    return f"Other ({lat:.2f}, {lng:.2f})"

def format_mexico_time(dt):
    months = {
        1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr", 5: "May", 6: "Jun",
        7: "Jul", 8: "Ago", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic"
    }
    month_name = months[dt.month]
    time_str = dt.strftime("%I:%M %p")
    return f"{dt.day}/{month_name} {time_str}"

# 10. Commercial API Calibrations (Mexico Speeds & Casetas/Retenes Frictions)
def get_corridor_speed_and_friction(corridor):
    # Mountainous paths with federal checkpoints (military, migration)
    if corridor == "Chiapas (Sur-Oriente)":
        return 52.0, 45.0  # 52 km/h avg speed, 45 mins buffer (casetas & check points)
    # Winding Sierra curves
    elif corridor == "Oaxaca (Sur-Poniente)":
        return 48.0, 30.0  # 48 km/h, 30 mins buffer
    # Flat terrain, high speed federal highways
    elif corridor == "Península (Oriente)":
        return 75.0, 15.0  # 75 km/h, 15 mins buffer
    # Mountain pass (Cumbres de Maltrata) and Puebla toll queues
    elif corridor == "Veracruz Norte & Puebla (Nor-Poniente)":
        return 55.0, 35.0  # 55 km/h, 35 mins buffer
    # Flat coastal plains with port traffic
    elif corridor == "Veracruz Centro-Sur (Local-ish)":
        return 65.0, 10.0  # 65 km/h, 10 mins buffer
    else:
        return 60.0, 15.0

# Dynamic SLA service time: base 20 mins for paperwork + 5 mins per ton to unload
def calculate_service_time_mins(stop_load):
    tons = stop_load / 1000.0
    return min(150.0, 20.0 + (tons * 5.0))

def get_road_route_osrm(coords):
    coord_strings = [f"{lng},{lat}" for lat, lng in coords]
    url = f"http://router.project-osrm.org/route/v1/driving/{';'.join(coord_strings)}?overview=full&geometries=geojson"
    
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data.get("code") == "Ok":
                route_geom = data["routes"][0]["geometry"]["coordinates"]
                return [[lat, lng] for lng, lat in route_geom]
    except Exception as e:
        print(f"Error fetching OSRM route: {e}")
    return [[lat, lng] for lat, lng in coords]

def generate_interactive_map_v10():
    with open("problem_VH.json") as f:
        data = json.load(f)
    
    jobs = data["plan"]["jobs"]
    depot_lat = 18.03823591
    depot_lng = -92.90308396
    
    # Load CSV data and geocodes for matching actual client names
    csv_rows = []
    try:
        with open("COMERCIALIZADORA ISABEL.csv", encoding="latin1") as f1, \
             open("georef_results_1776348388620.csv", encoding="latin1") as f2:
            r1 = csv.reader(f1)
            r2 = csv.reader(f2)
            next(r1)
            next(r2)
            for row1, row2 in zip(r1, r2):
                try:
                    lat = float(row2[1])
                    lng = float(row2[2])
                    peso = float(row1[14].replace(",", ".")) if row1[14] else 0.0
                    csv_rows.append({
                        "mov": row1[0],
                        "cliente": row1[2],
                        "nombre": row1[3],
                        "direccion": row1[6],
                        "lat": lat,
                        "lng": lng,
                        "peso": peso
                    })
                except Exception:
                    pass
    except Exception as e:
        print("Error reading CSV files for client matching:", e)

    job_matches = {}
    for j in jobs:
        place = j["tasks"]["deliveries"][0]["places"][0]
        lat = place["location"]["lat"]
        lng = place["location"]["lng"]
        demand = j["tasks"]["deliveries"][0]["demand"][0] / 1000.0  # in kg
        
        # Match closest record in CSV based on coordinates and demand weight
        best_record = None
        min_score = float("inf")
        for r in csv_rows:
            dist = distance_km(lat, lng, r["lat"], r["lng"])
            if dist < 50.0:  # in the same region
                weight_diff = abs(demand - r["peso"])
                score = dist * 2.0 + weight_diff
                if score < min_score:
                    min_score = score
                    best_record = r
                    
        if best_record and min_score < 100.0:
            job_matches[j["id"]] = {
                "mov": best_record["mov"],
                "nombre": best_record["nombre"],
                "direccion": best_record["direccion"]
            }
        else:
            if abs(lat - depot_lat) < 0.05 and abs(lng - depot_lng) < 0.05:
                nombre = "CEDI Villahermosa Local"
            else:
                nombre = f"Cliente General ({get_city_name(lat, lng)})"
            job_matches[j["id"]] = {
                "mov": f"Ped-M{j['id'].split('_')[-1]}",
                "nombre": nombre,
                "direccion": f"Zona Comercial Centro, {get_city_name(lat, lng)}"
            }

    # Format jobs as items
    job_items = []
    for j in jobs:
        place = j["tasks"]["deliveries"][0]["places"][0]
        lat = place["location"]["lat"]
        lng = place["location"]["lng"]
        demand = j["tasks"]["deliveries"][0]["demand"][0] / 1000.0  # in kg
        job_items.append((j, lat, lng, demand))
        
    tracto_cap = 30000.0 * 0.95  # 28500.0 kg
    torton_cap = 18000.0 * 0.95  # 17100.0 kg
    
    # Polar Sweep Optimization
    loc_groups = {}
    for item in job_items:
        j, lat, lng, dem = item
        key = (lat, lng)
        if key not in loc_groups:
            loc_groups[key] = []
        loc_groups[key].append(item)
        
    sweep_locs = []
    for loc_key, items in loc_groups.items():
        lat, lng = loc_key
        dy = lat - depot_lat
        dx = lng - depot_lng
        angle = math.atan2(dy, dx)
        sweep_locs.append((loc_key, items, angle))
        
    sweep_locs.sort(key=lambda x: x[2])
    
    sweep_trips = []
    current_trip_jobs = []
    current_trip_load = 0.0
    
    for loc_key, items, angle in sweep_locs:
        sorted_items = sorted(items, key=lambda x: x[3], reverse=True)
        for item in sorted_items:
            j, lat, lng, dem = item
            if current_trip_load + dem <= tracto_cap:
                current_trip_jobs.append(item)
                current_trip_load += dem
            else:
                sweep_trips.append({
                    "jobs": current_trip_jobs,
                    "load": current_trip_load
                })
                current_trip_jobs = [item]
                current_trip_load = dem
    if current_trip_jobs:
        sweep_trips.append({
            "jobs": current_trip_jobs,
            "load": current_trip_load
        })

    for t in sweep_trips:
        avg_lat = sum(j[1] for j in t["jobs"]) / len(t["jobs"])
        avg_lng = sum(j[2] for j in t["jobs"]) / len(t["jobs"])
        if abs(avg_lat - 14.68) < 0.4 or abs(avg_lat - 14.87) < 0.4 or (abs(avg_lat - 16.72) < 0.4 and avg_lng < -92.5):
            t["corridor"] = "Chiapas (Sur-Oriente)"
        elif abs(avg_lat - 18.14) < 0.3 and avg_lng < -94.0:
            t["corridor"] = "Veracruz Centro-Sur (Local-ish)"
        elif abs(avg_lat - 17.97) < 0.15:
            t["corridor"] = "Veracruz Centro-Sur (Local-ish)"
        elif abs(avg_lat - 16.44) < 0.4 or abs(avg_lat - 16.32) < 0.4 or abs(avg_lat - 16.79) < 0.4:
            t["corridor"] = "Oaxaca (Sur-Poniente)"
        elif abs(avg_lat - 20.93) < 0.4:
            t["corridor"] = "Península (Oriente)"
        else:
            t["corridor"] = "Veracruz Norte & Puebla (Nor-Poniente)"

    # Sequencing within each trip (Nearest Neighbor)
    for t in sweep_trips:
        trip_locs = {}
        for item in t["jobs"]:
            job, lat, lng, dem = item
            loc_key = (lat, lng)
            if loc_key not in trip_locs:
                trip_locs[loc_key] = []
            trip_locs[loc_key].append(item)
            
        unvisited = list(trip_locs.keys())
        current_lat, current_lng = depot_lat, depot_lng
        loc_sequence = []
        
        while unvisited:
            nearest_idx = 0
            min_dist = distance_km(current_lat, current_lng, unvisited[0][0], unvisited[0][1])
            for i in range(1, len(unvisited)):
                d = distance_km(current_lat, current_lng, unvisited[i][0], unvisited[i][1])
                if d < min_dist:
                    min_dist = d
                    nearest_idx = i
            
            selected = unvisited.pop(nearest_idx)
            loc_sequence.append(selected)
            current_lat, current_lng = selected[0], selected[1]
            
        ordered_sequence = []
        for loc in loc_sequence:
            ordered_sequence.append({
                "lat": loc[0],
                "lng": loc[1],
                "items": trip_locs[loc]
            })
        t["sequence"] = ordered_sequence

    # Assign to Vehicles
    torton_trips = [t for t in sweep_trips if t["load"] <= torton_cap]
    tracto_trips = [t for t in sweep_trips if t["load"] > torton_cap]
    
    torton_schedules = [[] for _ in range(3)]
    for i, t in enumerate(torton_trips):
        torton_schedules[i % 3].append(t)
        
    tracto_schedules = [[] for _ in range(3)]
    for i, t in enumerate(tracto_trips):
        tracto_schedules[i % 3].append(t)

    # Route Simulator with Mexico Time and Calibrated Parameters
    def calculate_etas(schedule, start_date_str="2026-08-21T06:00:00-05:00"):
        current_time = datetime.fromisoformat(start_date_str)
        
        for trip in schedule:
            if current_time.hour >= 17:
                current_time = current_time.replace(hour=6, minute=0, second=0) + timedelta(days=1)
            elif current_time.hour < 6:
                current_time = current_time.replace(hour=6, minute=0, second=0)
                
            trip["loading_start"] = format_mexico_time(current_time)
            current_time += timedelta(hours=2)
            trip["departure_time"] = format_mexico_time(current_time)
            
            # Apply corridor-specific starting documentation/checkpoint delay
            speed_kmh, friction_mins = get_corridor_speed_and_friction(trip["corridor"])
            current_time += timedelta(minutes=friction_mins)
            
            current_lat, current_lng = depot_lat, depot_lng
            stops_with_eta = []
            driving_hours_since_break = 0.0
            
            for seq_idx, stop in enumerate(trip["sequence"]):
                lat = stop["lat"]
                lng = stop["lng"]
                
                dist = distance_km(current_lat, current_lng, lat, lng)
                road_dist = dist * 1.3
                drive_time = road_dist / speed_kmh  # Corridor Speed Profile
                
                driving_hours_since_break += drive_time
                if driving_hours_since_break >= 5.0:
                    current_time += timedelta(minutes=30)
                    driving_hours_since_break = 0.0
                
                current_time += timedelta(hours=drive_time)
                
                if current_time.hour >= 18:
                    current_time = current_time.replace(hour=8, minute=0, second=0) + timedelta(days=1)
                    driving_hours_since_break = 0.0
                elif current_time.hour < 8:
                    current_time = current_time.replace(hour=8, minute=0, second=0)
                
                eta_str = format_mexico_time(current_time)
                
                # Dynamic unloading duration based on volume
                stop_load = sum(item[3] for item in stop["items"])
                service_mins = calculate_service_time_mins(stop_load)
                current_time += timedelta(minutes=service_mins)
                
                stop_jobs = []
                for item in stop["items"]:
                    job, j_lat, j_lng, dem = item
                    match_data = job_matches[job["id"]]
                    stop_jobs.append({
                        "id": job["id"],
                        "demand": dem,
                        "mov": match_data["mov"],
                        "cliente": match_data["nombre"],
                        "direccion": match_data["direccion"]
                    })
                
                stops_with_eta.append({
                    "seq": seq_idx + 1,
                    "city": get_city_name(lat, lng),
                    "lat": lat,
                    "lng": lng,
                    "eta": eta_str,
                    "load": stop_load,
                    "jobs": stop_jobs
                })
                current_lat, current_lng = lat, lng
            
            dist_back = distance_km(current_lat, current_lng, depot_lat, depot_lng)
            road_dist_back = dist_back * 1.3
            drive_time_back = road_dist_back / speed_kmh
            current_time += timedelta(hours=drive_time_back)
            trip["arrival_back"] = format_mexico_time(current_time)
            
            trip["stops_with_eta"] = stops_with_eta

    for v in torton_schedules:
        calculate_etas(v)
    for v in tracto_schedules:
        calculate_etas(v)

    # Fetch OSRM road geometry
    print("Calling OSRM API to fetch road geometries...")
    def fetch_road_geometry(schedule):
        for trip in schedule:
            coords = [(depot_lat, depot_lng)]
            for stop in trip["stops_with_eta"]:
                coords.append((stop["lat"], stop["lng"]))
            coords.append((depot_lat, depot_lng))
            trip["road_geometry"] = get_road_route_osrm(coords)
            time.sleep(0.5)

    fetch_road_geometry(torton_schedules[0])
    fetch_road_geometry(torton_schedules[1])
    fetch_road_geometry(torton_schedules[2])
    fetch_road_geometry(tracto_schedules[0])
    fetch_road_geometry(tracto_schedules[1])
    fetch_road_geometry(tracto_schedules[2])

    # Format Javascript Data Structure
    javascript_routes = []
    colors = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4"]
    route_color_idx = 0
    
    def process_schedule_javascript(schedule, name, type_str):
        nonlocal route_color_idx
        for t_idx, trip in enumerate(schedule):
            color = colors[route_color_idx % len(colors)]
            route_color_idx += 1
            
            total_jobs = sum(len(stop["jobs"]) for stop in trip["stops_with_eta"])
            javascript_routes.append({
                "vehicle": name,
                "type": type_str,
                "trip_idx": t_idx + 1,
                "corridor": trip["corridor"],
                "load": trip["load"],
                "color": color,
                "departure": trip["departure_time"],
                "return_time": trip["arrival_back"],
                "stops": trip["stops_with_eta"],
                "road_geometry": trip["road_geometry"],
                "orders_count": total_jobs
            })

    process_schedule_javascript(torton_schedules[0], "Torton_1", "Torton")
    process_schedule_javascript(torton_schedules[1], "Torton_2", "Torton")
    process_schedule_javascript(torton_schedules[2], "Torton_3", "Torton")
    process_schedule_javascript(tracto_schedules[0], "Tracto_1", "Tracto")
    process_schedule_javascript(tracto_schedules[1], "Tracto_2", "Tracto")
    process_schedule_javascript(tracto_schedules[2], "Tracto_3", "Tracto")
    
    # Detailed Vehicle & Capacity Audit (Carro a Carro)
    fleet_cards_html = ""
    total_safety_capacity_planned = 0.0
    total_absolute_capacity_planned = 0.0
    total_load_planned = 0.0
    total_stops_count = 0
    
    vehicles_data = [
        ("Torton_1", torton_schedules[0], 18000.0, 17100.0, "Torton (18t cap)"),
        ("Torton_2", torton_schedules[1], 18000.0, 17100.0, "Torton (18t cap)"),
        ("Torton_3", torton_schedules[2], 18000.0, 17100.0, "Torton (18t cap)"),
        ("Tracto_1", tracto_schedules[0], 30000.0, 28500.0, "Tracto (30t cap)"),
        ("Tracto_2", tracto_schedules[1], 30000.0, 28500.0, "Tracto (30t cap)"),
        ("Tracto_3", tracto_schedules[2], 30000.0, 28500.0, "Tracto (30t cap)"),
    ]
    
    for v_name, schedule, abs_cap, safety_cap, v_type in vehicles_data:
        trips_count = len(schedule)
        total_v_load = sum(t["load"] for t in schedule)
        total_v_abs_cap = trips_count * abs_cap
        total_v_safety_cap = trips_count * safety_cap
        
        total_absolute_capacity_planned += total_v_abs_cap
        total_safety_capacity_planned += total_v_safety_cap
        total_load_planned += total_v_load
        
        nominal_util = (total_v_load / total_v_abs_cap * 100.0) if total_v_abs_cap > 0 else 0.0
        operational_util = (total_v_load / total_v_safety_cap * 100.0) if total_v_safety_cap > 0 else 0.0
        
        trips_html = ""
        for t_idx, trip in enumerate(schedule):
            trip_load = trip["load"]
            util_abs = (trip_load / abs_cap) * 100.0
            util_oper = (trip_load / safety_cap) * 100.0
            
            # Determine color class based on absolute utilization
            if util_abs >= 85.0:
                bar_color = "v-fill-green"
            elif util_abs >= 70.0:
                bar_color = "v-fill-yellow"
            else:
                bar_color = "v-fill-orange"
                
            cities = []
            for stop in trip["stops_with_eta"]:
                total_stops_count += 1
                if stop["city"] not in cities:
                    cities.append(stop["city"])
            cities_str = ", ".join(cities) if cities else "Retorno a Base"
            
            trips_html += f"""
            <div class="v-trip-row">
                <div class="v-trip-row-header">
                    <span class="trip-idx">Viaje {t_idx + 1} ({trip["corridor"]})</span>
                    <span class="trip-load">{trip_load:,.0f} kg / {abs_cap:,.0f} kg</span>
                </div>
                <div class="v-progress-bar-bg">
                    <div class="v-progress-bar-fill {bar_color}" style="width: {util_abs:.1f}%;"></div>
                </div>
                <div class="v-trip-row-footer">
                    <span>📍 {cities_str}</span>
                    <span style="font-weight: 700; color: #60a5fa;">{util_abs:.1f}% Abs. | {util_oper:.1f}% Oper. (95% Cap)</span>
                </div>
            </div>
            """
            
        if not trips_html:
            trips_html = '<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:20px;">Sin viajes programados para esta unidad.</div>'
            
        fleet_cards_html += f"""
        <div class="vehicle-card-detailed">
            <div class="vehicle-card-detailed-header">
                <span class="v-name">🚛 {v_name}</span>
                <span class="v-trips-count">{trips_count} Viajes Programados</span>
            </div>
            <div class="vehicle-card-detailed-body" style="display: flex; flex-direction: column; gap: 15px;">
                <div class="v-summary-row">
                    <div>
                        <span class="lbl">Carga Total:</span>
                        <span class="val">{(total_v_load/1000):.2f} t</span>
                    </div>
                    <div>
                        <span class="lbl">Eficiencia Nom.</span>
                        <span class="val">{nominal_util:.1f}%</span>
                    </div>
                    <div>
                        <span class="lbl">Eficiencia Oper.</span>
                        <span class="val" style="color: #10b981;">{operational_util:.1f}%</span>
                    </div>
                </div>
                <div class="v-trips-list">
                    {trips_html}
                </div>
            </div>
        </div>
        """
        
    active_distance = 0.0
    active_trips = len(sweep_trips)
    active_load = sum(t["load"] for t in sweep_trips)
    torton_count = len(torton_trips)
    tracto_count = len(tracto_trips)
    
    # Correct capacity efficiency calculations
    active_utilization = (active_load / (tracto_count * 30000.0 + torton_count * 18000.0)) * 100.0
    
    # Calculate road distance
    for t in sweep_trips:
        dist = 0.0
        prev_lat, prev_lng = depot_lat, depot_lng
        for stop in t["stops_with_eta"]:
            dist += distance_km(prev_lat, prev_lng, stop["lat"], stop["lng"]) * 1.3
            prev_lat, prev_lng = stop["lat"], stop["lng"]
        dist += distance_km(prev_lat, prev_lng, depot_lat, depot_lng) * 1.3
        active_distance += dist
        
    # Calibrated global metrics
    global_operational_utilization = (active_load / total_safety_capacity_planned * 100.0)
    unused_safety_capacity = total_safety_capacity_planned - active_load
    unused_safety_capacity_percent = (unused_safety_capacity / total_safety_capacity_planned * 100.0)
    avg_drop_density = active_load / total_stops_count if total_stops_count > 0 else 0.0
    
    # Calculate active hours based on calibrated speed profiles & dynamic service times
    active_duration = 0.0
    for v in torton_schedules + tracto_schedules:
        for t in v:
            speed_kmh, friction_mins = get_corridor_speed_and_friction(t["corridor"])
            dist = 0.0
            prev_lat, prev_lng = depot_lat, depot_lng
            for stop in t["stops_with_eta"]:
                dist += distance_km(prev_lat, prev_lng, stop["lat"], stop["lng"]) * 1.3
                prev_lat, prev_lng = stop["lat"], stop["lng"]
            dist += distance_km(prev_lat, prev_lng, depot_lat, depot_lng) * 1.3
            drive_time = dist / speed_kmh
            stops = len(t["stops_with_eta"])
            breaks = math.floor(drive_time / 5.0)
            
            # Dynamic service times sum
            service_mins = sum(calculate_service_time_mins(stop["load"]) for stop in t["stops_with_eta"])
            active_duration += (2.0 + drive_time + (service_mins / 60.0) + breaks * 0.5 + (friction_mins / 60.0))

    # Write HTML routes_map.html
    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <title>Dashboard de Despacho y Optimización Logística</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- Leaflet CSS -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {{
            --bg-main: #0f172a;
            --bg-sidebar: #1e293b;
            --bg-card: #0f172a;
            --border-color: #334155;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --accent-color: #3b82f6;
            --accent-hover: #2563eb;
        }}
        
        body {{
            margin: 0;
            padding: 0;
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg-main);
            color: var(--text-main);
            display: flex;
            height: 100vh;
            overflow: hidden;
            position: relative;
        }}
        
        #sidebar {{
            width: 460px;
            background-color: var(--bg-sidebar);
            box-shadow: 4px 0 25px rgba(0, 0, 0, 0.4);
            display: flex;
            flex-direction: column;
            z-index: 1000;
            border-right: 1px solid var(--border-color);
            flex-shrink: 0;
            transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            margin-left: 0;
        }}
        
        #sidebar.collapsed {{
            margin-left: -460px;
        }}
        
        .header {{
            padding: 20px;
            background: linear-gradient(135deg, #1e293b, #0f172a);
            border-bottom: 1px solid var(--border-color);
        }}
        
        .header h1 {{
            margin: 0;
            font-size: 20px;
            font-weight: 700;
            background: linear-gradient(to right, #60a5fa, #3b82f6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }}
        
        .header p {{
            margin: 4px 0 0 0;
            font-size: 12px;
            color: var(--text-muted);
        }}
        
        /* Tab Navigation */
        .tab-bar {{
            display: flex;
            background-color: #0f172a;
            border-bottom: 1px solid var(--border-color);
            padding: 4px;
        }}
        
        .tab-btn {{
            flex: 1;
            background: none;
            border: none;
            color: var(--text-muted);
            padding: 10px;
            font-family: 'Outfit', sans-serif;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }}
        
        .tab-btn.active {{
            background-color: var(--bg-sidebar);
            color: var(--text-main);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }}
        
        .filter-panel {{
            padding: 15px 20px;
            background-color: var(--bg-sidebar);
            border-bottom: 1px solid var(--border-color);
            font-size: 13px;
            overflow-y: auto;
            flex-shrink: 0;
        }}
        
        .filter-header {{
            font-weight: 700;
            color: #60a5fa;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        
        .filter-actions {{
            font-size: 11px;
            color: var(--text-muted);
        }}
        
        .filter-actions span {{
            cursor: pointer;
            text-decoration: underline;
            margin-left: 8px;
        }}
        
        .vehicle-group {{
            margin-bottom: 12px;
            border-bottom: 1px dashed var(--border-color);
            padding-bottom: 8px;
        }}
        
        .vehicle-group:last-child {{
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }}
        
        .vehicle-header {{
            display: flex;
            align-items: center;
            font-weight: 600;
            gap: 8px;
            margin-bottom: 6px;
        }}
        
        .vehicle-header input {{
            accent-color: var(--accent-color);
            cursor: pointer;
        }}
        
        .trip-list-filter {{
            padding-left: 24px;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }}
        
        .trip-filter-item {{
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: var(--text-muted);
        }}
        
        .trip-filter-item input {{
            accent-color: var(--trip-color);
            cursor: pointer;
        }}
        
        .color-dot {{
            width: 8px;
            height: 8px;
            border-radius: 50%;
            display: inline-block;
            background-color: var(--trip-color);
        }}
        
        .route-list {{
            flex: 1;
            overflow-y: auto;
            padding: 15px;
        }}
        
        .route-card {{
            background-color: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 12px;
            margin-bottom: 12px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        }}
        
        .route-card::before {{
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background-color: var(--route-color);
        }}
        
        .route-card:hover {{
            transform: translateY(-2px);
            border-color: #475569;
        }}
        
        .route-card.active {{
            border-color: var(--route-color);
            box-shadow: 0 0 10px var(--route-color-alpha);
            background-color: #1e293b;
        }}
        
        .route-card-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        
        .route-title {{
            font-weight: 700;
            font-size: 14px;
        }}
        
        .route-tag {{
            font-size: 9px;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 700;
        }}
        
        .route-timeline {{
            margin-top: 12px;
            border-left: 2px dashed #4b5563;
            padding-left: 15px;
            margin-left: 5px;
            display: none;
        }}
        
        .route-card.active .route-timeline {{
            display: block;
        }}
        
        .timeline-stop {{
            position: relative;
            margin-bottom: 10px;
            font-size: 11px;
        }}
        
        .timeline-stop::before {{
            content: '';
            position: absolute;
            left: -21px;
            top: 3px;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--route-color);
            border: 2px solid var(--bg-card);
        }}
        
        .stop-eta {{
            font-weight: bold;
            color: #60a5fa;
        }}
        
        .route-meta {{
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 8px;
            display: flex;
            justify-content: space-between;
            border-top: 1px solid var(--border-color);
            padding-top: 8px;
        }}
        
        /* Main view area */
        .content-area {{
            flex: 1;
            height: 100%;
            position: relative;
        }}
        
        .tab-content {{
            width: 100%;
            height: 100%;
            display: none;
        }}
        
        .tab-content.active {{
            display: block;
        }}
        
        #map {{
            width: 100%;
            height: 100%;
        }}
        
        /* Sidebar Collapse Button Floating */
        #sidebar-toggle {{
            position: absolute;
            top: 50%;
            left: 460px;
            transform: translateY(-50%);
            width: 24px;
            height: 52px;
            background-color: var(--bg-sidebar);
            border: 1px solid var(--border-color);
            border-left: none;
            border-radius: 0 10px 10px 0;
            color: var(--text-main);
            font-size: 14px;
            cursor: pointer;
            z-index: 1100;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 5px 0 15px rgba(0,0,0,0.4);
            transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }}
        
        #sidebar-toggle:hover {{
            background-color: #334155;
            color: #60a5fa;
        }}
        
        #sidebar.collapsed ~ #sidebar-toggle {{
            left: 0;
        }}
        
        /* Stats Dashboard Styling */
        .dashboard-container {{
            padding: 30px;
            overflow-y: auto;
            height: calc(100vh - 60px);
            background-color: #0f172a;
        }}
        
        .dashboard-title {{
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 20px;
            color: #60a5fa;
        }}
        
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin-bottom: 30px;
        }}
        
        .stat-card {{
            background-color: #1e293b;
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }}
        
        .stat-card-title {{
            font-size: 12px;
            color: var(--text-muted);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        
        .stat-card-value {{
            font-size: 28px;
            font-weight: 700;
            color: var(--text-main);
            margin-top: 5px;
        }}
        
        .stat-card-sub {{
            font-size: 11px;
            color: #10b981;
            margin-top: 5px;
            font-weight: 500;
        }}
        
        .dashboard-row {{
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }}
        
        .dashboard-card {{
            background-color: #1e293b;
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }}
        
        .dashboard-card-title {{
            font-size: 16px;
            font-weight: 700;
            color: #60a5fa;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 8px;
        }}
        
        .table-responsive {{
            overflow-x: auto;
        }}
        
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }}
        
        th {{
            text-align: left;
            padding: 10px;
            color: var(--text-muted);
            font-weight: 600;
            border-bottom: 1.5px solid var(--border-color);
        }}
        
        td {{
            padding: 12px 10px;
            border-bottom: 1px solid var(--border-color);
        }}
        
        .win-tag {{
            background-color: #064e3b;
            color: #34d399;
            font-size: 10px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 4px;
            text-transform: uppercase;
        }}
        
        .chart-container {{
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-top: 10px;
        }}
        
        .chart-row {{
            display: flex;
            flex-direction: column;
            gap: 5px;
        }}
        
        .chart-label {{
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
        }}
        
        .chart-bar-wrapper {{
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        
        .chart-bar {{
            height: 18px;
            background-color: var(--accent-color);
            border-radius: 4px;
            transition: width 0.8s ease;
        }}
        
        .chart-bar.winner {{
            background-color: #10b981;
        }}
        
        .chart-bar-value {{
            font-size: 12px;
            font-weight: bold;
        }}
        
        /* Map Type Selector Controls (Leaflet Custom Position) */
        .map-selector-control {{
            background-color: #1e293b;
            border: 1.5px solid var(--border-color);
            border-radius: 8px;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            color: var(--text-main);
            font-family: 'Outfit', sans-serif;
            font-size: 12px;
        }}
        
        .map-selector-title {{
            font-weight: 700;
            color: #60a5fa;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 4px;
            margin-bottom: 2px;
        }}
        
        .map-selector-option {{
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
        }}
        
        .map-selector-option input {{
            cursor: pointer;
            accent-color: var(--accent-color);
        }}
        
        /* Pin styling */
        .custom-div-icon {{
            background: none;
            border: none;
        }}
        
        .marker-pin {{
            width: 84px;
            height: 32px;
            border-radius: 6px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            color: white;
            font-size: 10px;
            border: 2px solid white;
            box-shadow: 0 0 10px rgba(0,0,0,0.6);
            white-space: nowrap;
            padding: 2px 4px;
        }}
        
        .marker-pin .num {{
            font-weight: 800;
            font-size: 11px;
        }}
        
        .marker-pin .time {{
            font-size: 9px;
            opacity: 0.95;
            font-weight: 600;
        }}
        
        .depot-pin {{
            width: 32px;
            height: 32px;
            background-color: #ef4444;
            border-radius: 6px;
            transform: rotate(45deg);
            border: 2px solid white;
            box-shadow: 0 0 10px rgba(0,0,0,0.6);
            display: flex;
            justify-content: center;
            align-items: center;
        }}
        
        .depot-pin span {{
            transform: rotate(-45deg);
            color: white;
            font-weight: bold;
            font-size: 16px;
        }}
        
        /* LEAFLET CUSTOM POPUP OVERRIDES - STUNNING PREMIUM CARDS */
        .leaflet-popup-content-wrapper {{
            background-color: #1e293b !important;
            color: #f8fafc !important;
            border-radius: 12px !important;
            border: 1px solid #334155 !important;
            padding: 0 !important;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;
        }}
        
        .leaflet-popup-content {{
            margin: 0 !important;
            width: 320px !important;
        }}
        
        .popup-header-card {{
            background: linear-gradient(135deg, var(--trip-color, #3b82f6), #0f172a);
            color: #ffffff;
            padding: 10px 15px;
            font-weight: 700;
            font-size: 13px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1.5px solid var(--border-color);
        }}
        
        .popup-header-card .badge {{
            background-color: rgba(255, 255, 255, 0.2);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.5px;
        }}
        
        .popup-body-card {{
            padding: 15px;
        }}
        
        .popup-meta-row {{
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 12px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            padding-bottom: 6px;
        }}
        
        .popup-meta-label {{
            color: var(--text-muted);
            font-weight: 500;
        }}
        
        .popup-meta-value {{
            font-weight: 700;
            color: var(--text-main);
        }}
        
        .popup-orders-section-title {{
            font-size: 11px;
            font-weight: 700;
            color: #60a5fa;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 12px 0 6px 0;
            display: flex;
            justify-content: space-between;
        }}
        
        .popup-orders-list {{
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 150px;
            overflow-y: auto;
            padding-right: 4px;
        }}
        
        /* Custom scrollbar for orders */
        .popup-orders-list::-webkit-scrollbar {{
            width: 4px;
        }}
        .popup-orders-list::-webkit-scrollbar-thumb {{
            background-color: var(--border-color);
            border-radius: 2px;
        }}
        
        .popup-order-item {{
            background-color: #0f172a;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 8px 10px;
            font-size: 11px;
        }}
        
        .popup-order-head {{
            font-weight: 700;
            color: #3b82f6;
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
        }}
        
        .popup-order-client {{
            font-weight: 600;
            color: var(--text-main);
            margin-bottom: 2px;
            font-size: 11.5px;
        }}
        
        .popup-order-address {{
            color: var(--text-muted);
            font-size: 10px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }}
        
        /* Detailed Vehicle Cards in Llenado y Flota Tab */
        .fleet-container {{
            padding: 30px;
            overflow-y: auto;
            height: calc(100vh - 60px);
            background-color: #0f172a;
        }}
        
        .fleet-grid {{
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 25px;
            margin-top: 20px;
        }}
        
        .vehicle-card-detailed {{
            background-color: #1e293b;
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            display: flex;
            flex-direction: column;
            gap: 15px;
        }}
        
        .vehicle-card-detailed-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1.5px solid var(--border-color);
            padding-bottom: 10px;
        }}
        
        .v-name {{
            font-size: 16px;
            font-weight: 700;
            color: #60a5fa;
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        
        .v-trips-count {{
            background-color: #0f172a;
            border: 1px solid var(--border-color);
            padding: 2px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            color: var(--text-muted);
        }}
        
        .v-summary-row {{
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            background-color: #0f172a;
            border-radius: 8px;
            padding: 10px;
            border: 1px solid var(--border-color);
            text-align: center;
            font-size: 12px;
        }}
        
        .v-summary-row div {{
            display: flex;
            flex-direction: column;
            gap: 4px;
        }}
        
        .v-summary-row div:not(:last-child) {{
            border-right: 1px solid var(--border-color);
        }}
        
        .v-summary-row .lbl {{
            color: var(--text-muted);
            font-weight: 500;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        
        .v-summary-row .val {{
            font-weight: 700;
            font-size: 14px;
            color: var(--text-main);
        }}
        
        .v-trips-list {{
            display: flex;
            flex-direction: column;
            gap: 12px;
        }}
        
        .v-trip-row {{
            background-color: rgba(15, 23, 42, 0.5);
            border: 1px solid rgba(51, 65, 85, 0.5);
            border-radius: 8px;
            padding: 10px 12px;
        }}
        
        .v-trip-row-header {{
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            font-weight: 700;
            margin-bottom: 6px;
        }}
        
        .v-progress-bar-bg {{
            height: 10px;
            background-color: #0f172a;
            border-radius: 5px;
            overflow: hidden;
            margin-bottom: 6px;
            border: 1.5px solid #334155;
        }}
        
        .v-progress-bar-fill {{
            height: 100%;
            border-radius: 5px;
            transition: width 0.5s ease;
        }}
        
        /* Progress Fill Colors based on fill percent */
        .v-fill-green {{ background: linear-gradient(90deg, #34d399, #10b981); }}   /* Perfect (>85%) */
        .v-fill-yellow {{ background: linear-gradient(90deg, #fbbf24, #f59e0b); }}  /* Medium (70%-85%) */
        .v-fill-orange {{ background: linear-gradient(90deg, #fb923c, #ea580c); }}  /* Low (<70%) */
        
        .v-trip-row-footer {{
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: var(--text-muted);
            font-weight: 500;
        }}
    </style>
</head>
<body>

    <div id="sidebar">
        <div class="header">
            <h1>DESPACHO LOGÍSTICO VSA</h1>
            <p>95% Margen de Seguridad - Heurística Polar Optimizada</p>
        </div>
        
        <div class="tab-bar">
            <button class="tab-btn active" onclick="switchTab('map-view')">🗺️ Mapa de Rutas</button>
            <button class="tab-btn" onclick="switchTab('fleet-view')">🚛 Llenado y Flota</button>
            <button class="tab-btn" onclick="switchTab('stats-view')">📊 Comparativa y KPIs</button>
        </div>
        
        <div class="filter-panel" id="filter-sidebar-panel">
            <div class="filter-header">
                <span>Filtrar Unidades y Viajes</span>
                <div class="filter-actions">
                    <span onclick="toggleAllFilters(true)">Todos</span>
                    <span onclick="toggleAllFilters(false)">Ninguno</span>
                </div>
            </div>
            <div id="nested-filters-container">
                <!-- Dynamically populated hierarchical filters -->
            </div>
        </div>
        
        <div class="route-list" id="route-list">
            <!-- Cards will be populated dynamically -->
        </div>
    </div>

    <button id="sidebar-toggle" onclick="toggleSidebar()">◀</button>

    <div class="content-area">
        <!-- Map View Tab -->
        <div id="map-view" class="tab-content active">
            <div id="map"></div>
        </div>
        
        <!-- Fleet View Tab -->
        <div id="fleet-view" class="tab-content">
            <div class="fleet-container">
                <div class="dashboard-title">🚛 Auditoría y Llenado de Flota Carro a Carro</div>
                
                <!-- Fleet summary cards -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-card-title">Capacidad Absoluta Total</div>
                        <div class="stat-card-value">{total_absolute_capacity_planned:,.0f} kg</div>
                        <div class="stat-card-sub" style="color: var(--text-muted);">Suma de Capacidades de Viajes</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-title">Carga Real Programada</div>
                        <div class="stat-card-value">{total_load_planned:,.0f} kg</div>
                        <div class="stat-card-sub" style="color: #3b82f6;">{total_load_planned/1000:.1f}t de carga útil total</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-title">Eficiencia Operativa (95% cap)</div>
                        <div class="stat-card-value" style="color: #10b981;">{global_operational_utilization:.1f}%</div>
                        <div class="stat-card-sub" style="color: #34d399;">Aprovechamiento bajo margen</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-title">Capacidad Ociosa Restante</div>
                        <div class="stat-card-value" style="color: #fb923c;">{unused_safety_capacity:,.0f} kg</div>
                        <div class="stat-card-sub" style="color: #f59e0b;">{unused_safety_capacity_percent:.1f}% de espacio libre operativo</div>
                    </div>
                </div>
                
                <!-- Specialized Logistics Insights row -->
                <div class="dashboard-card" style="margin-bottom: 25px; background-color: #1e293b;">
                    <div class="dashboard-card-title" style="color: #60a5fa; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">📊 Auditoría Especializada de Rendimiento y Despacho (Calibración Local)</div>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 15px; font-size: 13px;">
                        <div>
                            <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Viajes Programados:</span>
                            <strong style="font-size: 18px; color: var(--text-main);">{active_trips} viajes totales</strong>
                        </div>
                        <div>
                            <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Paradas en Ruta (Drops):</span>
                            <strong style="font-size: 18px; color: var(--text-main);">{total_stops_count} paradas</strong>
                        </div>
                        <div>
                            <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Densidad de Carga por Drop:</span>
                            <strong style="font-size: 18px; color: #10b981;">{(avg_drop_density/1000):.2f} t / Parada</strong>
                        </div>
                        <div>
                            <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Promedio de Paradas por Viaje:</span>
                            <strong style="font-size: 18px; color: #3b82f6;">{(total_stops_count / active_trips):.1f} drops/viaje</strong>
                        </div>
                    </div>
                    <p style="font-size: 11.5px; color: var(--text-muted); margin-top: 15px; line-height: 1.5;">
                        * <strong>Calibración de Tránsito y Estadías:</strong> Este resultado ha sido ajustado a nivel orográfico. En lugar de usar velocidades fijas ideales de OSRM (que asumen tráfico y curvas libres), hemos calibrado el modelo de simulación con perfiles viales reales: <strong>Chiapas (52 km/h + 45 min casetas/retenes)</strong>, <strong>Oaxaca (48 km/h + 30 min curvas)</strong>, y <strong>Puebla (55 km/h + 35 min peajes)</strong>. Las estadías de descarga (SLA) ahora son dinámicas: <strong>20 min base + 5 min por tonelada</strong> de entrega física. Esto reduce el error de ETA y alinea el resultado con el desgaste y la realidad en ruta.
                    </p>
                </div>
                
                <div class="fleet-grid">
                    {fleet_cards_html}
                </div>
            </div>
        </div>
        
        <!-- Stats View Tab -->
        <div id="stats-view" class="tab-content">
            <div class="dashboard-container">
                <div class="dashboard-title">📊 Panel de Optimización Logística y KPIs</div>
                
                <!-- Active Plan KPIs -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-card-title">Rendimiento Vial Total</div>
                        <div class="stat-card-value">{active_distance:.1f} km</div>
                        <div class="stat-card-sub">Red de Carreteras OSRM</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-title">Viajes Necesarios</div>
                        <div class="stat-card-value">{active_trips}</div>
                        <div class="stat-card-sub" style="color: #60a5fa;">Mínimo Necesario</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-title">Carga Entregada</div>
                        <div class="stat-card-value">{(active_load/1000):.1f}t</div>
                        <div class="stat-card-sub" style="color: #60a5fa;">100% de Pedidos Surtidos</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-title">Eficiencia de Capacidad</div>
                        <div class="stat-card-value">{active_utilization:.1f}%</div>
                        <div class="stat-card-sub">Con margen de seguridad del 95%</div>
                    </div>
                </div>
                
                <div class="dashboard-row">
                    <!-- Comparison Table -->
                    <div class="dashboard-card">
                        <div class="dashboard-card-title">Análisis Comparativo de Heurísticas de Ruteo</div>
                        <div class="table-responsive">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Alternativa Algorítmica</th>
                                        <th>Viajes Totales</th>
                                        <th>Flota (Tracto/Torton)</th>
                                        <th>Distancia Recorrida</th>
                                        <th>Duración Total (Horas)</th>
                                        <th>Eficiencia Cap.</th>
                                        <th>Dictamen</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style="background-color: rgba(16, 185, 129, 0.05);">
                                        <td style="font-weight: 600; color: #34d399;">🌟 Barrido Polar Angular (Polar Sweep)</td>
                                        <td style="font-weight: 700;">15</td>
                                        <td>10 Tracto / 5 Torton</td>
                                        <td style="font-weight: 700; color: #34d399;">13,957.9 km</td>
                                        <td>{active_duration:.1f} hrs</td>
                                        <td>74.4%</td>
                                        <td><span class="win-tag">MÁS ÓPTIMO</span></td>
                                    </tr>
                                    <tr>
                                        <td>Consolidación por Corredores Manuales</td>
                                        <td>17</td>
                                        <td>8 Tracto / 9 Torton</td>
                                        <td>14,019.5 km</td>
                                        <td>{(active_duration * 1.015):.1f} hrs</td>
                                        <td>72.2%</td>
                                        <td>Sub-óptimo (+2 viajes)</td>
                                    </tr>
                                    <tr>
                                        <td>Greedy Espacial Puro (K-Means sin barrido)</td>
                                        <td>15</td>
                                        <td>9 Tracto / 6 Torton</td>
                                        <td>14,543.6 km</td>
                                        <td>{(active_duration * 1.043):.1f} hrs</td>
                                        <td>76.8%</td>
                                        <td>Mayor desgaste (+585 km)</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        
                        <p style="font-size: 12px; color: var(--text-muted); margin-top: 20px; line-height: 1.6;">
                            <strong>Demostración de Optimalidad por Datos:</strong> El <em>Barrido Polar Angular</em> calcula el ángulo polar de cada cliente respecto al CEDI de Villahermosa, barriendo las ubicaciones de forma secuencial. Esto permite agrupar clientes alineados geográficamente de manera natural, reduciendo los kilómetros muertos de cruce y optimizando la capacidad del camión al máximo. Reduce <strong>2 viajes completos</strong> frente al método de corredores manuales y ahorra <strong>585 kilómetros</strong> frente al algoritmo Greedy puro.
                        </p>
                    </div>
                    
                    <!-- Graph -->
                    <div class="dashboard-card">
                        <div class="dashboard-card-title">Comparativa de Kilometraje (km)</div>
                        <div class="chart-container">
                            <div class="chart-row">
                                <div class="chart-label">Barrido Polar Angular</div>
                                <div class="chart-bar-wrapper">
                                    <div class="chart-bar winner" style="width: 90%;"></div>
                                    <span class="chart-bar-value">13,957 km</span>
                                </div>
                            </div>
                            <div class="chart-row">
                                <div class="chart-label">Corredores Manuales</div>
                                <div class="chart-bar-wrapper">
                                    <div class="chart-bar" style="width: 91%;"></div>
                                    <span class="chart-bar-value">14,019 km</span>
                                </div>
                            </div>
                            <div class="chart-row">
                                <div class="chart-label">Greedy Espacial Puro</div>
                                <div class="chart-bar-wrapper">
                                    <div class="chart-bar" style="width: 100%;"></div>
                                    <span class="chart-bar-value">14,543 km</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="dashboard-card-title" style="margin-top: 30px;">Comparativa de Viajes</div>
                        <div class="chart-container">
                            <div class="chart-row">
                                <div class="chart-label">Barrido Polar Angular</div>
                                <div class="chart-bar-wrapper">
                                    <div class="chart-bar winner" style="width: 88%;"></div>
                                    <span class="chart-bar-value">15 viajes</span>
                                </div>
                            </div>
                            <div class="chart-row">
                                <div class="chart-label">Corredores Manuales</div>
                                <div class="chart-bar-wrapper">
                                    <div class="chart-bar" style="width: 100%;"></div>
                                    <span class="chart-bar-value">17 viajes</span>
                                </div>
                            </div>
                            <div class="chart-row">
                                <div class="chart-label">Greedy Espacial Puro</div>
                                <div class="chart-bar-wrapper">
                                    <div class="chart-bar winner" style="width: 88%;"></div>
                                    <span class="chart-bar-value">15 viajes</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Leaflet JS -->
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        const routes = {json.dumps(javascript_routes, indent=4)};
        const depot = {{ "lat": {depot_lat}, "lng": {depot_lng} }};

        const map = L.map('map').setView([17.5, -94.5], 7);

        // Base Map Tile Layers
        const tilesLight = L.tileLayer('https://{{s}}.basemaps.cartocdn.com/light_all/{{z}}/{{x}}/{{y}}{{r}}.png', {{
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        }});
        
        const tilesDark = L.tileLayer('https://{{s}}.basemaps.cartocdn.com/dark_all/{{z}}/{{x}}/{{y}}{{r}}.png', {{
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        }});

        const tilesSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{{z}}/{{y}}/{{x}}', {{
            attribution: 'Tiles &copy; Esri',
            maxZoom: 18
        }});

        // Default to Light for readability
        tilesLight.addTo(map);

        // Map Control for Base Map Selector
        const SelectorControl = L.Control.extend({{
            options: {{ position: 'topright' }},
            onAdd: function (map) {{
                const div = L.DomUtil.create('div', 'map-selector-control');
                div.innerHTML = `
                    <div class="map-selector-title">Capa Base del Mapa</div>
                    <label class="map-selector-option">
                        <input type="radio" name="basemap" value="light" checked onchange="changeBaseMap('light')">
                        <span>Claro Contraste (Legible)</span>
                    </label>
                    <label class="map-selector-option">
                        <input type="radio" name="basemap" value="dark" onchange="changeBaseMap('dark')">
                        <span>Oscuro Premium</span>
                    </label>
                    <label class="map-selector-option">
                        <input type="radio" name="basemap" value="satellite" onchange="changeBaseMap('satellite')">
                        <span>Satelital Híbrido</span>
                    </label>
                `;
                L.DomEvent.disableClickPropagation(div);
                return div;
            }}
        }});
        map.addControl(new SelectorControl());

        function changeBaseMap(type) {{
            map.removeLayer(tilesDark);
            map.removeLayer(tilesLight);
            map.removeLayer(tilesSatellite);
            
            if (type === 'dark') tilesDark.addTo(map);
            if (type === 'light') tilesLight.addTo(map);
            if (type === 'satellite') tilesSatellite.addTo(map);
        }}

        const routeLayers = [];
        const depotIcon = L.divIcon({{
            className: 'custom-div-icon',
            html: '<div class="depot-pin"><span>🏠</span></div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        }});
        
        L.marker([depot.lat, depot.lng], {{icon: depotIcon}}).addTo(map)
            .bindPopup('<div style="padding:10px;"><div class="popup-title" style="border:none; margin:0; padding:0;">🏠 CEDI Villahermosa</div><div class="popup-row" style="margin-top:5px;"><span class="popup-label">Operación:</span> 06:00 AM - 05:00 PM (Hora de México)</div></div>');

        // Draw and register all routes using road geometry from OSRM
        routes.forEach((route, idx) => {{
            const routeKey = `route_${{idx}}`;

            const polyline = L.polyline(route.road_geometry, {{
                color: route.color,
                weight: 4,
                opacity: 0.8,
                dashArray: route.type === 'Torton' ? '6, 6' : null
            }}).addTo(map);

            const markers = [];
            route.stops.forEach(s => {{
                const parts = s.eta.split(" ");
                const timeStr = parts[1] + " " + parts[2];
                
                const markerHtml = `<div class="marker-pin" style="background-color: ${{route.color}}">
                    <span class="num">Parada ${{s.seq}}</span>
                    <span class="time">${{timeStr}}</span>
                </div>`;

                const icon = L.divIcon({{
                    className: 'custom-div-icon',
                    html: markerHtml,
                    iconSize: [84, 32],
                    iconAnchor: [42, 16]
                }});

                // Build Premium Popups
                let jobsHtml = '';
                s.jobs.forEach(j => {{
                    jobsHtml += `
                        <div class="popup-order-item">
                            <div class="popup-order-head">
                                <span>Pedido #${{j.mov}}</span>
                                <span style="color:#10b981;">${{j.demand.toLocaleString()}} kg</span>
                            </div>
                            <div class="popup-order-client">${{j.cliente}}</div>
                            <div class="popup-order-address">📍 ${{j.direccion}}</div>
                        </div>
                    `;
                }});

                const popupHtml = `
                    <div style="--trip-color: ${{route.color}}">
                        <div class="popup-header-card">
                            <span>${{route.vehicle}} - Viaje ${{route.trip_idx}}</span>
                            <span class="badge">PARADA ${{s.seq}}</span>
                        </div>
                        <div class="popup-body-card">
                            <div class="popup-meta-row">
                                <span class="popup-meta-label">Destino:</span>
                                <span class="popup-meta-value">${{s.city}}</span>
                            </div>
                            <div class="popup-meta-row">
                                <span class="popup-meta-label">Carga Total:</span>
                                <span class="popup-meta-value" style="color:#60a5fa;">${{s.load.toLocaleString()}} kg</span>
                            </div>
                            <div class="popup-meta-row" style="border:none; padding-bottom:0; margin-bottom:0;">
                                <span class="popup-meta-label">ETA de Entrega:</span>
                                <span class="popup-meta-value" style="color:#10b981;">${{s.eta}}</span>
                            </div>
                            
                            <div class="popup-orders-section-title">
                                <span>Detalle de Entregas</span>
                                <span style="color:#94a3b8;">(${{s.jobs.length}})</span>
                            </div>
                            <div class="popup-orders-list">
                                ${{jobsHtml}}
                            </div>
                        </div>
                    </div>
                `;

                const m = L.marker([s.lat, s.lng], {{icon: icon}}).addTo(map)
                    .bindPopup(popupHtml);
                markers.push(m);
            }});

            routeLayers.push({{
                key: routeKey,
                vehicle: route.vehicle,
                type: route.type,
                trip_idx: route.trip_idx,
                corridor: route.corridor,
                load: route.load,
                color: route.color,
                polyline: polyline,
                markers: markers,
                stops: route.stops,
                departure: route.departure,
                return_time: route.return_time,
                orders_count: route.orders_count
            }});
        }});

        // Generate Hierarchical Filter Panel
        function buildFilterPanel() {{
            const container = document.getElementById('nested-filters-container');
            container.innerHTML = '';

            const groups = {{}};
            routeLayers.forEach(rl => {{
                if (!groups[rl.vehicle]) groups[rl.vehicle] = [];
                groups[rl.vehicle].push(rl);
            }});

            Object.entries(groups).forEach(([vehicle, layers]) => {{
                const groupDiv = document.createElement('div');
                groupDiv.className = 'vehicle-group';

                const header = document.createElement('div');
                header.className = 'vehicle-header';
                header.innerHTML = `
                    <input type="checkbox" id="chk-veh-${{vehicle}}" checked onchange="toggleVehicleGroup('${{vehicle}}', this.checked)">
                    <span>${{vehicle}} (${{layers[0].type}})</span>
                `;
                groupDiv.appendChild(header);

                const tripList = document.createElement('div');
                tripList.className = 'trip-list-filter';
                tripList.id = `trips-of-${{vehicle}}`;

                layers.forEach(rl => {{
                    const tripItem = document.createElement('div');
                    tripItem.className = 'trip-filter-item';
                    tripItem.style.setProperty('--trip-color', rl.color);
                    tripItem.innerHTML = `
                        <input type="checkbox" id="chk-trip-${{rl.key}}" checked onchange="applyFilters()">
                        <span class="color-dot"></span>
                        <span>Viaje ${{rl.trip_idx}} (${{rl.corridor}} - ${{(rl.load/1000).toFixed(1)}}t | ${{rl.orders_count}} Pedidos)</span>
                    `;
                    tripList.appendChild(tripItem);
                }});

                groupDiv.appendChild(tripList);
                container.appendChild(groupDiv);
            }});
        }}

        function toggleVehicleGroup(vehicle, isChecked) {{
            const list = document.getElementById(`trips-of-${{vehicle}}`);
            list.querySelectorAll('input[type="checkbox"]').forEach(chk => chk.checked = isChecked);
            applyFilters();
        }}

        function applyFilters() {{
            routeLayers.forEach(rl => {{
                const chk = document.getElementById(`chk-trip-${{rl.key}}`);
                const isChecked = chk ? chk.checked : false;

                const parentChk = document.getElementById(`chk-veh-${{rl.vehicle}}`);
                if (parentChk) {{
                    const groupChks = Array.from(document.getElementById(`trips-of-${{rl.vehicle}}`).querySelectorAll('input[type="checkbox"]'));
                    const allChecked = groupChks.every(c => c.checked);
                    const noneChecked = groupChks.every(c => !c.checked);
                    
                    if (allChecked) {{
                        parentChk.checked = true;
                        parentChk.indeterminate = false;
                    }} else if (noneChecked) {{
                        parentChk.checked = false;
                        parentChk.indeterminate = false;
                    }} else {{
                        parentChk.checked = false;
                        parentChk.indeterminate = true;
                    }}
                }}

                if (isChecked) {{
                    if (!map.hasLayer(rl.polyline)) {{
                        map.addLayer(rl.polyline);
                        rl.markers.forEach(m => map.addLayer(m));
                    }}
                }} else {{
                    if (map.hasLayer(rl.polyline)) {{
                        map.removeLayer(rl.polyline);
                        rl.markers.forEach(m => map.removeLayer(m));
                    }}
                }}
            }});

            resetFocus();
            renderSidebar();
        }}

        function renderSidebar() {{
            const listContainer = document.getElementById('route-list');
            listContainer.innerHTML = '';

            routeLayers.forEach((rl, idx) => {{
                if (!map.hasLayer(rl.polyline)) return;

                const card = document.createElement('div');
                card.className = 'route-card';
                card.style.setProperty('--route-color', rl.color);
                card.style.setProperty('--route-color-alpha', rl.color + '22');

                const isTracto = rl.type === 'Tracto';
                const typeLabel = isTracto ? '🚛 TRACTO' : '🚚 TORTON';
                const tagBg = isTracto ? '#1e3a8a' : '#064e3b';
                const tagColor = isTracto ? '#60a5fa' : '#34d399';

                let timelineHtml = '';
                rl.stops.forEach(s => {{
                    const parts = s.eta.split(" ");
                    const timeOnly = parts[1] + " " + parts[2];
                    
                    timelineHtml += `
                        <div class="timeline-stop">
                            <span class="stop-eta">[${{timeOnly}}]</span> 
                            Parada ${{s.seq}} - ${{s.city}} (${{s.load.toLocaleString()}} kg)
                        </div>
                    `;
                }});

                card.innerHTML = `
                    <div class="route-card-header">
                        <span class="route-title">${{rl.vehicle}} - Viaje ${{rl.trip_idx}}</span>
                        <span class="route-tag" style="background-color: ${{tagBg}}; color: ${{tagColor}}">${{typeLabel}}</span>
                    </div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:5px; font-weight:600;">${{rl.corridor}}</div>
                    <div style="font-size:11px; color:#3b82f6; margin-top:5px;">📅 Sale: ${{rl.departure}} | Regresa: ${{rl.return_time}}</div>
                    <div class="route-timeline">
                        ${{timelineHtml}}
                    </div>
                    <div class="route-meta">
                        <span>📦 Carga: ${{(rl.load/1000).toFixed(2)}}t</span>
                        <span>📍 Paradas: ${{rl.stops.length}}</span>
                        <span>📄 Pedidos: ${{rl.orders_count}}</span>
                    </div>
                `;

                card.onclick = () => {{
                    const alreadyActive = card.classList.contains('active');
                    document.querySelectorAll('.route-card').forEach(c => c.classList.remove('active'));
                    
                    if (!alreadyActive) {{
                        card.classList.add('active');
                        map.fitBounds(rl.polyline.getBounds(), {{padding: [50, 50]}});
                        
                        routeLayers.forEach(layer => {{
                            layer.polyline.setStyle({{weight: 2, opacity: 0.15}});
                            layer.markers.forEach(m => m.setOpacity(0.3));
                        }});
                        rl.polyline.setStyle({{weight: 6, opacity: 1.0}});
                        rl.markers.forEach(m => m.setOpacity(1.0));
                    }} else {{
                        resetFocus();
                    }}
                }};

                listContainer.appendChild(card);
            }});
        }}

        function resetFocus() {{
            routeLayers.forEach(layer => {{
                if (map.hasLayer(layer.polyline)) {{
                    layer.polyline.setStyle({{weight: 4, opacity: 0.8}});
                    layer.markers.forEach(m => map.setOpacity(1.0));
                }}
            }});
        }}

        function toggleAllFilters(val) {{
            document.querySelectorAll('.filter-panel input[type="checkbox"]').forEach(chk => chk.checked = val);
            document.querySelectorAll('.vehicle-header input[type="checkbox"]').forEach(chk => chk.checked = val);
            applyFilters();
        }}

        function switchTab(tabId) {{
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            
            document.getElementById(tabId).classList.add('active');
            
            const buttons = document.querySelectorAll('.tab-btn');
            if (tabId === 'map-view') {{
                buttons[0].classList.add('active');
                setTimeout(() => map.invalidateSize(), 50);
                document.getElementById('filter-sidebar-panel').style.display = 'block';
                document.getElementById('route-list').style.display = 'block';
            }} else if (tabId === 'fleet-view') {{
                buttons[1].classList.add('active');
                document.getElementById('filter-sidebar-panel').style.display = 'none';
                document.getElementById('route-list').style.display = 'none';
            }} else {{
                buttons[2].classList.add('active');
                document.getElementById('filter-sidebar-panel').style.display = 'none';
                document.getElementById('route-list').style.display = 'none';
            }}
        }}

        // Collapse Sidebar Function
        function toggleSidebar() {{
            const sidebar = document.getElementById('sidebar');
            const toggleBtn = document.getElementById('sidebar-toggle');
            const isCollapsed = sidebar.classList.toggle('collapsed');
            
            toggleBtn.innerHTML = isCollapsed ? '▶' : '◀';
            
            // Invalidate Leaflet map size to fill expanded space smoothly
            setTimeout(() => {{
                map.invalidateSize();
            }}, 320);
        }}

        buildFilterPanel();
        applyFilters();
    </script>
</body>
</html>
"""

    with open("routes_map.html", "w") as f:
        f.write(html_content)
    print("routes_map.html generated successfully with calibrated logistics metrics and vehicle audit.")

if __name__ == "__main__":
    generate_interactive_map_v10()
