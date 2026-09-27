import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import datetime

def style_excel_sheet(ws, title_color="1E3A8A"):
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color=title_color, end_color=title_color, fill_type="solid")
    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )
    
    for col_idx in range(1, ws.max_column + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin_border
        
    data_font = Font(name="Calibri", size=10)
    for row_idx in range(2, ws.max_row + 1):
        for col_idx in range(1, ws.max_column + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.font = data_font
            cell.border = thin_border
            if isinstance(cell.value, (int, float)):
                if col_idx in [10, 12, 13]:
                    cell.number_format = '#,##0.00' if isinstance(cell.value, float) else '#,##0'
                    cell.alignment = Alignment(horizontal="right", vertical="center")
                elif col_idx in [26, 27]: # Lat, Lng
                    cell.number_format = '0.0000'
                    cell.alignment = Alignment(horizontal="right", vertical="center")
            elif isinstance(cell.value, (datetime.date, datetime.datetime)):
                cell.number_format = 'yyyy-mm-dd hh:mm'
                cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")
                
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val_str = str(cell.value or '')
            if len(val_str) > max_len:
                max_len = len(val_str)
        ws.column_dimensions[col_letter].width = min(max(max_len + 3, 11), 35)

HEADERS = [
    'Movimiento', 'Cliente', 'Fecha Emisión', 'Fecha Registro', 'Fecha Conclusión',
    'Nombre', 'Sucursal Cliente', 'Nombre', 'Observaciones', 'Peso',
    'Ruta', 'Importe Total', 'Saldo', 'Condiciones', 'Fecha Requerida',
    'Almacén', 'Referencia', 'Observaciones', 'Estado Embarque', 'Estatus',
    'Clasificación', 'Origen', 'Consecutivo', 'Usuario', 'Agente',
    'Latitud', 'Longitud', 'Hora Cita'
]

# ==============================================================================
# RETO 1: AUDITORÍA GEO & CITAS CRÍTICAS (45 PEDIDOS)
# ==============================================================================
def create_reto_1():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Pedidos_Citas_GeoAudit"
    ws.append(HEADERS)
    
    data = []
    
    # --- GRUPO 1: Discrepancia Crítica (>15 km / >50 km) ---
    disc_crit = [
        ("Pedido 461001", "A01101", "TIENDAS SORIANA", 1, "SORIANA MAYORAZGO", "AV 11 SUR - MAYORAZGO PUEBLA", 2400, "PUEBLA", "CITA 08:00 AM", 19.5500, -96.9000, "08:00 AM"),
        ("Pedido 461002", "A01102", "NUEVA WAL MART DE MEXICO", 2, "WALMART CHOLULA", "PERIFERICO ECOLOGICO - CHOLULA", 3800, "PUEBLA", "CITA 07:30 AM", 18.8500, -97.1000, "07:30 AM"),
        ("Pedido 461003", "A01103", "CHEDRAUI", 1, "CHEDRAUI CRYSTAL", "AV ESTEBAN DE ANTUÑANO PUEBLA", 1850, "PUEBLA", "CITA 09:00 AM", 19.3500, -97.5500, "09:00 AM"),
        ("Pedido 461004", "A01104", "SUPER CHEDRAUI", 3, "CHEDRAUI TEHUACAN", "AV INDEPENDENCIA PONIENTE TEHUACAN", 4200, "PUEBLA 4", "CITA 10:30 AM", 18.0850, -96.1250, "10:30 AM"),
        ("Pedido 461005", "A01105", "ABARROTERA DEL VALLE", 1, "VALLE ORIZABA", "SUR 11 CENTRO ORIZABA", 1500, "VERACRUZ", "VENTANA LIBRE", 19.1800, -96.1400, None),
    ]
    for row in disc_crit: data.append(row)
        
    # --- GRUPO 2: Discrepancia Local (500m - 15 km) ---
    disc_local = [
        ("Pedido 461006", "A01201", "ALMACENES EL TRIGO DORADO", 1, "TRIGO DORADO CARDENAS", "PARQUE INDUSTRIAL CARDENAS", 6200, "TABASCO", "VENTANA 08:00-14:00", 17.9600, -93.3500, "09:00 AM"),
        ("Pedido 461007", "A01202", "COMERCIALIZADORA KAYANOU", 1, "KAYANOU CARMEN", "PUERTO PESQUERO CD DEL CARMEN", 950, "PENINSULA", "CITA 10:00 AM", 18.6600, -91.8000, "10:00 AM"),
        ("Pedido 461008", "A01203", "SURTIABARROTES DE CHIAPAS", 1, "SURTIABARROTES TUXTLA", "LIBRAMIENTO SUR TUXTLA", 4500, "CHIAPAS", "VENTANA HABIL", 16.7300, -93.1000, None),
        ("Pedido 461009", "A01204", "CENTRO COMERCIAL MERAZ", 2, "MERAZ HUATULCO", "BAHIA CHAHUE SANTA CRUZ HUATULCO", 2800, "OAXACA", "CITA 08:30 AM", 15.7800, -96.1200, "08:30 AM"),
        ("Pedido 461010", "A01205", "DISTRIBUIDORA DE PERFUMERIA", 1, "POZA RICA CENTRO", "AV 20 DE NOVIEMBRE POZA RICA", 3100, "VERACRUZ SUR", "CITA 11:00 AM", 20.5500, -97.4300, "11:00 AM"),
    ]
    for row in disc_local: data.append(row)
        
    # --- GRUPO 3: Sin GPS (Solo texto SAP) ---
    sin_gps = [
        ("Pedido 461011", "A01301", "CREMERIA AMERICANA", 3, "RR TOLUCA", "PARQUE INDUSTRIAL TOLUCA 2000", 2100, "MEXICO", "VENTANA 07:00-16:00", None, None, None),
        ("Pedido 461012", "A01302", "ABARROTES LA VIOLETA", 1, "LA VIOLETA MORELIA", "ELIAS PEREZ AVALOS-MORELIA", 1600, "MORELIA", "VENTANA 08:00-15:00", None, None, None),
        ("Pedido 461013", "A01303", "ABARROTES AZTECA VILLAS", 1, "AZTECA MORELIA", "VILLAS DEL PEDREGAL-MORELIA", 4100, "MORELIA", "VENTANA 08:00-14:00", None, None, None),
        ("Pedido 461014", "A01304", "EDGAR PONCE MARTINEZ", 1, "EDGAR PONCE", "ZARAGOZA - TEHUITZINGO", 5900, "PUEBLA 4", "VENTANA HABIL", None, None, None),
        ("Pedido 461015", "A01305", "SERVI-DISTRIBUCIONES OAXACA", 2, "SERVI OAXACA MONTOYA", "MONTOYA OAXACA JUAREZ", 6800, "OAXACA", "VENTANA HABIL", None, None, None),
        ("Pedido 461016", "A01306", "SOCORRO HERNANDEZ JIMENEZ", 1, "PALENQUE CENTRO", "AV HIDALGO PALENQUE CHIAPAS", 7400, "TABASCO", "VENTANA HABIL", None, None, None),
        ("Pedido 461017", "A01307", "ENBE S.A. DE C.V.", 1, "ENBE CARDENAS", "CARDENAS TABASCO KM 2.5", 5800, "TABASCO", "VENTANA HABIL", None, None, None),
        ("Pedido 461018", "A01308", "UNION DE COMERCIOS ARRO", 1, "ARRO XOXOCOTLAN", "SANTA CRUZ XOXOCOTLAN OAXACA", 4300, "OAXACA", "VENTANA HABIL", None, None, None),
        ("Pedido 461019", "A01309", "COMERCIALIZADORA PROSUR", 1, "PROSUR HUIMANGUILLO", "HUIMANGUILLO TABASCO CENTRO", 3900, "TABASCO", "VENTANA HABIL", None, None, None),
        ("Pedido 461020", "A01310", "DISTRIBUCIONES DEL PUERTO", 1, "PUERTO VERACRUZ", "CD INDUSTRIAL BRUNO PAGLIAI VERACRUZ", 4800, "VERACRUZ", "VENTANA HABIL", None, None, None),
    ]
    for row in sin_gps: data.append(row)
        
    # --- GRUPO 4: Citas Retail Estrictas (07:00 a 10:30 AM) ---
    citas_estrictas = [
        ("Pedido 461021", "A01401", "NUEVA WAL MART DE MEXICO", 1, "CEDIS MONTERREY TABASCO", "ANACLETO CANABAL VILLAHERMOSA", 7800, "TABASCO", "CITA 07:00 AM OBLIGATORIA", 18.0382, -92.9031, "07:00 AM"),
        ("Pedido 461022", "A01402", "NUEVA WAL MART DE MEXICO", 2, "WALMART BOCA DEL RIO", "PLAZA LAS AMERICAS BOCA DEL RIO", 4200, "VERACRUZ", "CITA 07:30 AM RETAIL", 19.1411, -96.1080, "07:30 AM"),
        ("Pedido 461023", "A01403", "CHEDRAUI", 2, "CHEDRAUI XALAPA POLIFORUM", "CARRETERA XALAPA VERACRUZ", 3600, "VERACRUZ", "CITA 08:00 AM", 19.5211, -96.8831, "08:00 AM"),
        ("Pedido 461024", "A01404", "CHEDRAUI", 4, "CHEDRAUI POZA RICA", "BLVD RUIZ CORTINES POZA RICA", 3900, "VERACRUZ SUR", "CITA 08:30 AM", 20.5311, -97.4511, "08:30 AM"),
        ("Pedido 461025", "A01405", "TIENDAS SORIANA", 2, "SORIANA HIPER CORDOBA", "BLVD CORDOBA FORTIN", 3100, "VERACRUZ", "CITA 08:30 AM", 18.8950, -96.9520, "08:30 AM"),
        ("Pedido 461026", "A01406", "TIENDAS SORIANA", 3, "SORIANA TUXTEPEC", "AV INDEPENDENCIA TUXTEPEC", 4500, "OAXACA", "CITA 09:00 AM", 18.0850, -96.1250, "09:00 AM"),
        ("Pedido 461027", "A01407", "PROVEEDORA DEL PANADERO", 1, "CEDIS PROVEEDORA MERIDA", "PERIFERICO PONIENTE MERIDA YUC", 5800, "PENINSULA", "CITA 09:30 AM", 20.9750, -89.6500, "09:30 AM"),
        ("Pedido 461028", "A01408", "PROVEEDORA DEL PANADERO", 2, "CEDIS PROVEEDORA MERIDA", "PERIFERICO PONIENTE MERIDA YUC", 3800, "PENINSULA", "CITA 10:00 AM", 20.9750, -89.6500, "10:00 AM"),
        ("Pedido 461029", "A01409", "CASA CHAPA", 1, "CHAPA COATZACOALCOS", "AV TRANSISTMICA COATZACOALCOS", 5200, "VERACRUZ SUR", "CITA 10:00 AM", 18.1350, -94.4420, "10:00 AM"),
        ("Pedido 461030", "A01410", "CASA CHAPA", 2, "CHAPA MINATITLAN", "AV JUSTO SIERRA MINATITLAN", 4900, "VERACRUZ SUR", "CITA 10:30 AM", 17.9950, -94.5420, "10:30 AM"),
        ("Pedido 461031", "A01411", "SUPER SAN FRANCISCO", 1, "SAN FRANCISCO CAMPECHE", "AV PATRICIO TRUEBA CAMPECHE", 2200, "PENINSULA", "CITA 08:00 AM", 19.8250, -90.5250, "08:00 AM"),
        ("Pedido 461032", "A01412", "ABARROTES EL ROBLE", 1, "EL ROBLE TEHUANTEPEC", "TEHUANTEPEC OAXACA", 3400, "OAXACA", "CITA 09:00 AM", 16.3244, -95.2411, "09:00 AM"),
        ("Pedido 461033", "A01413", "DISTRIBUIDORA SAN JORGE", 1, "SAN JORGE JUCHITAN", "JUCHITAN DE ZARAGOZA", 3800, "OAXACA", "CITA 09:30 AM", 16.4444, -95.0180, "09:30 AM"),
        ("Pedido 461034", "A01414", "ABARROTES DE SALINA CRUZ", 1, "SALINA CRUZ PUERTO", "SALINA CRUZ OAXACA", 4100, "OAXACA", "CITA 10:00 AM", 16.1833, -95.2000, "10:00 AM"),
        ("Pedido 461035", "A01415", "TIENDAS NETO", 1, "NETO PUEBLA CENTRO", "AV 5 DE MAYO PUEBLA", 2900, "PUEBLA", "CITA 07:00 AM", 19.0480, -98.1980, "07:00 AM"),
    ]
    for row in citas_estrictas: data.append(row)
        
    # --- GRUPO 5: Clientes Regionales (Ventana Hábil Normal) ---
    clientes_reg = [
        ("Pedido 461036", "A01501", "PANIFICADORA EL RETIRO", 1, "EL RETIRO PUEBLA", "COL LA PAZ PUEBLA", 1800, "PUEBLA", "VENTANA 08:00-14:00", 19.0550, -98.2250, None),
        ("Pedido 461037", "A01502", "DULCERIA EL GALLITO", 1, "EL GALLITO TEPEACA", "CENTRO TEPEACA PUEBLA", 2400, "PUEBLA", "VENTANA 08:00-15:00", 18.9667, -97.9042, None),
        ("Pedido 461038", "A01503", "COMERCIAL ORIZABA", 1, "COMERCIAL ORIZABA", "AV CRIO ORIZABA VER", 3500, "VERACRUZ", "VENTANA 07:00-16:00", 18.8550, -97.0980, None),
        ("Pedido 461039", "A01504", "ABARROTERA CORDOBESA", 1, "CORDOBESA CENTRO", "AV 1 CALLE 3 CORDOBA VER", 2900, "VERACRUZ", "VENTANA 08:00-15:00", 18.8920, -96.9350, None),
        ("Pedido 461040", "A01505", "DISTRIBUCIONES ACAYUCAN", 1, "ACAYUCAN CENTRO", "ACAYUCAN VERACRUZ", 3600, "VERACRUZ SUR", "VENTANA 08:00-14:00", 17.9480, -94.9120, None),
        ("Pedido 461041", "A01506", "ABARROTES DE TLAXCALA", 1, "TLAXCALA CENTRO", "AV INDEPENDENCIA TLAXCALA", 2700, "PUEBLA", "VENTANA HABIL", 19.3180, -98.2380, None),
        ("Pedido 461042", "A01507", "COMERCIALIZADORA APETATITLAN", 1, "SAN PABLO APETATITLAN", "APETATITLAN TLAXCALA", 1950, "PUEBLA", "VENTANA HABIL", 19.3450, -98.1980, None),
        ("Pedido 461043", "A01508", "SUPER SAN MARTIN", 1, "TEXMELUCAN CENTRO", "SAN MARTIN TEXMELUCAN", 3100, "PUEBLA", "VENTANA HABIL", 19.2840, -98.4350, None),
        ("Pedido 461044", "A01509", "ABARROTERA HUAMANTLA", 1, "HUAMANTLA CENTRO", "HUAMANTLA TLAXCALA", 2400, "PUEBLA", "VENTANA HABIL", 19.3120, -97.9250, None),
        ("Pedido 461045", "A01510", "DULCERIA DE CHIPILO", 1, "CHIPILO PUEBLA", "CARRETERA FEDERAL A ATLIXCO", 1700, "PUEBLA", "VENTANA HABIL", 19.0080, -98.3280, None),
    ]
    for row in clientes_reg: data.append(row)
        
    now = datetime.datetime(2026, 9, 28, 8, 30)
    for p in data:
        mov, cli, nom, suc, nom_suc, obs, peso, ruta, age_txt, lat, lng, cita_hora = p
        ws.append([
            mov, cli, now.date(), now, None,
            nom, suc, nom_suc, obs, peso,
            ruta, round(peso * 24.5, 2), round(peso * 24.5, 2), "30 DIAS", now.date() + datetime.timedelta(days=1),
            "CISAALMA", "REF-CITAS", obs, None, "PENDIENTE",
            None, None, None, "ISABELM", age_txt,
            lat, lng, cita_hora
        ])
        
    style_excel_sheet(ws, title_color="0D9488") # Teal for Geo & Citas
    wb.save("RETO_1_AUDITORIA_GEO_Y_CITAS_CRITICAS.xlsx")
    print(f"✅ RETO 1 generado con éxito: RETO_1_AUDITORIA_GEO_Y_CITAS_CRITICAS.xlsx ({len(data)} pedidos)")


# ==============================================================================
# RETO 2: LÍMITES NOM-012-SCT, CAPACIDAD LEGAL & CONSOLIDACIÓN FTL (60 PEDIDOS)
# ==============================================================================
def create_reto_2():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Pedidos_NOM012_Capacidad"
    ws.append(HEADERS)
    
    data = []
    
    # 1. Gran Mayorista Puebla FTL Dedicado (3 pedidos = 31,450 kg -> 98.9% FTL Tracto sin sobrecarga)
    data.append(("Pedido 462001", "A02001", "CENTRAL DE ABASTOS PUEBLA", 1, "CEDIS MAYORISTA PUEBLA", "CENTRAL DE ABTOS PUEBLA", 12500, "PUEBLA", "FTL TRACTO DIRECTO", 19.0911, -98.1812, "07:00 AM"))
    data.append(("Pedido 462002", "A02001", "CENTRAL DE ABASTOS PUEBLA", 1, "CEDIS MAYORISTA PUEBLA", "CENTRAL DE ABTOS PUEBLA", 10950, "PUEBLA", "FTL TRACTO DIRECTO", 19.0911, -98.1812, "08:00 AM"))
    data.append(("Pedido 462003", "A02001", "CENTRAL DE ABASTOS PUEBLA", 1, "CEDIS MAYORISTA PUEBLA", "CENTRAL DE ABTOS PUEBLA", 8000, "PUEBLA", "FTL TRACTO DIRECTO", 19.0911, -98.1812, "09:00 AM"))

    # 2. Gran Mayorista Chiapas con Sobrecarga NOM-012 (3 pedidos = 35,200 kg -> Requiere 1 Tracto 31.4t + Remanente)
    data.append(("Pedido 462004", "A02002", "ABARROTERA CENTRAL DE CHIAPAS", 1, "CEDIS TUXTLA MAYORISTA", "LIBRAMIENTO TUXTLA", 16800, "CHIAPAS", "CARGA PESADA", 16.7511, -93.1189, "08:00 AM"))
    data.append(("Pedido 462005", "A02002", "ABARROTERA CENTRAL DE CHIAPAS", 1, "CEDIS TUXTLA MAYORISTA", "LIBRAMIENTO TUXTLA", 14600, "CHIAPAS", "CARGA PESADA", 16.7511, -93.1189, "09:00 AM"))
    data.append(("Pedido 462006", "A02002", "ABARROTERA CENTRAL DE CHIAPAS", 1, "CEDIS TUXTLA MAYORISTA", "LIBRAMIENTO TUXTLA", 3800, "CHIAPAS", "REMANENTE NOM-012", 16.7511, -93.1189, "10:30 AM"))

    # 3. Límite Exacto Torton C3 (18,000 kg) en Oaxaca Valles (5 pedidos = 17,850 kg -> 99.2% Torton)
    data.append(("Pedido 462007", "A02003", "SERVI-DISTRIBUCIONES OAXACA", 2, "SERVI OAXACA MONTOYA", "MONTOYA OAXACA JUAREZ", 4800, "OAXACA", "TORTON C3", 17.0714, -96.7522, "08:00 AM"))
    data.append(("Pedido 462008", "A02004", "ABARROTES SAN AGUSTIN", 1, "SAN AGUSTIN OAXACA", "SAN AGUSTIN DE LAS JUNTAS", 4200, "OAXACA", "TORTON C3", 17.0225, -96.7114, "09:00 AM"))
    data.append(("Pedido 462009", "A02005", "DISTRIBUIDORA XOXO", 1, "XOXO OAXACA", "SANTA CRUZ XOXOCOTLAN", 3650, "OAXACA", "TORTON C3", 17.0311, -96.7328, "10:00 AM"))
    data.append(("Pedido 462010", "A02006", "ABARROTES DE ANITA", 1, "STA ANITA OAXACA", "STA ANITA OAXACA", 3100, "OAXACA", "TORTON C3", 17.0589, -96.7214, "11:00 AM"))
    data.append(("Pedido 462011", "A02007", "COMERCIAL OAXACA", 1, "OAXACA CENTRO", "OAXACA DE JUAREZ", 2100, "OAXACA", "TORTON C3", 17.0654, -96.7236, "12:00 PM"))

    # 4. Desacople Costa vs Sierra Veracruz Norte (12 pedidos = 17,100 kg)
    # Costa: Poza Rica / Papantla / Tihuatlán (6 pedidos = 7,400 kg)
    data.append(("Pedido 462012", "A02008", "CASA CHAPA", 3, "CHAPA POZA RICA", "BLVD RUIZ CORTINES POZA RICA", 1800, "VERACRUZ SUR", "COSTA POZA RICA", 20.5311, -97.4511, "08:00 AM"))
    data.append(("Pedido 462013", "A02009", "CHEDRAUI", 4, "CHEDRAUI POZA RICA", "AV 20 DE NOVIEMBRE POZA RICA", 1500, "VERACRUZ SUR", "COSTA POZA RICA", 20.5500, -97.4300, "08:30 AM"))
    data.append(("Pedido 462014", "A02010", "SUPER PAPANTLA", 1, "PAPANTLA CENTRO", "PAPANTLA DE OLARTE", 1400, "VERACRUZ SUR", "COSTA PAPANTLA", 20.4466, -97.3215, "09:30 AM"))
    data.append(("Pedido 462015", "A02011", "DISTRIBUIDORA TIHUATLAN", 1, "TIHUATLAN CENTRO", "TIHUATLAN VERACRUZ", 1100, "VERACRUZ SUR", "COSTA TIHUATLAN", 20.7211, -97.5311, "10:30 AM"))
    data.append(("Pedido 462016", "A02012", "ABARROTES DE LA COSTA", 1, "POZA RICA SUR", "POZA RICA VER", 900, "VERACRUZ SUR", "COSTA POZA RICA", 20.5400, -97.4400, "11:30 AM"))
    data.append(("Pedido 462017", "A02013", "MINISUPER EL TAJIN", 1, "PAPANTLA NORTE", "PAPANTLA VER", 700, "VERACRUZ SUR", "COSTA PAPANTLA", 20.4550, -97.3150, "12:00 PM"))
    
    # Sierra: Xicotepec / Venustiano Carranza (6 pedidos = 9,700 kg)
    data.append(("Pedido 462018", "A02014", "ABARROTERA DE LA SIERRA", 1, "XICOTEPEC CENTRO", "XICOTEPEC DE JUAREZ", 2600, "VERACRUZ SUR", "SIERRA PUEBLA", 20.3862, -97.8814, "08:30 AM"))
    data.append(("Pedido 462019", "A02015", "COMERCIAL VENUSTIANO", 1, "CARRANZA PUEBLA", "CARRANZA PUEBLA", 2100, "VERACRUZ SUR", "SIERRA PUEBLA", 20.4631, -97.7014, "09:30 AM"))
    data.append(("Pedido 462020", "A02016", "MERCANTIL XICOTEPEC", 1, "XICOTEPEC ALTO", "XICOTEPEC DE JUAREZ", 1700, "VERACRUZ SUR", "SIERRA PUEBLA", 20.3910, -97.8750, "10:30 AM"))
    data.append(("Pedido 462021", "A02017", "DULCERIA SERRANA", 1, "CARRANZA SUR", "CARRANZA PUEBLA", 1300, "VERACRUZ SUR", "SIERRA PUEBLA", 20.4580, -97.6980, "11:30 AM"))
    data.append(("Pedido 462022", "A02018", "SUPER HUAUCHINANGO", 1, "HUAUCHINANGO ACCESO", "XICOTEPEC AREA", 1100, "VERACRUZ SUR", "SIERRA PUEBLA", 20.3750, -97.8900, "12:30 PM"))
    data.append(("Pedido 462023", "A02019", "ABARROTES EL MIRADOR", 1, "XICOTEPEC ORIENTE", "XICOTEPEC DE JUAREZ", 900, "VERACRUZ SUR", "SIERRA PUEBLA", 20.3800, -97.8700, "01:00 PM"))

    # 5. Consolidado Pesado Veracruz Sur / Minatitlán / Coatza (8 pedidos = 33,500 kg -> 2 Tortons Balanceados)
    data.append(("Pedido 462024", "A02020", "CASA CHAPA", 1, "CHAPA COATZACOALCOS", "COATZACOALCOS TRANSISTMICA", 5800, "VERACRUZ SUR", "SUR PESADO", 18.1456, -94.5364, "08:00 AM"))
    data.append(("Pedido 462025", "A02021", "CASA CHAPA", 2, "CHAPA MINATITLAN", "MINATITLAN JUSTO SIERRA", 5400, "VERACRUZ SUR", "SUR PESADO", 17.9950, -94.5420, "08:30 AM"))
    data.append(("Pedido 462026", "A02022", "ABARROTES DE ACAYUCAN", 1, "ACAYUCAN CENTRO", "ACAYUCAN VERACRUZ", 4800, "VERACRUZ SUR", "SUR PESADO", 17.9511, -94.9114, "09:30 AM"))
    data.append(("Pedido 462027", "A02023", "DISTRIBUIDORA JALTIPAN", 1, "JALTIPAN CENTRO", "COATZACOALCOS RUTA", 4200, "VERACRUZ SUR", "SUR PESADO", 17.9710, -94.7150, "10:00 AM"))
    data.append(("Pedido 462028", "A02024", "SUPER COATZACOALCOS", 1, "COATZA PUERTO", "COATZACOALCOS VER", 3900, "VERACRUZ SUR", "SUR PESADO", 18.1380, -94.4500, "10:30 AM"))
    data.append(("Pedido 462029", "A02025", "MERCANTIL DEL SUR", 1, "MINATITLAN CENTRO", "MINATITLAN VER", 3500, "VERACRUZ SUR", "SUR PESADO", 18.0100, -94.5500, "11:00 AM"))
    data.append(("Pedido 462030", "A02026", "ABARROTERA OLMECA", 1, "COATZA INDUSTRIAL", "COATZACOALCOS VER", 3100, "VERACRUZ SUR", "SUR PESADO", 18.1250, -94.4800, "11:30 AM"))
    data.append(("Pedido 462031", "A02027", "COMERCIAL ACAYUCAN", 1, "ACAYUCAN SUR", "ACAYUCAN VERACRUZ", 2800, "VERACRUZ SUR", "SUR PESADO", 17.9400, -94.9200, "12:00 PM"))

    # 6. Chiapas Frontera Sur / Suchiate (4 pedidos = 30,900 kg -> 97.2% FTL Tracto)
    data.append(("Pedido 462032", "A02028", "COMERCIALIZADORA DEL SOCONUSCO", 1, "SUCHIATE CENTRO", "SUCHIATE CHIAPAS", 9500, "CHIAPAS", "FRONTERA SUR FTL", 14.6834, -92.1504, "08:00 AM"))
    data.append(("Pedido 462033", "A02029", "EXPORTADORA GUATEMEX", 1, "CD HIDALGO PUERTO", "CD. HIDALGO CHIAPAS", 8800, "CHIAPAS", "FRONTERA SUR FTL", 14.6850, -92.1480, "09:00 AM"))
    data.append(("Pedido 462034", "A02030", "AGROQUIMICOS DEL SUR", 1, "SUCHIATE AGRO", "SUCHIATE CHIAPAS", 6800, "CHIAPAS", "FRONTERA SUR FTL", 14.6900, -92.1550, "10:00 AM"))
    data.append(("Pedido 462035", "A02031", "DISTRIBUCIONES ADUANALES", 1, "CD HIDALGO ADUANA", "CD. HIDALGO CHIAPAS", 5800, "CHIAPAS", "FRONTERA SUR FTL", 14.6820, -92.1450, "11:00 AM"))

    # 7. Tabasco Corredor Industrial Villahermosa (8 pedidos = 31,600 kg -> 99.4% FTL)
    data.append(("Pedido 462036", "A02032", "NUEVA WAL MART DE MEXICO", 1, "CEDIS MONTERREY TABASCO", "MONTERREY CEDIS", 7800, "TABASCO", "CITA 07:00 AM", 18.0382, -92.9031, "07:00 AM"))
    data.append(("Pedido 462037", "A02033", "ENBE S.A. DE C.V.", 1, "ENBE CARDENAS", "CARDENAS TABASCO", 5400, "TABASCO", "VENTANA HABIL", 17.9914, -93.3811, "08:30 AM"))
    data.append(("Pedido 462038", "A02034", "COMERCIALIZADORA PROSUR", 1, "PROSUR HUIMANGUILLO", "HUIMANGUILLO TABASCO", 4600, "TABASCO", "VENTANA HABIL", 17.8331, -93.3914, "09:30 AM"))
    data.append(("Pedido 462039", "A02035", "ABARROTES DE VILLAHERMOSA", 1, "VILLAHERMOSA CENTRO", "VILLAHERMOSA TABASCO", 4100, "TABASCO", "VENTANA HABIL", 17.9892, -92.9281, "10:30 AM"))
    data.append(("Pedido 462040", "A02036", "SUPER CHEDRAUI TABASCO", 1, "CHEDRAUI VILLAHERMOSA", "VILLAHERMOSA TABASCO", 3500, "TABASCO", "CITA 09:00 AM", 17.9920, -92.9350, "09:00 AM"))
    data.append(("Pedido 462041", "A02037", "ALMACEN DEL EDEN", 1, "CARDENAS INDUSTRIAL", "CARDENAS TABASCO", 2800, "TABASCO", "VENTANA HABIL", 17.9850, -93.3750, "11:30 AM"))
    data.append(("Pedido 462042", "A02038", "DISTRIBUCIONES ANACLETO", 1, "ANACLETO CANABAL", "ANACLETO CBAL", 2100, "TABASCO", "VENTANA HABIL", 17.9744, -93.0014, "12:00 PM"))
    data.append(("Pedido 462043", "A02039", "DULCERIA TABASQUEÑA", 1, "VILLAHERMOSA NORTE", "VILLAHERMOSA TABASCO", 1300, "TABASCO", "VENTANA HABIL", 18.0100, -92.9100, "12:30 PM"))

    # 8. Península Mérida (4 pedidos = 17,200 kg -> 95.6% Torton C3 en vez de Tráiler ocioso)
    data.append(("Pedido 462044", "A02040", "PROVEEDORA DEL PANADERO", 1, "CEDIS PROVEEDORA MERIDA", "PROVEEDORA DEL PANADERO", 5800, "PENINSULA", "CITA 08:30 AM", 20.9500, -89.6500, "08:30 AM"))
    data.append(("Pedido 462045", "A02041", "PROVEEDORA DEL PANADERO", 2, "CEDIS PROVEEDORA MERIDA", "PROVEEDORA DEL PANADERO", 4800, "PENINSULA", "CITA 09:30 AM", 20.9500, -89.6500, "09:30 AM"))
    data.append(("Pedido 462046", "A02042", "ABARROTES DE MERIDA", 1, "MERIDA CENTRO", "MERIDA YUCATAN", 3900, "PENINSULA", "VENTANA HABIL", 20.9674, -89.5926, "10:30 AM"))
    data.append(("Pedido 462047", "A02043", "COMERCIAL KANASIN", 1, "KANASIN CENTRO", "KANASIN YUCATAN", 2700, "PENINSULA", "VENTANA HABIL", 20.9355, -89.5579, "11:30 AM"))

    # 9. Altas Montañas Orizaba / Córdoba (6 pedidos = 11,200 kg -> Torton regional)
    data.append(("Pedido 462048", "A02044", "COMERCIAL ORIZABA", 1, "ORIZABA CENTRO", "VALLE ORIZABA", 3100, "VERACRUZ", "VENTANA HABIL", 18.8550, -97.0980, "08:00 AM"))
    data.append(("Pedido 462049", "A02045", "ABARROTERA CORDOBESA", 1, "CORDOBA CENTRO", "CORDOBESA CENTRO", 2800, "VERACRUZ", "VENTANA HABIL", 18.8920, -96.9350, "09:00 AM"))
    data.append(("Pedido 462050", "A02046", "TIENDAS SORIANA", 2, "SORIANA HIPER CORDOBA", "BLVD CORDOBA FORTIN", 2200, "VERACRUZ", "CITA 09:30 AM", 18.8950, -96.9520, "09:30 AM"))
    data.append(("Pedido 462051", "A02047", "SUPER FORTIN", 1, "FORTIN DE LAS FLORES", "FORTIN VERACRUZ", 1400, "VERACRUZ", "VENTANA HABIL", 18.9020, -97.0010, "10:30 AM"))
    data.append(("Pedido 462052", "A02048", "DULCERIA DE ORIZABA", 1, "ORIZABA SUR", "ORIZABA VERACRUZ", 950, "VERACRUZ", "VENTANA HABIL", 18.8420, -97.1050, "11:30 AM"))
    data.append(("Pedido 462053", "A02049", "ABARROTES DE IXTAC", 1, "IXTACZOQUITLAN", "IXTAC VERACRUZ", 750, "VERACRUZ", "VENTANA HABIL", 18.8600, -97.0500, "12:00 PM"))

    # 10. Reparto Urbano Capilar Toluca & Tlaxcala (7 pedidos = 6,800 kg -> Camioneta 7t)
    data.append(("Pedido 462054", "A02050", "CREMERIA AMERICANA", 3, "RR TOLUCA", "TOLUCA", 2100, "MEXICO", "VENTANA 07:00-16:00", 19.3311, -99.5711, "08:00 AM"))
    data.append(("Pedido 462055", "A02051", "ABARROTES DE TLAXCALA", 1, "TLAXCALA CENTRO", "TLAXCALA PUEBLA", 1400, "PUEBLA", "VENTANA HABIL", 19.3180, -98.2380, "08:30 AM"))
    data.append(("Pedido 462056", "A02052", "COMERCIALIZADORA APETATITLAN", 1, "SAN PABLO APETATITLAN", "TLAXCALA APETATITLAN", 950, "PUEBLA", "VENTANA HABIL", 19.3450, -98.1980, "09:30 AM"))
    data.append(("Pedido 462057", "A02053", "SUPER TEXMELUCAN", 1, "TEXMELUCAN CENTRO", "SAN MARTIN TEXMELUCAN", 850, "PUEBLA", "VENTANA HABIL", 19.2840, -98.4350, "10:30 AM"))
    data.append(("Pedido 462058", "A02054", "DULCERIA DE CHIPILO", 1, "CHIPILO PUEBLA", "CHIPILO PUEBLA", 650, "PUEBLA", "VENTANA HABIL", 19.0080, -98.3280, "11:30 AM"))
    data.append(("Pedido 462059", "A02055", "MERCANTIL HUAMANTLA", 1, "HUAMANTLA CENTRO", "HUAMANTLA TLAXCALA", 480, "PUEBLA", "VENTANA HABIL", 19.3120, -97.9250, "12:00 PM"))
    data.append(("Pedido 462060", "A02056", "ABARROTES ZACATELCO", 1, "ZACATELCO TLAXCALA", "TLAXCALA SUR", 370, "PUEBLA", "VENTANA HABIL", 19.2150, -98.2400, "12:30 PM"))

    now = datetime.datetime(2026, 9, 28, 8, 30)
    for p in data:
        mov, cli, nom, suc, nom_suc, obs, peso, ruta, age_txt, lat, lng, cita_hora = p
        ws.append([
            mov, cli, now.date(), now, None,
            nom, suc, nom_suc, obs, peso,
            ruta, round(peso * 24.5, 2), round(peso * 24.5, 2), "30 DIAS", now.date() + datetime.timedelta(days=1),
            "CISAALMA", "REF-NOM012", obs, None, "PENDIENTE",
            None, None, None, "ISABELM", age_txt,
            lat, lng, cita_hora
        ])
        
    style_excel_sheet(ws, title_color="1E3A8A") # Navy for NOM-012 & Capacity
    wb.save("RETO_2_NOM012_CAPACIDAD_Y_CONSOLIDACION_FTL.xlsx")
    print(f"✅ RETO 2 generado con éxito: RETO_2_NOM012_CAPACIDAD_Y_CONSOLIDACION_FTL.xlsx ({len(data)} pedidos)")


# ==============================================================================
# RETO 3: CASO MAESTRO RED NACIONAL & BACKORDER / DIFERIR (85 PEDIDOS)
# ==============================================================================
def create_reto_3():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Pedidos_Nacional_Backorder"
    ws.append(HEADERS)
    
    data = []
    
    # 1. Corredor Puebla Altiplano & Tlaxcala (14 pedidos = 41,500 kg)
    puebla_orders = [
        ("Pedido 463001", "A03001", "CENTRAL DE ABASTOS PUEBLA", 1, "CEDIS MAYORISTA PUEBLA", "CENTRAL DE ABTOS PUEBLA", 11500, "PUEBLA", "CITA 07:00 AM", 19.0911, -98.1812, "07:00 AM"),
        ("Pedido 463002", "A03001", "CENTRAL DE ABASTOS PUEBLA", 1, "CEDIS MAYORISTA PUEBLA", "CENTRAL DE ABTOS PUEBLA", 9800, "PUEBLA", "CITA 08:00 AM", 19.0911, -98.1812, "08:00 AM"),
        ("Pedido 463003", "A03001", "CENTRAL DE ABASTOS PUEBLA", 1, "CEDIS MAYORISTA PUEBLA", "CENTRAL DE ABTOS PUEBLA", 7500, "PUEBLA", "CITA 09:00 AM", 19.0911, -98.1812, "09:00 AM"),
        ("Pedido 463004", "A03002", "TIENDAS SORIANA", 1, "SORIANA MAYORAZGO", "MAYORAZGO", 2400, "PUEBLA", "CITA 08:00 AM", 19.0118, -98.2285, "08:00 AM"),
        ("Pedido 463005", "A03003", "NUEVA WAL MART DE MEXICO", 2, "WALMART CHOLULA", "CHOLULA", 2200, "PUEBLA", "CITA 08:30 AM", 19.0628, -98.3056, "08:30 AM"),
        ("Pedido 463006", "A03004", "TIENDAS NETO", 1, "NETO PUEBLA CENTRO", "AV 5 DE MAYO PUEBLA", 1900, "PUEBLA", "CITA 07:30 AM", 19.0480, -98.1980, "07:30 AM"),
        ("Pedido 463007", "A03005", "CHEDRAUI", 1, "CHEDRAUI CRYSTAL", "5 DE MAYO", 1800, "PUEBLA", "CITA 09:30 AM", 19.0897, -98.1914, "09:30 AM"),
        ("Pedido 463008", "A03006", "PANIFICADORA EL RETIRO", 1, "EL RETIRO PUEBLA", "PUEBLA", 1300, "PUEBLA", "VENTANA HABIL", 19.0550, -98.2250, None),
        ("Pedido 463009", "A03007", "DULCERIA EL GALLITO", 1, "EL GALLITO TEPEACA", "TEPEACA", 950, "PUEBLA", "VENTANA HABIL", 18.9667, -97.9042, None),
        ("Pedido 463010", "A03008", "SUPER CHEDRAUI", 3, "CHEDRAUI TEHUACAN", "TEHUACAN", 850, "PUEBLA 4", "VENTANA HABIL", 18.4631, -97.3917, None),
        ("Pedido 463011", "A03009", "ABARROTES DE TLAXCALA", 1, "TLAXCALA CENTRO", "TLAXCALA PUEBLA", 650, "PUEBLA", "VENTANA HABIL", 19.3180, -98.2380, None),
        ("Pedido 463012", "A03010", "COMERCIAL APETATITLAN", 1, "SAN PABLO APETATITLAN", "TLAXCALA", 350, "PUEBLA", "VENTANA HABIL", 19.3450, -98.1980, None),
        ("Pedido 463013", "A03011", "SUPER TEXMELUCAN", 1, "SAN MARTIN TEXMELUCAN", "SAN MARTIN", 180, "PUEBLA", "VENTANA HABIL", 19.2840, -98.4350, None),
        ("Pedido 463014", "A03012", "DULCERIA DE CHIPILO", 1, "CHIPILO PUEBLA", "CHIPILO", 120, "PUEBLA", "VENTANA HABIL", 19.0080, -98.3280, None),
    ]
    for row in puebla_orders: data.append(row)

    # 2. Corredor Veracruz Centro & Altas Montañas (12 pedidos = 26,800 kg)
    veracruz_centro = [
        ("Pedido 463015", "A03013", "NUEVA WAL MART DE MEXICO", 2, "WALMART BOCA DEL RIO", "PLAZA LAS AMERICAS BOCA DEL RIO", 4500, "VERACRUZ", "CITA 07:30 AM", 19.1411, -96.1080, "07:30 AM"),
        ("Pedido 463016", "A03014", "CHEDRAUI", 2, "CHEDRAUI XALAPA POLIFORUM", "CARRETERA XALAPA VERACRUZ", 3800, "VERACRUZ", "CITA 08:00 AM", 19.5211, -96.8831, "08:00 AM"),
        ("Pedido 463017", "A03015", "COMERCIAL ORIZABA", 1, "ORIZABA CENTRO", "VALLE ORIZABA", 3600, "VERACRUZ", "VENTANA 07:00-16:00", 18.8550, -97.0980, None),
        ("Pedido 463018", "A03016", "TIENDAS SORIANA", 2, "SORIANA HIPER CORDOBA", "BLVD CORDOBA FORTIN", 3200, "VERACRUZ", "CITA 08:30 AM", 18.8950, -96.9520, "08:30 AM"),
        ("Pedido 463019", "A03017", "ABARROTERA CORDOBESA", 1, "CORDOBESA CENTRO", "CORDOBA VER", 2900, "VERACRUZ", "VENTANA HABIL", 18.8920, -96.9350, None),
        ("Pedido 463020", "A03018", "DISTRIBUCIONES DEL PUERTO", 1, "PUERTO VERACRUZ", "CD INDUSTRIAL BRUNO PAGLIAI", 2600, "VERACRUZ", "VENTANA HABIL", 19.1650, -96.2200, None),
        ("Pedido 463021", "A03019", "SUPER MERCADOS CHEDRAUI", 3, "CHEDRAUI CENTRO VERACRUZ", "VERACRUZ PUERTO", 2100, "VERACRUZ", "CITA 09:30 AM", 19.1850, -96.1450, "09:30 AM"),
        ("Pedido 463022", "A03020", "SUPER FORTIN", 1, "FORTIN DE LAS FLORES", "FORTIN", 1400, "VERACRUZ", "VENTANA HABIL", 18.9020, -97.0010, None),
        ("Pedido 463023", "A03021", "ABARROTES DE HUATUSCO", 1, "HUATUSCO CENTRO", "HUATUSCO VERACRUZ", 1100, "VERACRUZ", "VENTANA HABIL", 19.1480, -96.9650, None),
        ("Pedido 463024", "A03022", "MERCANTIL DE NOGALES", 1, "NOGALES VERACRUZ", "ORIZABA AREA", 750, "VERACRUZ", "VENTANA HABIL", 18.8250, -97.1650, None),
        ("Pedido 463025", "A03023", "DULCERIA CORDOBA", 1, "CORDOBA ORIENTE", "CORDOBA VER", 450, "VERACRUZ", "VENTANA HABIL", 18.8850, -96.9200, None),
        ("Pedido 463026", "A03024", "ABARROTES MENDOZA", 1, "CD MENDOZA", "ORIZABA AREA", 300, "VERACRUZ", "VENTANA HABIL", 18.8050, -97.1800, None),
    ]
    for row in veracruz_centro: data.append(row)

    # 3. Corredor Veracruz Norte & Sierra Huasteca (14 pedidos = 24,500 kg)
    veracruz_norte = [
        ("Pedido 463027", "A03025", "CASA CHAPA", 4, "CHAPA POZA RICA", "BLVD RUIZ CORTINES POZA RICA", 3900, "VERACRUZ SUR", "CITA 08:30 AM", 20.5311, -97.4511, "08:30 AM"),
        ("Pedido 463028", "A03026", "CHEDRAUI", 4, "CHEDRAUI POZA RICA", "AV 20 DE NOVIEMBRE POZA RICA", 3200, "VERACRUZ SUR", "CITA 09:00 AM", 20.5500, -97.4300, "09:00 AM"),
        ("Pedido 463029", "A03027", "ABARROTERA DE LA SIERRA", 1, "XICOTEPEC CENTRO", "XICOTEPEC DE JUAREZ", 2800, "VERACRUZ SUR", "SIERRA PUEBLA", 20.3862, -97.8814, "08:30 AM"),
        ("Pedido 463030", "A03028", "COMERCIAL VENUSTIANO", 1, "CARRANZA PUEBLA", "CARRANZA PUEBLA", 2400, "VERACRUZ SUR", "SIERRA PUEBLA", 20.4631, -97.7014, "09:30 AM"),
        ("Pedido 463031", "A03029", "SUPER PAPANTLA", 1, "PAPANTLA CENTRO", "PAPANTLA DE OLARTE", 2100, "VERACRUZ SUR", "VENTANA HABIL", 20.4466, -97.3215, None),
        ("Pedido 463032", "A03030", "MERCANTIL MARTINEZ", 1, "MARTINEZ DE LA TORRE", "MARTINEZ DE LA TORRE", 1900, "VERACRUZ SUR", "VENTANA HABIL", 20.0665, -97.0484, None),
        ("Pedido 463033", "A03031", "DISTRIBUIDORA SAN RAFAEL", 1, "SAN RAFAEL VERACRUZ", "SAN RAFAEL", 1700, "VERACRUZ SUR", "VENTANA HABIL", 20.1884, -96.8689, None),
        ("Pedido 463034", "A03032", "DISTRIBUIDORA TIHUATLAN", 1, "TIHUATLAN CENTRO", "TIHUATLAN VERACRUZ", 1500, "VERACRUZ SUR", "VENTANA HABIL", 20.7211, -97.5311, None),
        ("Pedido 463035", "A03033", "MERCANTIL XICOTEPEC", 1, "XICOTEPEC ALTO", "XICOTEPEC DE JUAREZ", 1300, "VERACRUZ SUR", "VENTANA HABIL", 20.3910, -97.8750, None),
        ("Pedido 463036", "A03034", "ABARROTES TUXPAN", 1, "TUXPAN PUERTO", "POZA RICA RUTA", 1100, "VERACRUZ SUR", "VENTANA HABIL", 20.9550, -97.4050, None),
        ("Pedido 463037", "A03035", "DULCERIA SERRANA", 1, "CARRANZA SUR", "CARRANZA PUEBLA", 950, "VERACRUZ SUR", "VENTANA HABIL", 20.4580, -97.6980, None),
        ("Pedido 463038", "A03036", "SUPER CITRICOLA", 1, "MARTINEZ NORTE", "MARTINEZ DE LA TORRE", 750, "VERACRUZ SUR", "VENTANA HABIL", 20.0750, -97.0400, None),
        ("Pedido 463039", "A03037", "ABARROTES DE LA COSTA", 1, "POZA RICA SUR", "POZA RICA VER", 500, "VERACRUZ SUR", "VENTANA HABIL", 20.5400, -97.4400, None),
        ("Pedido 463040", "A03038", "MINISUPER EL TAJIN", 1, "PAPANTLA NORTE", "PAPANTLA VER", 300, "VERACRUZ SUR", "VENTANA HABIL", 20.4550, -97.3150, None),
    ]
    for row in veracruz_norte: data.append(row)

    # 4. Corredor Veracruz Sur & Olmeca (12 pedidos = 34,200 kg)
    veracruz_sur = [
        ("Pedido 463041", "A03039", "CASA CHAPA", 1, "CHAPA COATZACOALCOS", "COATZACOALCOS", 6200, "VERACRUZ SUR", "CITA 08:30 AM", 18.1456, -94.5364, "08:30 AM"),
        ("Pedido 463042", "A03040", "CASA CHAPA", 2, "CHAPA MINATITLAN", "MINATITLAN", 5800, "VERACRUZ SUR", "CITA 09:30 AM", 17.9950, -94.5420, "09:30 AM"),
        ("Pedido 463043", "A03041", "ABARROTES DE ACAYUCAN", 1, "ACAYUCAN CENTRO", "ACAYUCAN VERACRUZ", 4800, "VERACRUZ SUR", "VENTANA HABIL", 17.9511, -94.9114, None),
        ("Pedido 463044", "A03042", "DISTRIBUIDORA JALTIPAN", 1, "JALTIPAN CENTRO", "COATZACOALCOS RUTA", 4200, "VERACRUZ SUR", "VENTANA HABIL", 17.9710, -94.7150, None),
        ("Pedido 463045", "A03043", "SUPER COATZACOALCOS", 1, "COATZA PUERTO", "COATZACOALCOS", 3600, "VERACRUZ SUR", "VENTANA HABIL", 18.1380, -94.4500, None),
        ("Pedido 463046", "A03044", "MERCANTIL DEL SUR", 1, "MINATITLAN CENTRO", "MINATITLAN", 3100, "VERACRUZ SUR", "VENTANA HABIL", 18.0100, -94.5500, None),
        ("Pedido 463047", "A03045", "ABARROTERA OLMECA", 1, "COATZA INDUSTRIAL", "COATZACOALCOS", 2400, "VERACRUZ SUR", "VENTANA HABIL", 18.1250, -94.4800, None),
        ("Pedido 463048", "A03046", "COMERCIAL ACAYUCAN", 1, "ACAYUCAN SUR", "ACAYUCAN VERACRUZ", 1800, "VERACRUZ SUR", "VENTANA HABIL", 17.9400, -94.9200, None),
        ("Pedido 463049", "A03047", "DULCERIA MINATITLAN", 1, "MINATITLAN SUR", "MINATITLAN", 950, "VERACRUZ SUR", "VENTANA HABIL", 17.9850, -94.5300, None),
        ("Pedido 463050", "A03048", "SUPER JALTIPAN", 1, "JALTIPAN SUR", "JALTIPAN", 650, "VERACRUZ SUR", "VENTANA HABIL", 17.9650, -94.7200, None),
        ("Pedido 463051", "A03049", "ABARROTES COSWAL", 1, "COATZA ORIENTE", "COATZACOALCOS", 450, "VERACRUZ SUR", "VENTANA HABIL", 18.1400, -94.5200, None),
        ("Pedido 463052", "A03050", "MINISUPER COATZA", 1, "COATZA PONIENTE", "COATZACOALCOS", 250, "VERACRUZ SUR", "VENTANA HABIL", 18.1300, -94.5600, None),
    ]
    for row in veracruz_sur: data.append(row)

    # 5. Corredor Oaxaca Valles & Istmo (12 pedidos = 27,900 kg)
    oaxaca_orders = [
        ("Pedido 463053", "A03051", "SERVI-DISTRIBUCIONES OAXACA", 2, "SERVI OAXACA MONTOYA", "MONTOYA OAXACA JUAREZ", 5200, "OAXACA", "VENTANA HABIL", 17.0714, -96.7522, None),
        ("Pedido 463054", "A03052", "TIENDAS SORIANA", 3, "SORIANA TUXTEPEC", "AV INDEPENDENCIA TUXTEPEC", 4500, "OAXACA", "CITA 08:30 AM", 18.0850, -96.1250, "08:30 AM"),
        ("Pedido 463055", "A03053", "ABARROTES DE SALINA CRUZ", 1, "SALINA CRUZ PUERTO", "SALINA CRUZ OAXACA", 3900, "OAXACA", "CITA 09:30 AM", 16.1833, -95.2000, "09:30 AM"),
        ("Pedido 463056", "A03054", "DISTRIBUIDORA SAN JORGE", 1, "SAN JORGE JUCHITAN", "JUCHITAN DE ZARAGOZA", 3600, "OAXACA", "CITA 10:00 AM", 16.4444, -95.0180, "10:00 AM"),
        ("Pedido 463057", "A03055", "ABARROTES SAN AGUSTIN", 1, "SAN AGUSTIN OAXACA", "SAN AGUSTIN DE LAS JUNTAS", 3100, "OAXACA", "VENTANA HABIL", 17.0225, -96.7114, None),
        ("Pedido 463058", "A03056", "DISTRIBUIDORA XOXO", 1, "XOXO OAXACA", "SANTA CRUZ XOXOCOTLAN", 2500, "OAXACA", "VENTANA HABIL", 17.0311, -96.7328, None),
        ("Pedido 463059", "A03057", "ABARROTES EL ROBLE", 1, "EL ROBLE TEHUANTEPEC", "TEHUANTEPEC OAXACA", 1800, "OAXACA", "VENTANA HABIL", 16.3244, -95.2411, None),
        ("Pedido 463060", "A03058", "ABARROTES DE ANITA", 1, "STA ANITA OAXACA", "STA ANITA OAXACA", 1400, "OAXACA", "VENTANA HABIL", 17.0589, -96.7214, None),
        ("Pedido 463061", "A03059", "COMERCIAL OAXACA", 1, "OAXACA CENTRO", "OAXACA DE JUAREZ", 950, "OAXACA", "VENTANA HABIL", 17.0654, -96.7236, None),
        ("Pedido 463062", "A03060", "DULCERIA DEL VALLE", 1, "OAXACA SUR", "OAXACA CENTRO", 550, "OAXACA", "VENTANA HABIL", 17.0500, -96.7150, None),
        ("Pedido 463063", "A03061", "MERCANTIL DE TEHUANTEPEC", 1, "TEHUANTEPEC CENTRO", "TEHUANTEPEC", 250, "OAXACA", "VENTANA HABIL", 16.3300, -95.2350, None),
        ("Pedido 463064", "A03062", "ABARROTES DE JUCHITAN", 1, "JUCHITAN SECCION 2", "JUCHITAN", 150, "OAXACA", "VENTANA HABIL", 16.4400, -95.0250, None),
    ]
    for row in oaxaca_orders: data.append(row)

    # 6. Corredor Sureste / Chiapas & Tabasco (13 pedidos = 48,900 kg)
    chiapas_tabasco = [
        ("Pedido 463065", "A03063", "NUEVA WAL MART DE MEXICO", 1, "CEDIS MONTERREY TABASCO", "MONTERREY CEDIS", 8200, "TABASCO", "CITA 07:00 AM", 18.0382, -92.9031, "07:00 AM"),
        ("Pedido 463066", "A03064", "COMERCIALIZADORA DEL SOCONUSCO", 1, "SUCHIATE CENTRO", "SUCHIATE CHIAPAS", 8100, "CHIAPAS", "FRONTERA SUR FTL", 14.6834, -92.1504, "08:00 AM"),
        ("Pedido 463067", "A03065", "EXPORTADORA GUATEMEX", 1, "CD HIDALGO PUERTO", "CD. HIDALGO CHIAPAS", 7400, "CHIAPAS", "FRONTERA SUR FTL", 14.6850, -92.1480, "09:00 AM"),
        ("Pedido 463068", "A03066", "ABARROTERA CENTRAL DE CHIAPAS", 1, "CEDIS TUXTLA MAYORISTA", "LIBRAMIENTO TUXTLA", 6500, "CHIAPAS", "VENTANA HABIL", 16.7511, -93.1189, "08:30 AM"),
        ("Pedido 463069", "A03067", "ENBE S.A. DE C.V.", 1, "ENBE CARDENAS", "CARDENAS TABASCO", 5400, "TABASCO", "VENTANA HABIL", 17.9914, -93.3811, "09:00 AM"),
        ("Pedido 463070", "A03068", "COMERCIALIZADORA PROSUR", 1, "PROSUR HUIMANGUILLO", "HUIMANGUILLO TABASCO", 4200, "TABASCO", "VENTANA HABIL", 17.8331, -93.3914, "10:00 AM"),
        ("Pedido 463071", "A03069", "SOCORRO HERNANDEZ JIMENEZ", 1, "PALENQUE CENTRO", "PALENQUE CHIAPAS", 3500, "TABASCO", "VENTANA HABIL", 17.5111, -91.9811, None),
        ("Pedido 463072", "A03070", "ABARROTES DE VILLAHERMOSA", 1, "VILLAHERMOSA CENTRO", "VILLAHERMOSA TABASCO", 2800, "TABASCO", "VENTANA HABIL", 17.9892, -92.9281, None),
        ("Pedido 463073", "A03071", "SURTIABARROTES DE CHIAPAS", 1, "SURTIABARROTES TUXTLA", "TUXTLA GUTIERREZ", 1200, "CHIAPAS", "VENTANA HABIL", 16.7300, -93.1000, None),
        ("Pedido 463074", "A03072", "ALMACEN DEL EDEN", 1, "CARDENAS INDUSTRIAL", "CARDENAS TABASCO", 650, "TABASCO", "VENTANA HABIL", 17.9850, -93.3750, None),
        ("Pedido 463075", "A03073", "AGROQUIMICOS DEL SUR", 1, "SUCHIATE AGRO", "SUCHIATE CHIAPAS", 450, "CHIAPAS", "VENTANA HABIL", 14.6900, -92.1550, None),
        ("Pedido 463076", "A03074", "DULCERIA TABASQUEÑA", 1, "VILLAHERMOSA NORTE", "VILLAHERMOSA TABASCO", 300, "TABASCO", "VENTANA HABIL", 18.0100, -92.9100, None),
        ("Pedido 463077", "A03075", "MERCANTIL DE PALENQUE", 1, "PALENQUE ACCESO", "PALENQUE", 200, "TABASCO", "VENTANA HABIL", 17.5050, -91.9750, None),
    ]
    for row in chiapas_tabasco: data.append(row)

    # 7. Corredor Península de Yucatán (8 pedidos = 17,850 kg)
    #    -> 7 pedidos consolidados en Mérida/Campeche (17,200 kg)
    #    -> 1 PEDIDO OUTLIER REAL EN ESCARCEGA / CANDELARIA (650 kg)
    peninsula_orders = [
        ("Pedido 463078", "A03076", "PROVEEDORA DEL PANADERO", 1, "CEDIS PROVEEDORA MERIDA", "PROVEEDORA DEL PANADERO", 5800, "PENINSULA", "CITA 08:30 AM", 20.9500, -89.6500, "08:30 AM"),
        ("Pedido 463079", "A03077", "PROVEEDORA DEL PANADERO", 2, "CEDIS PROVEEDORA MERIDA", "PROVEEDORA DEL PANADERO", 4800, "PENINSULA", "CITA 09:30 AM", 20.9500, -89.6500, "09:30 AM"),
        ("Pedido 463080", "A03078", "ABARROTES DE MERIDA", 1, "MERIDA CENTRO", "MERIDA YUCATAN", 3600, "PENINSULA", "VENTANA HABIL", 20.9674, -89.5926, None),
        ("Pedido 463081", "A03079", "SUPER SAN FRANCISCO", 1, "SAN FRANCISCO CAMPECHE", "PATRICIO TRUEBA", 1800, "PENINSULA", "CITA 08:00 AM", 19.8211, -90.5311, "08:00 AM"),
        ("Pedido 463082", "A03080", "COMERCIAL KANASIN", 1, "KANASIN CENTRO", "KANASIN", 700, "PENINSULA", "VENTANA HABIL", 20.9355, -89.5579, None),
        ("Pedido 463083", "A03081", "DISTRIBUCIONES TIXCACAL", 1, "TIXCACAL MERIDA", "TIXCACAL", 350, "PENINSULA", "VENTANA HABIL", 20.9411, -89.6711, None),
        ("Pedido 463084", "A03082", "ABARROTES DE HUNUCMA", 1, "HUNUCMA YUCATAN", "HUNUCMA", 150, "PENINSULA", "VENTANA HABIL", 21.0211, -89.8814, None),
        
        # ⚠️ OUTLIER AUTÉNTICO: Candelaria / Escárcega, Campeche (650 kg, a 290 km al sur de Mérida)
        ("Pedido 463085", "A03999", "ABARROTES DE LA SELVA", 1, "CANDELARIA CENTRO", "TIENDA RURAL CANDELARIA CAMPECHE", 650, "PENINSULA", "DESVIO SELVA CANDELARIA", 18.1850, -90.7950, None),
    ]
    for row in peninsula_orders: data.append(row)

    now = datetime.datetime(2026, 9, 28, 8, 30)
    for p in data:
        mov, cli, nom, suc, nom_suc, obs, peso, ruta, age_txt, lat, lng, cita_hora = p
        ws.append([
            mov, cli, now.date(), now, None,
            nom, suc, nom_suc, obs, peso,
            ruta, round(peso * 24.5, 2), round(peso * 24.5, 2), "30 DIAS", now.date() + datetime.timedelta(days=1),
            "CISAALMA", "REF-NACIONAL", obs, None, "PENDIENTE",
            None, None, None, "ISABELM", age_txt,
            lat, lng, cita_hora
        ])
        
    style_excel_sheet(ws, title_color="4338CA") # Indigo for National Master Case
    wb.save("RETO_3_CASO_MAESTRO_RED_NACIONAL_Y_BACKORDER.xlsx")
    print(f"✅ RETO 3 generado con éxito: RETO_3_CASO_MAESTRO_RED_NACIONAL_Y_BACKORDER.xlsx ({len(data)} pedidos)")

if __name__ == '__main__':
    create_reto_1()
    create_reto_2()
    create_reto_3()
    print('🎯 TODOS LOS ARCHIVOS DE RETO HAN SIDO GENERADOS.')
