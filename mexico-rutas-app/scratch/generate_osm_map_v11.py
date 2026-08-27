import json
import math
import time
import urllib.request
import os
import shutil
from datetime import datetime, timedelta
from collections import defaultdict

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

def get_corridor_speed_and_friction(corridor):
    if corridor == "Chiapas (Sur-Oriente)":
        return 52.0, 45.0
    elif corridor == "Oaxaca (Sur-Poniente)":
        return 48.0, 30.0
    elif corridor == "Península (Oriente)":
        return 75.0, 15.0
    elif corridor == "Veracruz Norte & Puebla (Nor-Poniente)":
        return 55.0, 35.0
    elif corridor == "Veracruz Centro-Sur (Local-ish)":
        return 65.0, 10.0
    else:
        return 60.0, 15.0

def calculate_service_time_mins(stop_load):
    tons = stop_load / 1000.0
    return min(150.0, 20.0 + (tons * 5.0))

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

def capacitated_kmeans(jobs, depot, max_capacity, max_stops_per_route, max_iters=40):
    depot_lat, depot_lng = depot
    total_demand = sum(j["demand"] for j in jobs)
    K = max(1, math.ceil(total_demand / max_capacity))
    
    import random
    random.seed(42)
    
    unique_coords = list(set((j["lat"], j["lng"]) for j in jobs))
    if len(unique_coords) < K:
        chosen = unique_coords + [unique_coords[0]] * (K - len(unique_coords))
    else:
        chosen = random.sample(unique_coords, K)
        
    centroids = [{"lat": lat, "lng": lng} for lat, lng in chosen]
    clusters = [[] for _ in range(K)]
    
    for iter_idx in range(max_iters):
        sorted_jobs = sorted(jobs, key=lambda x: x["demand"], reverse=True)
        clusters = [[] for _ in range(K)]
        cluster_demands = [0.0 for _ in range(K)]
        
        for job in sorted_jobs:
            dists = []
            for c_idx, c in enumerate(centroids):
                d = distance_km(job["lat"], job["lng"], c["lat"], c["lng"])
                dists.append((d, c_idx))
            dists.sort()
            
            assigned = False
            for d, c_idx in dists:
                unique_locs = len(set((j["lat"], j["lng"]) for j in clusters[c_idx]))
                is_new_loc = (job["lat"], job["lng"]) not in set((j["lat"], j["lng"]) for j in clusters[c_idx])
                stops_ok = (unique_locs + (1 if is_new_loc else 0)) <= max_stops_per_route
                
                if cluster_demands[c_idx] + job["demand"] <= max_capacity and stops_ok:
                    clusters[c_idx].append(job)
                    cluster_demands[c_idx] += job["demand"]
                    assigned = True
                    break
            
            if not assigned:
                closest_c_idx = dists[0][1]
                clusters[closest_c_idx].append(job)
                cluster_demands[closest_c_idx] += job["demand"]
                
        # Recompute centroids
        centroids_changed = False
        for c_idx in range(K):
            if clusters[c_idx]:
                sum_lat = sum(j["lat"] * j["demand"] for j in clusters[c_idx])
                sum_lng = sum(j["lng"] * j["demand"] for j in clusters[c_idx])
                sum_demand = sum(j["demand"] for j in clusters[c_idx])
                new_lat = sum_lat / sum_demand
                new_lng = sum_lng / sum_demand
            else:
                new_lat = centroids[c_idx]["lat"]
                new_lng = centroids[c_idx]["lng"]
                
            if distance_km(new_lat, new_lng, centroids[c_idx]["lat"], centroids[c_idx]["lng"]) > 0.05:
                centroids_changed = True
            centroids[c_idx] = {"lat": new_lat, "lng": new_lng}
            
        if not centroids_changed:
            break
            
    return [c for c in clusters if c]

def build_plan_routes(plan_type, max_capacity, max_stops, jobs, depot):
    depot_lat, depot_lng = depot
    
    unassigned_jobs = [] # All jobs are assigned
    raw_clusters = capacitated_kmeans(jobs, depot, max_capacity, max_stops)
    
    trips = []
    
    for idx, cluster in enumerate(raw_clusters):
        load = sum(j["demand"] for j in cluster)
        
        # Vehicle selection & FinOps Costs
        if plan_type == 1:
            if load > 17100.0:
                v_type = "Tracto"
                fixed_cost = 10000
                dist_cost_per_km = 15
            else:
                v_type = "Torton"
                fixed_cost = 6000
                dist_cost_per_km = 10
        elif plan_type == 2:
            if load > 17100.0:
                v_type = "Tracto"
                fixed_cost = 10000
                dist_cost_per_km = 15
            elif load > 6650.0:
                v_type = "Torton"
                fixed_cost = 6000
                dist_cost_per_km = 10
            else:
                v_type = "Camioneta 7t"
                fixed_cost = 3500
                dist_cost_per_km = 7
        else:  # plan_type == 3
            if load > 17100.0:
                v_type = "Tracto"
                fixed_cost = 10000
                dist_cost_per_km = 15
            elif load > 7600.0:
                v_type = "Torton"
                fixed_cost = 6000
                dist_cost_per_km = 10
            elif load > 3800.0:
                v_type = "Camioneta 7t"
                fixed_cost = 3500
                dist_cost_per_km = 7
            else:
                v_type = "Camioneta 4t"
                fixed_cost = 2500
                dist_cost_per_km = 5
                
        # Group jobs in cluster by location
        loc_groups = defaultdict(list)
        for job in cluster:
            key = (job["lat"], job["lng"])
            loc_groups[key].append(job)
            
        # Sequence unique locations using Nearest Neighbor
        unvisited = list(loc_groups.keys())
        cur_lat, cur_lng = depot_lat, depot_lng
        loc_sequence = []
        
        while unvisited:
            nearest_idx = 0
            min_d = distance_km(cur_lat, cur_lng, unvisited[0][0], unvisited[0][1])
            for i in range(1, len(unvisited)):
                d = distance_km(cur_lat, cur_lng, unvisited[i][0], unvisited[i][1])
                if d < min_d:
                    min_d = d
                    nearest_idx = i
            selected = unvisited.pop(nearest_idx)
            loc_sequence.append(selected)
            cur_lat, cur_lng = selected[0], selected[1]
            
        # Format sequence of stops
        sequence = []
        for s_idx, loc in enumerate(loc_sequence):
            stop_jobs = loc_groups[loc]
            stop_load = sum(j["demand"] for j in stop_jobs)
            sequence.append({
                "seq": s_idx + 1,
                "lat": loc[0],
                "lng": loc[1],
                "city": get_city_name(loc[0], loc[1]),
                "load": stop_load,
                "jobs": stop_jobs
            })
            
        trips.append({
            "jobs_raw": cluster,
            "load": load,
            "vehicle_type": v_type,
            "fixed_cost": fixed_cost,
            "dist_cost_per_km": dist_cost_per_km,
            "sequence": sequence
        })
        
    # Naming vehicles round-robin (assuming each vehicle can do up to 3 trips)
    max_trips_per_vehicle = 3
    type_indices = defaultdict(int)
    for t in trips:
        v_type = t["vehicle_type"]
        idx = type_indices[v_type]
        v_num = idx // max_trips_per_vehicle + 1
        t["vehicle"] = f"{v_type}_{v_num}"
        t["type"] = v_type
        type_indices[v_type] += 1
        
    # Simulate ETAs
    veh_trips = defaultdict(list)
    for t in trips:
        veh_trips[t["vehicle"]].append(t)
        
    for v_name, v_list in veh_trips.items():
        current_time = datetime.fromisoformat("2026-08-21T06:00:00-05:00")
        for trip_idx, trip in enumerate(v_list):
            trip["trip_idx"] = trip_idx + 1
            if current_time.hour >= 17:
                current_time = current_time.replace(hour=6, minute=0, second=0) + timedelta(days=1)
            elif current_time.hour < 6:
                current_time = current_time.replace(hour=6, minute=0, second=0)
                
            trip["loading_start"] = format_mexico_time(current_time)
            load_hours = 2.0
            if trip["type"] == "Tracto": load_hours = 3.0
            elif trip["type"] == "Torton": load_hours = 2.0
            else: load_hours = 1.0
            
            current_time += timedelta(hours=load_hours)
            trip["departure_time"] = format_mexico_time(current_time)
            
            # Determine corridor by average location
            avg_lat = sum(stop["lat"] for stop in trip["sequence"]) / len(trip["sequence"])
            avg_lng = sum(stop["lng"] for stop in trip["sequence"]) / len(trip["sequence"])
            corridor, speed_kmh, friction_mins = get_corridor_speed_and_friction_details(avg_lat, avg_lng)
            trip["corridor"] = corridor
            
            current_time += timedelta(minutes=friction_mins)
            
            cur_lat, cur_lng = depot_lat, depot_lng
            stops_with_eta = []
            driving_hours_since_break = 0.0
            
            for stop in trip["sequence"]:
                lat = stop["lat"]
                lng = stop["lng"]
                
                dist = distance_km(cur_lat, cur_lng, lat, lng)
                road_dist = dist * 1.3
                drive_time = road_dist / speed_kmh
                
                driving_hours_since_break += drive_time
                if driving_hours_since_break >= 5.0:
                    current_time += timedelta(minutes=30)
                    driving_hours_since_break = 0.0
                    
                current_time += timedelta(hours=drive_time)
                
                if current_time.hour >= 18:
                    current_time = current_time.replace(hour=8, minute=0, second=0) + timedelta(days=1)
                    driving_hours_since_break = 0.0
                    
                eta_str = format_mexico_time(current_time)
                
                service_mins = calculate_service_time_mins(stop["load"])
                current_time += timedelta(minutes=service_mins)
                
                # Format jobs for javascript
                js_jobs = []
                for j in stop["jobs"]:
                    js_jobs.append({
                        "id": j["id"],
                        "demand": j["demand"],
                        "excel_info": j["excel_info"]
                    })
                
                stops_with_eta.append({
                    "seq": stop["seq"],
                    "lat": lat,
                    "lng": lng,
                    "city": stop["city"],
                    "load": stop["load"],
                    "eta": eta_str,
                    "jobs": js_jobs
                })
                cur_lat, cur_lng = lat, lng
                
            dist_back = distance_km(cur_lat, cur_lng, depot_lat, depot_lng)
            road_dist_back = dist_back * 1.3
            drive_time_back = road_dist_back / speed_kmh
            current_time += timedelta(hours=drive_time_back)
            
            trip["arrival_back"] = format_mexico_time(current_time)
            trip["stops_with_eta"] = stops_with_eta
            
    # Calculate final distance, cost, and clean up keys
    for t in trips:
        dist = 0.0
        cur_lat, cur_lng = depot_lat, depot_lng
        for stop in t["stops_with_eta"]:
            dist += distance_km(cur_lat, cur_lng, stop["lat"], stop["lng"]) * 1.3
            cur_lat, cur_lng = stop["lat"], stop["lng"]
        dist += distance_km(cur_lat, cur_lng, depot_lat, depot_lng) * 1.3
        
        t["distance"] = dist
        t["cost"] = t["fixed_cost"] + dist * t["dist_cost_per_km"]
        
    return trips, unassigned_jobs

