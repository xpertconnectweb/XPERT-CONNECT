"""
Writes the body-shop list as the xlsx behind the client's Google Sheet.

    python scripts/bodyshops/xlsx.py [--date "noviembre de 2026"] [--out PATH]

The layout started as a copy of the client's lawyers Sheet ("BASE DE DATOS
ABOGADOS FLORIDA"): navy header with gold, a coloured band per region and a
band per county. On 2026-11-05 the client asked for it to look much more
professional, and to be able to check every row. So, keeping that identity:

- a Summary tab first, with the totals, the regions and how shops were checked;
- quiet data rows (white and a faint zebra, hairline rules, no black grid);
- the region colours only on the region bands; county bands in light grey with
  their count and ZIP range;
- every shop with a Google Maps link and a "Verificado en" link to the page
  that confirms it, so the client can check any row in one click.

No formulas: the numbers are written in, since the Sheet is regenerated
rather than edited.
"""

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import quote_plus

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "bodyshops" / "bodyshops.json"

FONT = "Arial"
NAVY = "FF073763"
GOLD = "FFBF9000"
INK = "FF1F2937"
MUTED = "FF6B7280"
RULE = "FFE5E7EB"
ZEBRA = "FFF8FAFC"
LINK = "FF1155CC"
COUNTY_FILL = "FFF1F3F6"

HAIR = Side(style="thin", color=RULE)
GOLD_RULE = Side(style="medium", color=GOLD)
fill = lambda c: PatternFill("solid", fgColor=c)

# The lawyers Sheet's three bands and colours, kept from the first version.
BANDS = {
    "FL": [
        ("🟨", "CENTRAL FLORIDA", "FFFFF2CC"),
        ("🟦", "NORTH FLORIDA / PANHANDLE", "FFC9DAF8"),
        ("🟥", "SOUTH FLORIDA", "FFF4CCCC"),
    ],
    "MN": [
        ("🟨", "TWIN CITIES METRO", "FFFFF2CC"),
        ("🟦", "NORTHERN MINNESOTA", "FFC9DAF8"),
        ("🟥", "SOUTHERN MINNESOTA", "FFF4CCCC"),
    ],
}
STATE_NAME = {"FL": "Florida", "MN": "Minnesota"}

EVIDENCE = {
    "chain": "Página de la cadena",
    "registry": "Registro del estado (FDACS)",
    "website": "Sitio web del taller",
    "association": "Asociación AASP-MN",
    "directory": "Directorio de reseñas",
    "none": "Registro EPA",
}
EVIDENCE_MEANING = {
    "chain": "La sucursal aparece hoy en el sitio oficial de la cadena, con su dirección y teléfono.",
    "registry": "Registro vigente en la División de Servicios al Consumidor de Florida (FDACS), obligatorio para todo taller.",
    "website": "El sitio web del propio taller muestra el mismo número de teléfono.",
    "association": "Miembro de la Alliance of Automotive Service Providers of Minnesota (AASP-MN).",
}
PENDING_REASON = {
    "directory": "Solo en un directorio de reseñas: llamar para confirmar",
    "none": "Solo en el registro de la EPA, sin teléfono confirmado",
}


def maps_url(r):
    return "https://www.google.com/maps/search/?api=1&query=" + quote_plus(
        f"{r['name']}, {r['street']}, {r['city']}, {r['state']} {r['zip']}"
    )


def website_label(url):
    host = url.split("//", 1)[-1].split("/", 1)[0]
    return host[4:] if host.startswith("www.") else host


# (header, width, alignment, kind)
COLUMNS = [
    ("Taller", 44, "left", "name"),
    ("Tipo", 24, "left", "brand"),
    ("Dirección", 34, "left", "street"),
    ("Ciudad", 18, "left", "city"),
    ("Condado", 15, "left", "county"),
    ("ZIP", 8, "center", "zip"),
    ("Teléfono", 15, "center", "phone"),
    ("Sitio web", 28, "left", "website"),
    ("Mapa", 10, "center", "map"),
    ("Verificado en", 30, "left", "evidence"),
]
PENDING_COLUMNS = COLUMNS[:-1] + [("Motivo", 44, "left", "reason")]


def text_font(size=10, bold=False, color=INK, italic=False, underline=None):
    return Font(name=FONT, size=size, bold=bold, color=color, italic=italic, underline=underline)


def header(ws, columns):
    ws.sheet_view.showGridLines = False
    for i, (name, width, align, _) in enumerate(columns, start=1):
        c = ws.cell(row=1, column=i, value=name)
        c.font = text_font(10, True, "FFFFFFFF")
        c.fill = fill(NAVY)
        c.alignment = Alignment(horizontal="center" if align == "center" else "left", vertical="center", indent=0 if align == "center" else 1)
        c.border = Border(bottom=GOLD_RULE)
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.row_dimensions[1].height = 30
    ws.freeze_panes = "B2"


def band_row(ws, row, text, ncols, bg, size, bold, color, height):
    for i in range(1, ncols + 1):
        c = ws.cell(row=row, column=i)
        c.fill = fill(bg)
        c.border = Border(bottom=HAIR)
    c = ws.cell(row=row, column=1, value=text)
    c.font = text_font(size, bold, color)
    c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=ncols)
    ws.row_dimensions[row].height = height


def data_row(ws, row, r, columns, zebra):
    bg = fill(ZEBRA) if zebra else None
    for i, (_, _, align, kind) in enumerate(columns, start=1):
        c = ws.cell(row=row, column=i)
        if bg:
            c.fill = bg
        c.border = Border(bottom=HAIR)
        c.font = text_font()
        c.alignment = Alignment(
            horizontal="center" if align == "center" else "left",
            vertical="center",
            indent=0 if align == "center" else 1,
        )
        if kind == "name":
            c.value = r["name"]
            c.font = text_font(10, True)
        elif kind == "brand":
            c.value = r["brand"] or "Independiente"
            c.font = text_font(10, bool(r["brand"]), NAVY if r["brand"] else MUTED)
        elif kind == "street":
            c.value = r["street"]
        elif kind == "city":
            c.value = r["city"]
        elif kind == "county":
            c.value = r["county"]
        elif kind == "zip":
            c.value = r["zip"]
            c.number_format = "@"
            c.font = text_font(10, color=LINK)
        elif kind == "phone":
            c.value = r["phone"] or "—"
            c.number_format = "@"
            if not r["phone"]:
                c.font = text_font(10, color=MUTED)
        elif kind == "website":
            if r["website"]:
                c.value = website_label(r["website"])
                c.hyperlink = r["website"]
                c.font = text_font(10, color=LINK, underline="single")
        elif kind == "map":
            c.value = "Ver mapa"
            c.hyperlink = maps_url(r)
            c.font = text_font(9, color=LINK, underline="single")
        elif kind == "evidence":
            c.value = EVIDENCE[r["evidence"]]
            if r["evidenceUrl"]:
                c.hyperlink = r["evidenceUrl"]
                c.font = text_font(10, color=LINK, underline="single")
        elif kind == "reason":
            c.value = PENDING_REASON.get(r["evidence"], "Sin confirmar")
            c.font = text_font(10, color=MUTED, italic=True)
            if r["evidenceUrl"]:
                c.hyperlink = r["evidenceUrl"]
    ws.row_dimensions[row].height = 20


def county_label(county, rows):
    zips = sorted(r["zip"] for r in rows)
    span = f"{zips[0]} – {zips[-1]}" if zips[0] != zips[-1] else zips[0]
    n = len(rows)
    return f"{(county or 'Sin condado').upper()} COUNTY   ·   {n} {'taller' if n == 1 else 'talleres'}   ·   ZIP {span}"


def write_grouped(ws, rows, columns, states):
    r = 2
    ncols = len(columns)
    for state in states:
        for emoji, band, color in BANDS[state]:
            in_band = [x for x in rows if x["state"] == state and x["band"] == band]
            if not in_band:
                continue
            label = f"{emoji}  {band}"
            if len(states) > 1 and STATE_NAME[state].upper() not in band:
                label += f" ({STATE_NAME[state].upper()})"
            label += f"   ·   {len(in_band)} talleres"
            band_row(ws, r, label, ncols, color, 12, True, NAVY, 28)
            r += 1
            by_county = defaultdict(list)
            for x in in_band:
                by_county[x["county"]].append(x)
            for county in sorted(by_county, key=lambda c: (-len(by_county[c]), c)):
                shops = sorted(by_county[county], key=lambda x: (x["city"], x["name"]))
                band_row(ws, r, county_label(county, shops), ncols, COUNTY_FILL, 10, True, "FF374151", 22)
                r += 1
                for i, x in enumerate(shops):
                    data_row(ws, r, x, columns, i % 2 == 1)
                    r += 1
    ws.auto_filter.ref = f"A1:{get_column_letter(ncols)}{r - 1}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = "1:1"
    return r