def get_corridor_speed_and_friction_details(avg_lat, avg_lng):
    if abs(avg_lat - 14.68) < 0.4 or abs(avg_lat - 14.87) < 0.4 or (abs(avg_lat - 16.72) < 0.4 and avg_lng < -92.5):
        return "Chiapas (Sur-Oriente)", 52.0, 45.0
    elif abs(avg_lat - 18.14) < 0.3 and avg_lng < -94.0:
        return "Veracruz Centro-Sur (Local-ish)", 65.0, 10.0
    elif abs(avg_lat - 17.97) < 0.15:
        return "Veracruz Centro-Sur (Local-ish)", 65.0, 10.0
    elif abs(avg_lat - 16.44) < 0.4 or abs(avg_lat - 16.32) < 0.4 or abs(avg_lat - 16.79) < 0.4:
        return "Oaxaca (Sur-Poniente)", 48.0, 30.0
    elif abs(avg_lat - 20.93) < 0.4:
        return "Península (Oriente)", 75.0, 15.0
    else:
        return "Veracruz Norte & Puebla (Nor-Poniente)", 55.0, 35.0

def generate_interactive_map_v11():
    depot_lat = 18.977181191414243
    depot_lng = -97.02969533244169
    
    with open("problem_VH.json") as f:
        problem_data = json.load(f)
    jobs = problem_data["plan"]["jobs"]
    
    # Load processed Excel data
    with open("mexico-rutas-app/scratch/prueba_a.json") as f:
        excel_rows = json.load(f)
        
    job_items = []
    for idx, j in enumerate(jobs):
        place = j["tasks"]["deliveries"][0]["places"][0]
        lat = place["location"]["lat"]
        lng = place["location"]["lng"]
        demand = j["tasks"]["deliveries"][0]["demand"][0] / 1000.0  # to kg
        
        job_items.append({
            "id": j["id"],
            "lat": lat,
            "lng": lng,
            "demand": demand,
            "excel_info": excel_rows[idx]
        })
        
    depot = (depot_lat, depot_lng)
    
    # Generate all three plans
    print("Solving Plan 1 (Máxima Consolidación)...")
    plan1_trips, plan1_unassigned = build_plan_routes(1, 28500.0, 15, job_items, depot)
    plan2_trips, plan2_unassigned = build_plan_routes(2, 17100.0, 8, job_items, depot)
    plan3_trips, plan3_unassigned = build_plan_routes(3, 7600.0, 4, job_items, depot)
    
    # Fetch road geometries
    print("Calling OSRM API for Plan 1 road geometries...")
    for idx, t in enumerate(plan1_trips):
        coords = [(depot_lat, depot_lng)]
        for stop in t["stops_with_eta"]:
            coords.append((stop["lat"], stop["lng"]))
        coords.append((depot_lat, depot_lng))
        t["road_geometry"] = get_road_route_osrm(coords)
        print(f"  Plan 1 Trip {idx+1}/{len(plan1_trips)} fetched.")
        time.sleep(0.2)
        
    print("Calling OSRM API for Plan 2 road geometries...")
    for idx, t in enumerate(plan2_trips):
        coords = [(depot_lat, depot_lng)]
        for stop in t["stops_with_eta"]:
            coords.append((stop["lat"], stop["lng"]))
        coords.append((depot_lat, depot_lng))
        t["road_geometry"] = get_road_route_osrm(coords)
        print(f"  Plan 2 Trip {idx+1}/{len(plan2_trips)} fetched.")
        time.sleep(0.2)
        
    print("Calling OSRM API for Plan 3 road geometries...")
    for idx, t in enumerate(plan3_trips):
        coords = [(depot_lat, depot_lng)]
        for stop in t["stops_with_eta"]:
            coords.append((stop["lat"], stop["lng"]))
        coords.append((depot_lat, depot_lng))
        t["road_geometry"] = get_road_route_osrm(coords)
        print(f"  Plan 3 Trip {idx+1}/{len(plan3_trips)} fetched.")
        time.sleep(0.2)
        
    # Format JavaScript colors
    colors = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4"]
    
    def serialize_routes_js(trips):
        js_routes = []
        for idx, t in enumerate(trips):
            color = colors[idx % len(colors)]
            total_jobs = sum(len(stop["jobs"]) for stop in t["stops_with_eta"])
            js_routes.append({
                "vehicle": t["vehicle"],
                "type": t["type"],
                "trip_idx": t["trip_idx"],
                "corridor": t["corridor"],
                "load": float(t["load"]),
                "distance": float(t["distance"]),
                "cost": float(t["cost"]),
                "color": color,
                "departure": t["departure_time"],
                "return_time": t["arrival_back"],
                "stops": t["stops_with_eta"],
                "road_geometry": t["road_geometry"],
                "orders_count": total_jobs
            })
        return js_routes
        
    plan1_js = {
        "routes": serialize_routes_js(plan1_trips),
        "unassigned": plan1_unassigned
    }
    plan2_js = {
        "routes": serialize_routes_js(plan2_trips),
        "unassigned": plan2_unassigned
    }
    plan3_js = {
        "routes": serialize_routes_js(plan3_trips),
        "unassigned": plan3_unassigned
    }
    
    # Calculate metrics for the comparison table
    def get_plan_metrics(js_routes):
        total_dist = sum(r["distance"] for r in js_routes)
        total_cost = sum(r["cost"] for r in js_routes)
        trips_count = len(js_routes)
        
        # Vehicle mix description
        mix = defaultdict(int)
        for r in js_routes:
            mix[r["type"]] += 1
        mix_str = " / ".join(f"{count} {v_type}" for v_type, count in mix.items())
        
        # Ocupacion
        total_load = sum(r["load"] for r in js_routes)
        total_cap = 0
        for r in js_routes:
            if r["type"] == 'Tracto': total_cap += 30000
            elif r["type"] == 'Torton': total_cap += 18000
            elif r["type"] == 'Camioneta 7t': total_cap += 7000
            elif r["type"] == 'Camioneta 4t': total_cap += 4000
        avg_util = (total_load / total_cap * 100.0) if total_cap > 0 else 0.0
        
        # Duration estimation
        active_duration = 0.0
        for t in js_routes:
            speed_kmh, friction_mins = get_corridor_speed_and_friction(t["corridor"])
            drive_time = t["distance"] / speed_kmh
            breaks = math.floor(drive_time / 5.0)
            service_mins = sum(calculate_service_time_mins(stop["load"]) for stop in t["stops"])
            load_hours = 3.0 if t["type"] == 'Tracto' else 2.0 if t["type"] == 'Torton' else 1.0
            active_duration += (load_hours + drive_time + (service_mins / 60.0) + breaks * 0.5 + (friction_mins / 60.0))
            
        return total_dist, total_cost, trips_count, mix_str, avg_util, active_duration
        
    p1_dist, p1_cost, p1_trips, p1_mix, p1_util, p1_dur = get_plan_metrics(plan1_js["routes"])
    p2_dist, p2_cost, p2_trips, p2_mix, p2_util, p2_dur = get_plan_metrics(plan2_js["routes"])
    p3_dist, p3_cost, p3_trips, p3_mix, p3_util, p3_dur = get_plan_metrics(plan3_js["routes"])
    
    # Write HTML contents
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
        }}

        .plan-selector-bar {{
            background: #1e293b;
            border-bottom: 1px solid var(--border-color);
            padding: 10px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 45px;
            z-index: 1000;
        }}

        .plan-selector-container {{
            display: flex;
            align-items: center;
            gap: 12px;
        }}

        .plan-selector-label {{
            font-weight: 600;
            font-size: 14px;
            color: #3b82f6;
        }}

        .plan-select {{
            background: #0f172a;
            color: white;
            border: 1px solid #475569;
            padding: 6px 12px;
            border-radius: 6px;
            font-family: inherit;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            outline: none;
            transition: all 0.2s ease;
        }}

        .plan-select:hover {{
            border-color: #3b82f6;
        }}

        .btn-download-plan {{
            background: #10b981;
            color: white;
            border: none;
            padding: 6px 15px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
        }}

        .btn-download-plan:hover {{
            background: #059669;
            box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);
        }}

        .sidebar {{
            width: 380px;
            background-color: var(--bg-sidebar);
            border-right: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            height: calc(100vh - 65px);
            margin-top: 65px;
            transition: all 0.3s ease;
            position: relative;
            z-index: 999;
        }}
        
        .sidebar.collapsed {{
            margin-left: -380px;
        }}
        
        .sidebar-toggle-btn {{
            position: absolute;
            right: -30px;
            top: 20px;
            width: 30px;
            height: 45px;
            background-color: var(--bg-sidebar);
            border: 1px solid var(--border-color);
            border-left: none;
            color: var(--text-main);
            border-radius: 0 8px 8px 0;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 4px 0 10px rgba(0,0,0,0.15);
            z-index: 1000;
            outline: none;
        }}

        .sidebar-toggle-btn:hover {{
            background-color: #334155;
            color: #3b82f6;
        }}
        
        .sidebar-header {{
            padding: 15px 20px;
            border-bottom: 1px solid var(--border-color);
        }}
        
        .sidebar-header h1 {{
            margin: 0;
            font-size: 16px;
            font-weight: 700;
            letter-spacing: 0.5px;
        }}
        
        .tab-selector {{
            display: flex;
            background-color: #0f172a;
            border-radius: 8px;
            padding: 3px;
            margin-top: 10px;
        }}
        
        .tab-btn {{
            flex: 1;
            background: none;
            border: none;
            color: var(--text-muted);
            padding: 6px;
            font-size: 12px;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }}
        
        .tab-btn.active {{
            background-color: var(--accent-color);
            color: white;
        }}
        
        .filter-panel {{
            padding: 15px 20px;
            border-bottom: 1px solid var(--border-color);
            background-color: rgba(15, 23, 42, 0.4);
        }}
        
        .filter-title {{
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            color: var(--text-muted);
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
        }}
        
        .filter-btn-link {{
            background: none;
            border: none;
            color: var(--accent-color);
            font-size: 11px;
            cursor: pointer;
            padding: 0;
            font-weight: 600;
        }}
        
        .nested-filters {{
            max-height: 140px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding-right: 5px;
        }}
        
        .vehicle-group {{
            border-left: 2px solid #475569;
            padding-left: 10px;
            margin-bottom: 8px;
        }}
        
        .vehicle-header {{
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            font-weight: 600;
            color: var(--text-main);
        }}
        
        .trip-list-filter {{
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-top: 4px;
            padding-left: 10px;
        }}
        
        .trip-filter-item {{
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            color: var(--text-muted);
        }}
        
        .trip-filter-item .color-dot {{
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--trip-color);
            display: inline-block;
        }}
        
        .sidebar-header-panel {{
            padding: 15px;
            border-bottom: 1px solid var(--border-color);
            background: rgba(15, 23, 42, 0.4);
        }}
        .total-trips-title {{
            font-weight: 700;
            font-size: 11px;
            color: #60a5fa;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        .category-filters {{
            display: flex;
            gap: 5px;
            margin-top: 8px;
        }}
        .cat-filter-btn {{
            flex: 1;
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            color: var(--text-muted);
            font-size: 10px;
            font-weight: 700;
            padding: 6px 0;
            cursor: pointer;
            text-align: center;
            transition: all 0.2s ease;
            font-family: 'Outfit', sans-serif;
        }}
        .cat-filter-btn:hover {{
            background: rgba(51, 65, 85, 0.8);
            color: #f1f5f9;
        }}
        .cat-filter-btn.active {{
            background: #2563eb;
            color: #ffffff;
            border-color: #3b82f6;
            box-shadow: 0 0 8px rgba(37, 99, 235, 0.4);
        }}
        
        .route-list {{
            flex: 1;
            overflow-y: auto;
            padding: 15px 20px;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }}
        
        .route-card {{
            background-color: rgba(30, 41, 59, 0.5);
            border: 1px solid var(--border-color);
            border-left: 4px solid var(--route-color);
            border-radius: 8px;
            padding: 12px 15px;
            cursor: pointer;
            transition: all 0.2s;
        }}
        
        .route-card:hover {{
            background-color: rgba(30, 41, 59, 0.8);
            border-color: #475569;
        }}
        
        .route-card.active {{
            background-color: var(--route-color-alpha);
            border-color: var(--route-color);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }}
        
        .route-card-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        
        .route-title {{
            font-weight: 700;
            font-size: 13px;
        }}
        
        .route-tag {{
            font-size: 10px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 4px;
        }}
        
        .route-timeline {{
            margin-top: 10px;
            border-left: 1px dashed #475569;
            padding-left: 10px;
            margin-left: 5px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }}
        
        .timeline-stop {{
            font-size: 11px;
            color: var(--text-muted);
            line-height: 1.4;
        }}
        
        .timeline-stop .stop-eta {{
            color: #60a5fa;
            font-weight: 700;
            font-family: monospace;
            margin-right: 4px;
        }}
        
        .route-meta {{
            margin-top: 10px;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: var(--text-muted);
            border-top: 1px solid rgba(255,255,255,0.05);
            padding-top: 8px;
        }}
        
        .main-content {{
            flex: 1;
            height: calc(100vh - 65px);
            margin-top: 65px;
            position: relative;
        }}
        
        #map {{
            width: 100%;
            height: 100%;
        }}
        
        .tab-content {{
            display: none;
            width: 100%;
            height: 100%;
            overflow-y: auto;
        }}
        
        .tab-content.active {{
            display: block;
        }}
        
        .fleet-view-container {{
            padding: 30px;
            background-color: var(--bg-main);
        }}
        
        .fleet-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }}
        
        .vehicle-card-detailed {{
            background-color: var(--bg-sidebar);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }}
        
        .vehicle-card-detailed-header {{
            background-color: rgba(15, 23, 42, 0.6);
            padding: 12px 18px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        
        .vehicle-card-detailed-header .v-name {{
            font-weight: 700;
            font-size: 14px;
        }}
        
        .vehicle-card-detailed-header .v-trips-count {{
            font-size: 11px;
            font-weight: 600;
            color: var(--text-muted);
        }}
        
        .v-summary-row {{
            display: flex;
            justify-content: space-between;
            padding: 15px 18px;
            background-color: rgba(15, 23, 42, 0.2);
            border-bottom: 1px solid rgba(255,255,255,0.03);
        }}
        
        .v-summary-row .lbl {{
            display: block;
            font-size: 10px;
            color: var(--text-muted);
            text-transform: uppercase;
            font-weight: 600;
        }}
        
        .v-summary-row .val {{
            font-size: 13px;
            font-weight: 700;
            margin-top: 2px;
        }}
        
        .v-trips-list {{
            padding: 15px 18px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }}
        
        .v-trip-row {{
            border-bottom: 1px solid rgba(255,255,255,0.03);
            padding-bottom: 12px;
        }}
        
        .v-trip-row:last-child {{
            border: none;
            padding: 0;
        }}
        
        .v-trip-row-header {{
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            margin-bottom: 6px;
        }}
        
        .v-trip-row-header .trip-idx {{
            font-weight: 700;
        }}
        
        .v-trip-row-header .trip-load {{
            color: var(--text-muted);
        }}
        
        .v-progress-bar-bg {{
            background-color: #0f172a;
            height: 6px;
            border-radius: 3px;
            overflow: hidden;
            margin: 6px 0;
        }}
        
        .v-progress-bar-fill {{
            height: 100%;
            border-radius: 3px;
        }}
        
        .v-fill-green {{ background-color: #10b981; }}
        .v-fill-yellow {{ background-color: #eab308; }}
        .v-fill-orange {{ background-color: #f97316; }}
        
        .v-trip-row-footer {{
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: var(--text-muted);
        }}
        
        .dashboard-container {{
            padding: 30px;
            background-color: var(--bg-main);
        }}
        
        .dashboard-title {{
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 20px;
            color: #f8fafc;
            border-left: 4px solid #3b82f6;
            padding-left: 10px;
        }}
        
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }}
        
        .stat-card {{
            background-color: var(--bg-sidebar);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }}
        
        .stat-card-title {{
            font-size: 11px;
            font-weight: 700;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        
        .stat-card-value {{
            font-size: 22px;
            font-weight: 700;
            margin: 8px 0;
            color: #f8fafc;
        }}
        
        .stat-card-sub {{
            font-size: 11px;
            color: var(--text-muted);
        }}
        
        .dashboard-row {{
            display: grid;
            grid-template-columns: 1.3fr 1fr;
            gap: 25px;
            margin-bottom: 30px;
        }}
        
        .dashboard-card {{
            background-color: var(--bg-sidebar);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }}
        
        .dashboard-card-title {{
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 8px;
            text-transform: uppercase;
            font-size: 12px;
            color: #3b82f6;
        }}
        
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }}
        
        th, td {{
            padding: 10px 12px;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
        }}
        
        th {{
            font-weight: 600;
            color: var(--text-muted);
            background-color: rgba(15, 23, 42, 0.4);
        }}
        
        .win-tag {{
            background-color: rgba(16, 185, 129, 0.1);
            color: #10b981;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 700;
            font-size: 9px;
            text-transform: uppercase;
        }}
        
        .chart-container {{
            display: flex;
            flex-direction: column;
            gap: 12px;
        }}
        
        .chart-row {{
            display: flex;
            align-items: center;
            gap: 15px;
        }}
        
        .chart-label {{
            width: 130px;
            font-size: 11px;
            font-weight: 600;
            color: var(--text-muted);
        }}
        
        .chart-bar-wrapper {{
            flex: 1;
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        
        .chart-bar {{
            height: 16px;
            background-color: #3b82f6;
            border-radius: 4px;
        }}
        
        .chart-bar.winner {{
            background-color: #10b981;
        }}
        
        .chart-bar-value {{
            font-size: 11px;
            font-weight: 700;
            min-width: 60px;
        }}

        .map-selector-control {{
            background-color: var(--bg-sidebar);
            border: 1px solid var(--border-color);
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            color: white;
            font-size: 12px;
        }}

        .map-selector-title {{
            font-weight: 700;
            margin-bottom: 6px;
            color: #3b82f6;
            text-transform: uppercase;
            font-size: 10px;
        }}

        .map-selector-option {{
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
            cursor: pointer;
        }}

        .map-selector-option input {{
            margin: 0;
        }}

        .map-selector-option:last-child {{
            margin-bottom: 0;
        }}

        .marker-pin-circle {{
            width: 22px;
            height: 22px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: 11px;
            border: 2px solid white;
            box-shadow: 0 2px 5px rgba(0,0,0,0.4);
            text-align: center;
            cursor: pointer;
            transition: transform 0.1s ease;
        }}
        .marker-pin-circle:hover {{
            transform: scale(1.2);
        }}
        .custom-stop-tooltip {{
            background-color: #0f172a;
            border: 1px solid #334155;
            color: #f1f5f9;
            font-size: 11px;
            font-weight: 700;
            border-radius: 4px;
            padding: 4px 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            font-family: 'Outfit', sans-serif;
        }}
    </style>
</head>
<body>
    <div class="plan-selector-bar">
        <div class="plan-selector-container">
            <span class="plan-selector-label">📋 SELECCIONAR PLAN LOGÍSTICO:</span>
            <select id="plan-select" class="plan-select" onchange="changePlan(this.value)">
                <option value="plan1">Plan 1: Máxima Consolidación (Tractos y Tortons)</option>
                <option value="plan2" selected>Plan 2: Flota Balanceada (Mix Tracto, Torton y 7t)</option>
                <option value="plan3">Plan 3: Flota Capilar (Camionetas 7t y 4t)</option>
            </select>
        </div>
        <button class="btn-download-plan" onclick="downloadActivePlanCSV()">
            <span>💾 Descargar Plan Activo (CSV)</span>
        </button>
    </div>

    <div class="sidebar">
        <button class="sidebar-toggle-btn" id="sidebar-toggle" onclick="toggleSidebar()">◀</button>
        <div class="sidebar-header">
            <h1>CONTROL DE DESPACHO</h1>
            <div class="tab-selector">
                <button class="tab-btn active" onclick="switchTab('map-view')">Mapa de Rutas</button>
                <button class="tab-btn" onclick="switchTab('fleet-view')">Flota / Ocupación</button>
                <button class="tab-btn" onclick="switchTab('stats-view')">Panel KPIs</button>
            </div>
        </div>
        
        <div class="sidebar-header-panel" id="filter-sidebar-panel">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span class="total-trips-title">Viajes Programados (<span id="total-trips-count">0</span>)</span>
                <div style="display:flex; gap: 8px;">
                    <button class="filter-btn-link" onclick="toggleAllFilters(true)">Mostrar todo</button>
                    <button class="filter-btn-link" onclick="toggleAllFilters(false)" style="color:#f87171;">Ocultar todo</button>
                </div>
            </div>
            <div class="category-filters">
                <button class="cat-filter-btn active" id="btn-cat-all" onclick="filterByVehicleCategory('all')">Todos</button>
                <button class="cat-filter-btn" id="btn-cat-Tracto" onclick="filterByVehicleCategory('Tracto')">Tractos</button>
                <button class="cat-filter-btn" id="btn-cat-Torton" onclick="filterByVehicleCategory('Torton')">Tortones</button>
                <button class="cat-filter-btn" id="btn-cat-Camioneta" onclick="filterByVehicleCategory('Camioneta')">Camionetas</button>
            </div>
        </div>

        <div id="unassigned-panel" class="filter-panel" style="border-top: 1px solid var(--border-color); display:none; background-color: rgba(239, 68, 68, 0.08); max-height: 250px; overflow-y: auto;">
            <div class="filter-title" style="color: #f87171; font-weight: 700; margin-bottom: 10px;">
                <span>⚠️ PEDIDOS SIN ASIGNAR (<span id="unassigned-count">0</span>)</span>
            </div>
            <div id="unassigned-list" style="display:flex; flex-direction:column; gap:8px;">
                <!-- Populated dynamically -->
            </div>
        </div>
        
        <div class="sidebar-instructions" id="sidebar-instructions" style="padding: 10px 15px 5px 15px; font-size: 11px; color: #94a3b8; border-top: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px;">
            <span>💡</span>
            <span><strong>Tip:</strong> Haz clic en un viaje para ubicarlo y hacer zoom en sus paradas.</span>
        </div>

        <div class="route-list" id="route-list">
            <!-- Javascript will populate -->
        </div>
    </div>
    
    <div class="main-content">
        <!-- Map View Tab -->
        <div id="map-view" class="tab-content active">
            <div id="map"></div>
        </div>
        
        <!-- Fleet View Tab -->
        <div id="fleet-view" class="tab-content">
            <div class="fleet-view-container">
                <div class="dashboard-title">🚛 Capacidad de Carga y Ocupación por Unidad</div>
                <div class="fleet-grid">
                    <!-- Javascript will populate -->
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
                        <div id="kpi-distance" class="stat-card-value">0.0 km</div>
                        <div class="stat-card-sub">Red de Carreteras OSRM</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-title">Viajes Necesarios</div>
                        <div id="kpi-trips" class="stat-card-value">0</div>
                        <div class="stat-card-sub" style="color: #60a5fa;">Mínimo Necesario</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-title">Carga Entregada</div>
                        <div id="kpi-load" class="stat-card-value">0.0t</div>
                        <div class="stat-card-sub" style="color: #60a5fa;">100% de Pedidos Surtidos</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-title">Costo Total Estimado</div>
                        <div id="kpi-cost" class="stat-card-value">$0 MXN</div>
                        <div class="stat-card-sub" style="color: #34d399;">Costo Fijo + Costo km</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-title">Eficiencia de Capacidad</div>
                        <div id="kpi-utilization" class="stat-card-value">0.0%</div>
                        <div class="stat-card-sub">Con margen de seguridad del 95%</div>
                    </div>
                </div>
                
                <div class="dashboard-row">
                    <!-- Comparison Table -->
                    <div class="dashboard-card">
                        <div class="dashboard-card-title">Análisis Comparativo de Planes Logísticos</div>
                        <div class="table-responsive">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Plan de Flota</th>
                                        <th>Viajes Totales</th>
                                        <th>Flota Sugerida (Mix)</th>
                                        <th>Distancia Recorrida</th>
                                        <th>Costo Total</th>
                                        <th>Eficiencia Cap.</th>
                                        <th>Dictamen</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style="font-weight: 600;">Plan 1: Flota Consolidada (Máxima Capacidad)</td>
                                        <td style="font-weight: 700;">{p1_trips}</td>
                                        <td>{p1_mix}</td>
                                        <td>{p1_dist:,.1f} km</td>
                                        <td style="font-weight: 700;">${p1_cost:,.2f}</td>
                                        <td>{p1_util:.1f}%</td>
                                        <td><span class="win-tag" style="background-color:rgba(59,130,246,0.1); color:#60a5fa;">Consolidación</span></td>
                                    </tr>
                                    <tr style="background-color: rgba(16, 185, 129, 0.05);">
                                        <td style="font-weight: 600; color: #34d399;">🌟 Plan 2: Flota Balanceada (Óptimo Logístico)</td>
                                        <td style="font-weight: 700; color: #34d399;">{p2_trips}</td>
                                        <td>{p2_mix}</td>
                                        <td>{p2_dist:,.1f} km</td>
                                        <td style="font-weight: 700; color: #34d399;">${p2_cost:,.2f}</td>
                                        <td>{p2_util:.1f}%</td>
                                        <td><span class="win-tag">RECOMENDADO</span></td>
                                    </tr>
                                    <tr>
                                        <td style="font-weight: 600;">Plan 3: Flota Ágil (Distribución Capilar)</td>
                                        <td style="font-weight: 700;">{p3_trips}</td>
                                        <td>{p3_mix}</td>
                                        <td>{p3_dist:,.1f} km</td>
                                        <td style="font-weight: 700;">${p3_cost:,.2f}</td>
                                        <td>{p3_util:.1f}%</td>
                                        <td><span class="win-tag" style="background-color:rgba(245,158,11,0.1); color:#f59e0b;">Máxima Agilidad</span></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        
                        <p style="font-size: 12px; color: var(--text-muted); margin-top: 20px; line-height: 1.6;">
                            <strong>Nueva Arquitectura de Agrupación (Capacitated K-Means):</strong> Hemos reemplazado el anterior <em>Barrido Polar Angular</em> por un algoritmo de <strong>K-Means con Capacidad Acotada</strong>. El K-Means agrupa a los clientes basándose en su proximidad espacial 2D directa, creando "burbujas" compactas de entrega geográficamente coherentes. Esto evita el cruzamiento radial de líneas en el mapa y ofrece rutas más intuitivas para los choferes y despachadores logísticos.
                        </p>
                    </div>
                    
                    <!-- Graph -->
                    <div class="dashboard-card">
                        <div class="dashboard-card-title">Comparativa de Costo de Escenarios (MXN)</div>
                        <div class="chart-container">
                            <div class="chart-row">
                                <div class="chart-label">Plan 1: Consolidado</div>
                                <div class="chart-bar-wrapper">
                                    <div class="chart-bar" style="width: {int(p1_cost/max(p1_cost, p2_cost, p3_cost)*100)}%;"></div>
                                    <span class="chart-bar-value">${p1_cost:,.0f}</span>
                                </div>
                            </div>
                            <div class="chart-row">
                                <div class="chart-label">Plan 2: Balanceado</div>
                                <div class="chart-bar-wrapper">
                                    <div class="chart-bar winner" style="width: {int(p2_cost/max(p1_cost, p2_cost, p3_cost)*100)}%;"></div>
                                    <span class="chart-bar-value">${p2_cost:,.0f}</span>
                                </div>
                            </div>
                            <div class="chart-row">
                                <div class="chart-label">Plan 3: Capilar</div>
                                <div class="chart-bar-wrapper">
                                    <div class="chart-bar" style="width: {int(p3_cost/max(p1_cost, p2_cost, p3_cost)*100)}%;"></div>
                                    <span class="chart-bar-value">${p3_cost:,.0f}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="dashboard-card-title" style="margin-top: 30px;">Comparativa de Distancia (km)</div>
                        <div class="chart-container">
                            <div class="chart-row">
                                <div class="chart-label">Plan 1: Consolidado</div>
                                <div class="chart-bar-wrapper">
                                    <div class="chart-bar winner" style="width: {int(p1_dist/max(p1_dist, p2_dist, p3_dist)*100)}%;"></div>
                                    <span class="chart-bar-value">{p1_dist:,.0f} km</span>
                                </div>
                            </div>
                            <div class="chart-row">
                                <div class="chart-label">Plan 2: Balanceado</div>
                                <div class="chart-bar-wrapper">
                                    <div class="chart-bar" style="width: {int(p2_dist/max(p1_dist, p2_dist, p3_dist)*100)}%;"></div>
                                    <span class="chart-bar-value">{p2_dist:,.0f} km</span>
                                </div>
                            </div>
                            <div class="chart-row">
                                <div class="chart-label">Plan 3: Capilar</div>
                                <div class="chart-bar-wrapper">
                                    <div class="chart-bar" style="width: {int(p3_dist/max(p1_dist, p2_dist, p3_dist)*100)}%;"></div>
                                    <span class="chart-bar-value">{p3_dist:,.0f} km</span>
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
        const plans = {{
            plan1: {json.dumps(plan1_js, indent=2)},
            plan2: {json.dumps(plan2_js, indent=2)},
            plan3: {json.dumps(plan3_js, indent=2)}
        }};

        let activeRoutes = plans.plan2.routes; // Default plan is Balanceado
        let activeCategoryFilter = 'all';
        let routeVisibility = {{}}; // Map of routeKey -> boolean
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

        const LegendControl = L.Control.extend({{
            options: {{ position: 'bottomright' }},
            onAdd: function (map) {{
                const div = L.DomUtil.create('div', 'map-legend-control');
                div.style.background = 'rgba(15, 23, 42, 0.9)';
                div.style.border = '1px solid #334155';
                div.style.borderRadius = '8px';
                div.style.padding = '10px 14px';
                div.style.color = '#f1f5f9';
                div.style.fontFamily = "'Outfit', sans-serif";
                div.style.fontSize = '11px';
                div.style.lineHeight = '1.4';
                div.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                div.style.pointerEvents = 'auto';
                div.innerHTML = `
                    <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                        <span>🗺️</span> GUÍA DEL MAPA
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; border: 1.5px solid #fff;"></span>
                            <span>Cada color es un <strong>Viaje único</strong> (Clúster)</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="display: inline-block; width: 18px; height: 18px; border-radius: 50%; background: #1e293b; border: 1.5px solid #fff; color: #fff; font-size: 10px; font-weight: 800; text-align: center; line-height: 15px;">2</span>
                            <span>El número indica el <strong>Orden de secuencia</strong></span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span>🏠</span>
                            <span>Centro de Distribución (<strong>CEDI Orizaba</strong>)</span>
                        </div>
                    </div>
                `;
                L.DomEvent.disableClickPropagation(div);
                return div;
            }}
        }});
        map.addControl(new LegendControl());

        function changeBaseMap(type) {{
            map.removeLayer(tilesDark);
            map.removeLayer(tilesLight);
            map.removeLayer(tilesSatellite);
            
            if (type === 'dark') tilesDark.addTo(map);
            if (type === 'light') tilesLight.addTo(map);
            if (type === 'satellite') tilesSatellite.addTo(map);
        }}

        const depotIcon = L.divIcon({{
            className: 'custom-div-icon',
            html: '<div class="depot-pin"><span>🏠</span></div>',
        }});
        
        let routeLayers = [];

        function renderMapRoutes() {{
            // Remove existing layers
            routeLayers.forEach(rl => {{
                map.removeLayer(rl.polyline);
                rl.markers.forEach(m => map.removeLayer(m));
            }});
            routeLayers = [];

            // Draw new active routes
            activeRoutes.forEach((route, idx) => {{
                const routeKey = `route_${{idx}}`;

                // Draw invisible polyline so bounding calculations still work
                const polyline = L.polyline(route.road_geometry, {{
                    color: route.color,
                    weight: 0,
                    opacity: 0
                }});

                // Initialize visibility state if not set
                if (routeVisibility[routeKey] === undefined) {{
                    routeVisibility[routeKey] = true;
                }}

                const markers = [];
                route.stops.forEach(s => {{
                    const parts = s.eta.split(" ");
                    const timeStr = parts[1] + " " + parts[2];
                    
                    const markerHtml = `<div class="marker-pin-circle" style="background-color: ${{route.color}}">${{s.seq}}</div>`;

                    const icon = L.divIcon({{
                        className: 'custom-div-icon',
                        html: markerHtml,
                        iconSize: [22, 22],
                        iconAnchor: [11, 11]
                    }});

                    let jobsDetailsHtml = '';
                    s.jobs.forEach(job => {{
                        const ex = job.excel_info;
                        jobsDetailsHtml += `
                            <div style="background:#1e293b; border:1px solid #334155; border-radius:8px; padding:12px; margin-top:8px; font-size:11px; color:#f1f5f9; box-shadow:0 2px 4px rgba(0,0,0,0.15); font-family:'Outfit',sans-serif;">
                                <div style="color:#60a5fa; font-weight:700; font-size:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px; margin-bottom:6px; display:flex; justify-content:space-between;">
                                    <span>📦 ${{ex.pedido}}</span>
                                    <span>⚖️ ${{Math.round(job.demand).toLocaleString()}} kg</span>
                                </div>
                                <div style="margin-bottom:4px;"><strong>Cliente:</strong> ${{ex.cliente}} - ${{ex.nombre}}</div>
                                <div style="margin-bottom:4px;"><strong>Sucursal:</strong> ${{ex.sucursal || '0'}}</div>
                                <div style="margin-bottom:6px; border-top:1px dashed rgba(255,255,255,0.05); padding-top:6px; line-height:1.3;">
                                    <strong>Dirección de Entrega:</strong><br/>
                                    ${{ex.direccion}}, Col. ${{ex.colonia || ''}}, CP ${{ex.cp || ''}}, ${{ex.poblacion}}, ${{ex.estado}}
                                </div>
                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-bottom:6px; background:rgba(0,0,0,0.15); padding:6px; border-radius:4px;">
                                    <div><strong>Almacén:</strong> ${{ex.almacen || 'CISAALMA'}}</div>
                                    <div><strong>Estatus:</strong> ${{ex.estatus || 'PENDIENTE'}}</div>
                                    <div><strong>Emisión:</strong> ${{ex.fecha_emision || ''}}</div>
                                    <div><strong>Requerida:</strong> ${{ex.fecha_requerida || ''}}</div>
                                </div>
                                <div style="margin-bottom:4px; color:#eab308; line-height:1.2;">
                                    <strong>Cita / Instrucciones:</strong><br/>
                                    ${{ex.agente || 'Sin especificaciones'}}
                                </div>
                                <div style="margin-bottom:4px; display:flex; justify-content:space-between; color:#10b981; font-weight:600;">
                                    <span>Importe: $${{parseFloat(ex.importe_total || 0).toLocaleString()}} MXN</span>
                                    <span>Condiciones: ${{ex.condiciones || ''}}</span>
                                </div>
                                <div style="color:#94a3b8; font-size:10px; border-top:1px solid rgba(255,255,255,0.05); padding-top:4px; margin-top:4px; line-height:1.2;">
                                    <strong>Observaciones:</strong><br/>
                                    ${{ex.observaciones || 'Ninguna'}}
                                </div>
                            </div>
                        `;
                    }});

                    const popupHtml = `
                        <div style="padding:5px; min-width:300px; max-height:400px; overflow-y:auto; font-family:'Outfit',sans-serif;">
                            <div class="popup-title" style="color: ${{route.color}}; font-weight:700; font-size:13.5px; border-bottom:1px solid #334155; padding-bottom:6px; margin-bottom:8px;">
                                📍 Parada ${{s.seq}} - ${{s.city}}
                            </div>
                            <div style="font-size:11px; margin-bottom:6px; color:#94a3b8; display:flex; justify-content:space-between;">
                                <span><strong>Vehículo:</strong> ${{route.vehicle}} (${{route.type}})</span>
                                <span><strong>ETA:</strong> ${{s.eta}}</span>
                            </div>
                            <div style="font-size:11px; margin-bottom:6px; color:#94a3b8;">
                                <strong>Carga Total Parada:</strong> ${{Math.round(s.load).toLocaleString()}} kg
                            </div>
                            ${{jobsDetailsHtml}}
                        </div>
                    `;

                    const m = L.marker([s.lat, s.lng], {{icon: icon}})
                        .bindPopup(popupHtml);
                    
                    m.bindTooltip(`<strong>${{route.vehicle}}</strong><br>Parada ${{s.seq}} de ${{route.stops.length}}`, {{
                        permanent: false,
                        direction: 'top',
                        className: 'custom-stop-tooltip'
                    }});
                    
                    markers.push(m);
                }});

                const routeLayerObj = {{
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
                    orders_count: route.orders_count,
                    distance: route.distance,
                    cost: route.cost
                }};

                routeLayers.push(routeLayerObj);

                // Add to map only if category matches and visibility is true
                const matchesCat = activeCategoryFilter === 'all' || 
                                   (activeCategoryFilter === 'Tracto' && route.type === 'Tracto') || 
                                   (activeCategoryFilter === 'Torton' && route.type === 'Torton') || 
                                   (activeCategoryFilter === 'Camioneta' && route.type.includes('Camioneta'));

                if (matchesCat && routeVisibility[routeKey]) {{
                    polyline.addTo(map);
                    markers.forEach(m => m.addTo(map));
                }}
            }});
        }}

        function toggleRouteVisibility(routeKey, isChecked) {{
            routeVisibility[routeKey] = isChecked;
            
            const rl = routeLayers.find(layer => layer.key === routeKey);
            if (rl) {{
                if (isChecked) {{
                    if (!map.hasLayer(rl.polyline)) {{
                        rl.polyline.addTo(map);
                        rl.markers.forEach(m => m.addTo(map));
                    }}
                }} else {{
                    if (map.hasLayer(rl.polyline)) {{
                        map.removeLayer(rl.polyline);
                        rl.markers.forEach(m => map.removeLayer(m));
                    }}
                }}
            }}

            renderSidebar();
            updateKPIs();
        }}

        function toggleAllFilters(isChecked) {{
            routeLayers.forEach(rl => {{
                const matchesCat = activeCategoryFilter === 'all' || 
                                   (activeCategoryFilter === 'Tracto' && rl.type === 'Tracto') || 
                                   (activeCategoryFilter === 'Torton' && rl.type === 'Torton') || 
                                   (activeCategoryFilter === 'Camioneta' && rl.type.includes('Camioneta'));
                
                if (matchesCat) {{
                    routeVisibility[rl.key] = isChecked;
                    if (isChecked) {{
                        if (!map.hasLayer(rl.polyline)) {{
                            rl.polyline.addTo(map);
                            rl.markers.forEach(m => m.addTo(map));
                        }}
                    }} else {{
                        if (map.hasLayer(rl.polyline)) {{
                            map.removeLayer(rl.polyline);
                            rl.markers.forEach(m => map.removeLayer(m));
                        }}
                    }}
                }}
            }});
            renderSidebar();
            updateKPIs();
        }}

        function filterByVehicleCategory(category) {{
            activeCategoryFilter = category;
            
            document.querySelectorAll('.cat-filter-btn').forEach(btn => {{
                btn.classList.remove('active');
            }});
            const activeBtn = document.getElementById(`btn-cat-${{category}}`);
            if (activeBtn) activeBtn.classList.add('active');

            routeLayers.forEach(rl => {{
                const matchesCat = category === 'all' || 
                                   (category === 'Tracto' && rl.type === 'Tracto') || 
                                   (category === 'Torton' && rl.type === 'Torton') || 
                                   (category === 'Camioneta' && rl.type.includes('Camioneta'));

                const isVisible = routeVisibility[rl.key] !== false;

                if (matchesCat && isVisible) {{
                    if (!map.hasLayer(rl.polyline)) {{
                        rl.polyline.addTo(map);
                        rl.markers.forEach(m => m.addTo(map));
                    }}
                }} else {{
                    if (map.hasLayer(rl.polyline)) {{
                        map.removeLayer(rl.polyline);
                        rl.markers.forEach(m => map.removeLayer(m));
                    }}
                }}
            }});

            renderSidebar();
            updateKPIs();
        }}

        function renderSidebar() {{
            const listContainer = document.getElementById('route-list');
            listContainer.innerHTML = '';

            let totalVisibleTrips = 0;

            routeLayers.forEach((rl, idx) => {{
                const matchesCat = activeCategoryFilter === 'all' || 
                                   (activeCategoryFilter === 'Tracto' && rl.type === 'Tracto') || 
                                   (activeCategoryFilter === 'Torton' && rl.type === 'Torton') || 
                                   (activeCategoryFilter === 'Camioneta' && rl.type.includes('Camioneta'));

                if (!matchesCat) return;

                totalVisibleTrips++;

                const isVisible = routeVisibility[rl.key] !== false;

                const card = document.createElement('div');
                card.className = 'route-card';
                card.style.setProperty('--route-color', rl.color);
                card.style.setProperty('--route-color-alpha', rl.color + '22');
                if (!isVisible) {{
                    card.style.opacity = '0.4';
                }}

                const typeLabel = `🚛 ${{rl.type.toUpperCase()}}`;
                let tagBg = '#1e3a8a';
                let tagColor = '#60a5fa';
                if (rl.type === 'Torton') {{
                    tagBg = '#064e3b';
                    tagColor = '#34d399';
                }} else if (rl.type.includes('Camioneta')) {{
                    tagBg = '#7c2d12';
                    tagColor = '#fb923c';
                }}

                let timelineHtml = '';
                rl.stops.forEach(s => {{
                    const parts = s.eta.split(" ");
                    const timeOnly = parts[1] + " " + parts[2];
                    const clientNames = s.jobs.map(j => j.excel_info.nombre).join(' | ');
                    
                    timelineHtml += `
                        <div class="timeline-stop" title="${{clientNames}}">
                            <span class="stop-eta">[${{timeOnly}}]</span> 
                            Parada ${{s.seq}} - ${{s.city}} (${{(s.load/1000).toFixed(1)}}t)
                        </div>
                    `;
                }});

                card.innerHTML = `
                    <div style="display: flex; align-items: flex-start; gap: 10px; width: 100%;">
                        <input type="checkbox" class="route-toggle-checkbox" ${{isVisible ? 'checked' : ''}} 
                            onclick="event.stopPropagation(); toggleRouteVisibility('${{rl.key}}', this.checked)" 
                            style="margin-top: 4px; cursor: pointer; width: 16px; height: 16px; accent-color: var(--route-color);">
                        <div style="flex: 1;">
                            <div class="route-card-header">
                                <span class="route-title">${{rl.vehicle}} - Viaje ${{rl.trip_idx}}</span>
                                <span class="route-tag" style="background-color: ${{tagBg}}; color: ${{tagColor}}">${{typeLabel}}</span>
                            </div>
                            <div style="font-size:12px; color:var(--text-muted); margin-top:4px; font-weight:600; display:flex; align-items:center; gap:6px;">
                                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${{rl.color}}; border:1px solid #fff;"></span>
                                <span>${{rl.corridor}}</span>
                            </div>
                            <div style="font-size:11px; color:#60a5fa; margin-top:5px;">📅 Sale: ${{rl.departure}} | Regresa: ${{rl.return_time}}</div>
                            <div class="route-timeline">
                                ${{timelineHtml}}
                            </div>
                            <div class="route-meta">
                                <span>📦 Carga: ${{(rl.load/1000).toFixed(2)}}t</span>
                                <span>📍 Paradas: ${{rl.stops.length}}</span>
                                <span>📄 Pedidos: ${{rl.orders_count}}</span>
                            </div>
                        </div>
                    </div>
                `;

                card.onclick = () => {{
                    if (!isVisible) return; // Cannot focus a hidden card!

                    const alreadyActive = card.classList.contains('active');
                    document.querySelectorAll('.route-card').forEach(c => c.classList.remove('active'));
                    
                    if (!alreadyActive) {{
                        card.classList.add('active');
                        
                        if (rl.stops.length === 1) {{
                            map.setView([rl.stops[0].lat, rl.stops[0].lng], 9);
                        }} else {{
                            const stopCoords = rl.stops.map(s => [s.lat, s.lng]);
                            map.fitBounds(L.latLngBounds(stopCoords), {{padding: [80, 80]}});
                        }}
                        
                        routeLayers.forEach(layer => {{
                            layer.markers.forEach(m => m.setOpacity(0.25));
                        }});
                        rl.markers.forEach(m => m.setOpacity(1.0));
                    }} else {{
                        resetFocus();
                    }}
                }};

                listContainer.appendChild(card);
            }});

            document.getElementById('total-trips-count').innerText = totalVisibleTrips;
        }}

        function resetFocus() {{
            routeLayers.forEach(layer => {{
                if (map.hasLayer(layer.polyline)) {{
                    layer.polyline.setStyle({{weight: 0, opacity: 0}});
                    layer.markers.forEach(m => m.setOpacity(1.0));
                }}
            }});
            
            const allCoords = [];
            routeLayers.forEach(rl => {{
                if (map.hasLayer(rl.polyline)) {{
                    rl.stops.forEach(s => allCoords.push([s.lat, s.lng]));
                }}
            }});
            if (allCoords.length > 0) {{
                map.fitBounds(L.latLngBounds(allCoords), {{padding: [50, 50]}});
            }}
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

        function toggleSidebar() {{
            const sidebar = document.getElementById('sidebar');
            const toggleBtn = document.getElementById('sidebar-toggle');
            const isCollapsed = sidebar.classList.toggle('collapsed');
            
            toggleBtn.innerHTML = isCollapsed ? '▶' : '◀';
            
            setTimeout(() => {{
                map.invalidateSize();
            }}, 320);
        }}

        function renderFleetView() {{
            const container = document.querySelector('.fleet-grid');
            container.innerHTML = '';

            const groups = {{}};
            activeRoutes.forEach(r => {{
                if (!groups[r.vehicle]) {{
                    groups[r.vehicle] = {{
                        type: r.type,
                        color: r.color,
                        routes: []
                    }};
                }}
                groups[r.vehicle].routes.push(r);
            }});

            Object.entries(groups).forEach(([vehicleName, group]) => {{
                const routes = group.routes;
                const totalLoad = routes.reduce((sum, r) => sum + r.load, 0);
                
                let absCap = 18000;
                let safetyCap = 17100;
                let vehicleLabel = "Torton (18t cap)";
                let icon = "🚚";
                
                if (group.type === 'Tracto') {{
                    absCap = 30000;
                    safetyCap = 28500;
                    vehicleLabel = "Tracto (30t cap)";
                    icon = "🚛";
                }} else if (group.type === 'Camioneta 7t') {{
                    absCap = 7000;
                    safetyCap = 6650;
                    vehicleLabel = "Camioneta 7t (7t cap)";
                    icon = "📦";
                }} else if (group.type === 'Camioneta 4t') {{
                    absCap = 4000;
                    safetyCap = 3800;
                    vehicleLabel = "Camioneta 4t (4t cap)";
                    icon = "📦";
                }}

                const totalAbsCap = routes.length * absCap;
                const totalSafetyCap = routes.length * safetyCap;
                const nominalUtil = totalAbsCap > 0 ? (totalLoad / totalAbsCap * 100) : 0;
                const operationalUtil = totalSafetyCap > 0 ? (totalLoad / totalSafetyCap * 100) : 0;

                let tripsHtml = '';
                routes.forEach(r => {{
                    const utilAbs = (r.load / absCap) * 100;
                    const utilOper = (r.load / safetyCap) * 100;
                    
                    let barColor = 'v-fill-orange';
                    if (utilAbs >= 85.0) barColor = 'v-fill-green';
                    else if (utilAbs >= 70.0) barColor = 'v-fill-yellow';

                    const cities = [...new Set(r.stops.map(s => s.city))];
                    const citiesStr = cities.join(', ') || 'Retorno a Base';

                    tripsHtml += `
                        <div class="v-trip-row">
                            <div class="v-trip-row-header">
                                <span class="trip-idx">Viaje ${{r.trip_idx}} (${{r.corridor}})</span>
                                <span class="trip-load">${{Math.round(r.load).toLocaleString()}} kg / ${{absCap.toLocaleString()}} kg</span>
                            </div>
                            <div class="v-progress-bar-bg">
                                <div class="v-progress-bar-fill ${{barColor}}" style="width: ${{utilAbs}}%;"></div>
                            </div>
                            <div class="v-trip-row-footer">
                                <span>📍 ${{citiesStr}}</span>
                                <span style="font-weight: 700; color: #60a5fa;">${{utilAbs.toFixed(1)}}% Abs. | ${{utilOper.toFixed(1)}}% Oper.</span>
                            </div>
                        </div>
                    `;
                }});

                const card = document.createElement('div');
                card.className = 'vehicle-card-detailed';
                card.innerHTML = `
                    <div class="vehicle-card-detailed-header">
                        <span class="v-name">${{icon}} ${{vehicleName}}</span>
                        <span class="v-trips-count">${{routes.length}} Viajes Programados</span>
                    </div>
                    <div class="vehicle-card-detailed-body" style="display: flex; flex-direction: column; gap: 15px;">
                        <div class="v-summary-row">
                            <div>
                                <span class="lbl">Carga Total:</span>
                                <span class="val">${{(totalLoad/1000).toFixed(2)}} t</span>
                            </div>
                            <div>
                                <span class="lbl">Eficiencia Nom.</span>
                                <span class="val">${{nominalUtil.toFixed(1)}}%</span>
                            </div>
                            <div>
                                <span class="lbl">Eficiencia Oper.</span>
                                <span class="val" style="color: #10b981;">${{operationalUtil.toFixed(1)}}%</span>
                            </div>
                        </div>
                        <div class="v-trips-list">
                            ${{tripsHtml}}
                        </div>
                    </div>
                `;
                container.appendChild(card);
            }});
        }}

        function updateKPIs() {{
            const totalDist = activeRoutes.reduce((sum, r) => sum + r.distance, 0);
            document.getElementById('kpi-distance').innerText = `${{totalDist.toLocaleString(undefined, {{maximumFractionDigits: 1}})}} km`;
            
            const activeTripsCount = activeRoutes.length;
            document.getElementById('kpi-trips').innerText = activeTripsCount;
            
            const totalLoad = activeRoutes.reduce((sum, r) => sum + r.load, 0);
            document.getElementById('kpi-load').innerText = `${{(totalLoad/1000).toFixed(1)}}t`;
            
            let totalCap = 0;
            activeRoutes.forEach(r => {{
                if (r.type === 'Tracto') totalCap += 30000;
                else if (r.type === 'Torton') totalCap += 18000;
                else if (r.type === 'Camioneta 7t') totalCap += 7000;
                else if (r.type === 'Camioneta 4t') totalCap += 4000;
            }});
            const avgUtil = totalCap > 0 ? (totalLoad / totalCap * 100) : 0;
            document.getElementById('kpi-utilization').innerText = `${{avgUtil.toFixed(1)}}%`;

            const totalCost = activeRoutes.reduce((sum, r) => sum + r.cost, 0);
            document.getElementById('kpi-cost').innerText = `$${{Math.round(totalCost).toLocaleString()}} MXN`;
        }}

        function changePlan(planId) {{
            activeRoutes = plans[planId].routes;
            activeCategoryFilter = 'all';
            routeVisibility = {{}};

            // Reset active state of category buttons
            document.querySelectorAll('.cat-filter-btn').forEach(btn => {{
                btn.classList.remove('active');
            }});
            const allBtn = document.getElementById('btn-cat-all');
            if (allBtn) allBtn.classList.add('active');
            
            // Populate unassigned list
            const unassigned = plans[planId].unassigned || [];
            const panel = document.getElementById('unassigned-panel');
            const countEl = document.getElementById('unassigned-count');
            const listEl = document.getElementById('unassigned-list');
            
            if (unassigned.length > 0) {{
                panel.style.display = 'block';
                countEl.innerText = unassigned.length;
                listEl.innerHTML = '';
                
                unassigned.forEach(j => {{
                    const ex = j.excel_info;
                    const item = document.createElement('div');
                    item.style.padding = '8px';
                    item.style.background = 'rgba(239, 68, 68, 0.08)';
                    item.style.border = '1px solid rgba(239, 68, 68, 0.2)';
                    item.style.borderRadius = '6px';
                    item.style.fontSize = '11px';
                    item.style.lineHeight = '1.3';
                    item.innerHTML = `
                        <div style="font-weight:700; color:#f87171; font-size:11.5px; margin-bottom:3px; display:flex; justify-content:space-between;">
                            <span>📦 ${{ex.pedido}}</span>
                            <span>${{(j.demand/1000).toFixed(1)}}t</span>
                        </div>
                        <div style="color:#f1f5f9; font-weight:600; margin-bottom:2px;">${{ex.nombre}}</div>
                        <div style="color:#94a3b8; font-size:10px; margin-bottom:3px;">${{ex.poblacion}}, ${{ex.estado}}</div>
                        <div style="color:#fca5a5; font-size:10.5px; border-top:1px dashed rgba(239,68,68,0.2); padding-top:4px; margin-top:4px; font-weight:600;">⚠️ ${{j.reason}}</div>
                    `;
                    listEl.appendChild(item);
                }});
            }} else {{
                panel.style.display = 'none';
            }}
            
            renderMapRoutes();
            renderSidebar();
            renderFleetView();
            updateKPIs();
        }}

        function downloadActivePlanCSV() {{
            const csvHeaders = [
                'Vehiculo',
                'Tipo Unidad',
                'Viaje',
                'Corredor',
                'Secuencia Parada',
                'ETA Llegada',
                'ID Pedido',
                'Codigo Cliente',
                'Nombre Cliente',
                'Direccion',
                'Codigo Postal',
                'Poblacion',
                'Estado',
                'Peso Pedido (kg)',
                'Latitud',
                'Longitud'
            ];

            const rows = [];
            activeRoutes.forEach(r => {{
                r.stops.forEach(s => {{
                    s.jobs.forEach(j => {{
                        const ex = j.excel_info;
                        rows.push([
                            r.vehicle,
                            r.type,
                            r.trip_idx,
                            r.corridor,
                            s.seq,
                            s.eta,
                            ex.pedido,
                            ex.cliente,
                            ex.nombre,
                            ex.direccion,
                            ex.cp,
                            ex.poblacion,
                            ex.estado,
                            Math.round(j.demand),
                            s.lat,
                            s.lng
                        ]);
                    }});
                }});
            }});

            let csvContent = '\\ufeff' + csvHeaders.join(',') + '\\n';
            rows.forEach(row => {{
                const line = row.map(cell => {{
                    const val = cell !== undefined && cell !== null ? cell.toString() : '';
                    return `"${{val.replace(/"/g, '""')}}"`;
                }}).join(',');
                csvContent += line + '\\n';
            }});

            const selectEl = document.getElementById('plan-select');
            const planText = selectEl.options[selectEl.selectedIndex].text.replace(/\\s+/g, '_');
            const filename = `Rutas_Optimizadas_${{planText}}_${{new Date().toISOString().split('T')[0]}}.csv`;

            const blob = new Blob([csvContent], {{ type: 'text/csv;charset=utf-8;' }});
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }}

        // Initialize view
        changePlan('plan2');
    </script>
</body>
</html>
"""

    with open("routes_map.html", "w") as f:
        f.write(html_content)
    
    shutil.copyfile("routes_map.html", "index.html")
    print("routes_map.html and index.html generated successfully with K-Means and the 3 vehicle plans.")

if __name__ == "__main__":
    generate_interactive_map_v11()