def cell(ws, row, col, value=None, font=None, bg=None, align="left", border=None, wrap=False, indent=None):
    c = ws.cell(row=row, column=col, value=value)
    if font:
        c.font = font
    if bg:
        c.fill = fill(bg)
    if border:
        c.border = border
    c.alignment = Alignment(
        horizontal=align,
        vertical="center",
        wrap_text=wrap,
        indent=(1 if align == "left" else 0) if indent is None else indent,
    )
    return c


def table_header(ws, row, spans):
    """spans: [(first_col, last_col, label, align)] on a navy bar."""
    for first, last, label, align in spans:
        for col in range(first, last + 1):
            cell(ws, row, col, font=text_font(9, True, "FFFFFFFF"), bg=NAVY)
        cell(ws, row, first, label, text_font(9, True, "FFFFFFFF"), NAVY, align)
        if last > first:
            ws.merge_cells(start_row=row, start_column=first, end_row=row, end_column=last)
    ws.row_dimensions[row].height = 24


def summary(ws, shops, date):
    """One screen: the headline numbers, the regions, and how shops were checked.

    Columns B..I are one even grid (eight columns of 15), so the four tiles and
    both tables line up.
    """
    ws.title = "Resumen"
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 3
    for col in "BCDEFGHI":
        ws.column_dimensions[col].width = 15

    conf = [s for s in shops if s["confirmed"]]
    pending = [s for s in shops if not s["confirmed"]]

    cell(ws, 2, 2, "Body Shops — Florida y Minnesota", text_font(20, True, NAVY), indent=0)
    ws.row_dimensions[2].height = 34
    cell(ws, 3, 2, f"Talleres de carrocería y colisión, verificados uno por uno · Actualizado {date}", text_font(10, color=MUTED), indent=0)
    for col in range(2, 10):
        ws.cell(row=4, column=col).border = Border(bottom=GOLD_RULE)
    ws.row_dimensions[4].height = 8

    tiles = [
        (sum(1 for s in conf if s["state"] == "FL"), "talleres verificados en Florida"),
        (sum(1 for s in conf if s["state"] == "MN"), "talleres verificados en Minnesota"),
        (sum(1 for s in conf if s["brand"]), "sucursales de cadenas"),
        (sum(1 for s in conf if not s["brand"]), "talleres independientes"),
    ]
    for i, (number, label) in enumerate(tiles):
        first = 2 + 2 * i
        for row in (6, 7):
            for col in (first, first + 1):
                ws.cell(row=row, column=col).fill = fill(ZEBRA)
            ws.merge_cells(start_row=row, start_column=first, end_row=row, end_column=first + 1)
        cell(ws, 6, first, f"{number:,}", text_font(24, True, NAVY), ZEBRA)
        cell(ws, 7, first, label, text_font(9, color=MUTED), ZEBRA)
        ws.cell(row=6, column=first).border = Border(left=Side(style="thick", color=GOLD))
        ws.cell(row=7, column=first).border = Border(left=Side(style="thick", color=GOLD))
    ws.row_dimensions[5].height = 10
    ws.row_dimensions[6].height = 38
    ws.row_dimensions[7].height = 20

    # Regions.
    r = 10
    cell(ws, r, 2, "Por región", text_font(12, True, NAVY), indent=0)
    ws.row_dimensions[r].height = 22
    r += 1
    table_header(ws, r, [(2, 2, "Estado", "left"), (3, 5, "Región", "left"), (6, 6, "Talleres", "center"), (7, 7, "Cadenas", "center"), (8, 9, "Independientes", "center")])
    for state in ("FL", "MN"):
        for emoji, band, color in BANDS[state]:
            rows = [s for s in conf if s["state"] == state and s["band"] == band]
            r += 1
            line = Border(bottom=HAIR)
            cell(ws, r, 2, STATE_NAME[state], text_font(10), border=line)
            for col in (3, 4, 5):
                cell(ws, r, col, bg=color, border=line)
            cell(ws, r, 3, f"{emoji}  {band.title()}", text_font(10, True, NAVY), color, border=line)
            ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=5)
            cell(ws, r, 6, len(rows), text_font(10, True), align="center", border=line)
            cell(ws, r, 7, sum(1 for s in rows if s["brand"]), text_font(10), align="center", border=line)
            cell(ws, r, 8, sum(1 for s in rows if not s["brand"]), text_font(10), align="center", border=line)
            cell(ws, r, 9, border=line)
            ws.merge_cells(start_row=r, start_column=8, end_row=r, end_column=9)
            ws.row_dimensions[r].height = 22
    r += 1
    top = Border(top=GOLD_RULE)
    for col in range(2, 10):
        cell(ws, r, col, border=top)
    cell(ws, r, 2, "Total", text_font(10, True, NAVY), border=top)
    cell(ws, r, 6, len(conf), text_font(10, True, NAVY), align="center", border=top)
    cell(ws, r, 7, sum(1 for s in conf if s["brand"]), text_font(10, True, NAVY), align="center", border=top)
    cell(ws, r, 8, sum(1 for s in conf if not s["brand"]), text_font(10, True, NAVY), align="center", border=top)
    ws.merge_cells(start_row=r, start_column=8, end_row=r, end_column=9)
    ws.row_dimensions[r].height = 24

    # How each shop was checked.
    r += 3
    cell(ws, r, 2, "Cómo se verificó cada taller", text_font(12, True, NAVY), indent=0)
    ws.row_dimensions[r].height = 22
    r += 1
    table_header(ws, r, [(2, 3, "Verificado en", "left"), (4, 4, "Florida", "center"), (5, 5, "Minnesota", "center"), (6, 9, "Qué significa", "left")])
    counts = Counter((s["state"], s["evidence"]) for s in conf)
    for key in ("chain", "registry", "website", "association"):
        r += 1
        line = Border(bottom=HAIR)
        for col in range(2, 10):
            cell(ws, r, col, border=line)
        cell(ws, r, 2, EVIDENCE[key], text_font(10, True), border=line)
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
        cell(ws, r, 4, counts[("FL", key)] or "—", text_font(10), align="center", border=line)
        cell(ws, r, 5, counts[("MN", key)] or "—", text_font(10), align="center", border=line)
        cell(ws, r, 6, EVIDENCE_MEANING[key], text_font(9, color=MUTED), border=line, wrap=True)
        ws.merge_cells(start_row=r, start_column=6, end_row=r, end_column=9)
        ws.row_dimensions[r].height = 32

    r += 2
    notes = [
        f"Por verificar ({len(pending):,} talleres): aparecen en el registro de talleres de carrocería de la EPA o en directorios de reseñas, "
        "pero no en una fuente oficial. Están en su propia pestaña con el motivo; conviene llamar antes de usarlos.",
        "Cada fila tiene un enlace a Google Maps y otro a la página que la confirma.",
    ]
    for text in notes:
        cell(ws, r, 2, text, text_font(9, color=MUTED), wrap=True, indent=0)
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=9)
        ws.row_dimensions[r].height = 30
        r += 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default="noviembre de 2026")
    ap.add_argument("--out", default=str(ROOT / "docs" / "Body Shops - Florida y Minnesota.xlsx"))
    args = ap.parse_args()

    shops = json.loads(DATA.read_text(encoding="utf-8"))
    missing = [s["id"] for s in shops if s["band"] not in {b for v in BANDS.values() for _, b, _ in v}]
    assert not missing, f"shops with no band: {missing[:5]}"

    wb = Workbook()
    summary(wb.active, shops, args.date)
    for state in ("FL", "MN"):
        ws = wb.create_sheet(STATE_NAME[state])
        header(ws, COLUMNS)
        write_grouped(ws, [s for s in shops if s["state"] == state and s["confirmed"]], COLUMNS, [state])
        ws.sheet_properties.tabColor = NAVY[2:]

    ws = wb.create_sheet("Por verificar")
    header(ws, PENDING_COLUMNS)
    write_grouped(ws, [s for s in shops if not s["confirmed"]], PENDING_COLUMNS, ["FL", "MN"])
    ws.sheet_properties.tabColor = "9CA3AF"

    wb.active = 0
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    counts = Counter((s["state"], s["confirmed"]) for s in shops)
    print(
        f"FL {counts[('FL', True)]} verificados, MN {counts[('MN', True)]} verificados, "
        f"{counts[('FL', False)] + counts[('MN', False)]} por verificar -> {out}"
    )


if __name__ == "__main__":
    main()
