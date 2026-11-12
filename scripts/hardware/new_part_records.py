"""Electrical records for the parts added for drones, ROVs, task tools and gantries (python/ttr_build/components/aerial.py,
tools.py). Merged into packages/parts/data/electrical.json:   python3 scripts/hardware/new_part_records.py

Every value says where it comes from: a product page that was read (src datasheet + url) or an estimate with the reason.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "packages/parts/data/electrical.json"


def ds(v, url, note=None):
    r = {"v": v, "src": "datasheet", "url": url}
    if note: r["note"] = note
    return r


def est(v, note):
    return {"v": v, "src": "estimated", "note": note}


def pin(p, name, signal, d):
    return {"pin": p, "name": name, "signal": signal, "dir": d}


def port(name, conn, mate, pins, src):
    return {"name": name, "connector": src(conn), "mate": src(mate), "pins": src(pins)}


def rec(body, holes, role, v, i, ports, heat=None, output=None, notes=None, no_holes=False):
    r = {"dimensions": {"body_mm": body, "holes": holes}, "electrical": {"role": role, "voltage_v": v, "current_a": i, "ports": ports}}
    if no_holes: r["no_holes"] = True
    if heat is not None: r["electrical"]["heat_w"] = heat
    if output is not None: r["electrical"]["output"] = output
    if notes: r["electrical"]["notes"] = notes
    return r


IFL = "https://shop.iflight.com/xing2-2207-unibell-fpv-motor-pro1504"
SPB = "https://www.speedybee.com/speedybee-bls-50a-30x30-4-in-1-esc/"
FC = "https://www.speedybee.com/speedybee-f405-v4-bls-55a-30x30-fc-esc-stack/"
RP1 = "https://www.radiomasterrc.com/products/rp1-expresslrs-2-4ghz-nano-receiver"
CDX = "https://caddxfpv.com/products/caddxfpv-ratel-2-starlight-hdr-fpv-camera"
CNHL = "https://chinahobbyline.com/products/cnhl-black-series-1500mah-14-8v-4s-100c-lipo-battery-with-xt60-plug"
T200 = "https://bluerobotics.com/store/thrusters/t100-t200-thrusters/t200-thruster-r2-rp/"
BESC = "https://bluerobotics.com/store/thrusters/speed-controllers/besc30-r3/"
ADA_AMP = "https://www.adafruit.com/product/3006"

P = lambda note: (lambda v: est(v, note))
E = "typical of the part class; no datasheet table was read"

R = {}
R["bldc_2207_1750kv"] = rec(ds([27.5, 27.5, 32.5], IFL), ds([{"x": 8, "y": 8, "d": 3.0, "thread": "M3"}, {"x": -8, "y": 8, "d": 3.0, "thread": "M3"}, {"x": 8, "y": -8, "d": 3.0, "thread": "M3"}, {"x": -8, "y": -8, "d": 3.0, "thread": "M3"}], IFL, "16 x 16 mm M3 pattern"),
    "actuator", ds({"min": 11.1, "nom": 14.8, "max": 25.2}, IFL, "rated 4-6S"), est({"typical": 8.8, "peak": 33.0}, "hover about 8.8 A, full throttle about 33 A with a 5 x 4.3 x 3 prop on 4S, read off typical 2207 1750 KV test charts"),
    [port("phases", "Three 20 AWG motor leads, soldered to the ESC pads", "ESC motor pads, solder", [pin("A", "A", "motor_phase", "in"), pin("B", "B", "motor_phase", "in"), pin("C", "C", "motor_phase", "in")], P("brushless motor leads; any two swapped reverses the direction"))],
    heat=est(12.0, "about 15 % loss at hover current in a 2207 motor"))
R["esc_4in1_45a"] = rec(ds([41, 41, 5.8], SPB), ds([{"x": 5.25, "y": 5.25, "d": 4.0, "thread": "M3"}, {"x": 35.75, "y": 5.25, "d": 4.0, "thread": "M3"}, {"x": 5.25, "y": 35.75, "d": 4.0, "thread": "M3"}, {"x": 35.75, "y": 35.75, "d": 4.0, "thread": "M3"}], SPB, "30.5 mm square, holes for M3 grommets"),
    "driver", ds({"min": 11.1, "nom": 14.8, "max": 25.2}, SPB, "3-6S"), ds({"typical": 35.0, "peak": 160.0}, SPB, "45-50 A continuous per motor; typical is a hover estimate for four motors"),
    [port("power", "Battery solder pads, XT60 pigtail with low-ESR capacitor", "XT60 lead to the pack", [pin("+", "VBAT+", "power", "power_in"), pin("-", "GND", "ground", "power_in")], P("standard 4-in-1 pads")),
     port("fc", "8-pin JST-SH 1.0 mm, cable supplied with the stack", "matching cable to the flight controller", [pin("1", "VBAT", "power", "power_out"), pin("2", "GND_FC", "ground", "power_out"), pin("3", "CUR", "analog", "out"), pin("4", "TLM", "uart_tx", "out"), pin("5", "M1", "digital", "in"), pin("6", "M2", "digital", "in"), pin("7", "M3", "digital", "in"), pin("8", "M4", "digital", "in")], P("SpeedyBee / Betaflight 8-pin order; check the silk on the board you buy")),
     *[port(f"motor{k}", "Motor solder pads", "motor leads, solder", [pin(f"{k}A", f"M{k}A", "motor_phase", "out"), pin(f"{k}B", f"M{k}B", "motor_phase", "out"), pin(f"{k}C", f"M{k}C", "motor_phase", "out")], P("three pads per motor")) for k in range(1, 5)]],
    heat=est(1.2, "about 0.3 W per channel at the 2 A hover current of a 5 in quad (conduction and switching losses)"), output=est({"voltage_v": 14.8, "current_a": 45.0}, "per motor channel"))
R["fc_f405_30x30"] = rec(ds([41, 38.5, 4.8], FC), ds([{"x": 5.25, "y": 3.75, "d": 4.0, "thread": "M3"}, {"x": 35.75, "y": 3.75, "d": 4.0, "thread": "M3"}, {"x": 5.25, "y": 34.25, "d": 4.0, "thread": "M3"}, {"x": 35.75, "y": 34.25, "d": 4.0, "thread": "M3"}], FC, "30.5 mm square"),
    "controller", ds({"min": 7.0, "nom": 14.8, "max": 26.0}, FC, "powered through the ESC connector, 2-6S"), est({"typical": 0.15, "peak": 0.4}, "F405 boards draw 100-200 mA from the pack without peripherals"),
    [port("esc", "8-pin JST-SH 1.0 mm, cable supplied with the stack", "matching cable to the ESC", [pin("1", "VBAT", "power", "power_in"), pin("2", "GND", "ground", "power_in"), pin("3", "CUR", "analog", "in"), pin("4", "TLM", "uart_rx", "in"), pin("5", "M1", "digital", "out"), pin("6", "M2", "digital", "out"), pin("7", "M3", "digital", "out"), pin("8", "M4", "digital", "out")], P("mirror of the ESC side")),
     port("rx", "Solder pads (UART2, 5 V)", "receiver leads, solder", [pin("5V", "5V", "power", "power_out"), pin("G", "GND_RX", "ground", "power_out"), pin("T2", "TX2", "uart_tx", "out"), pin("R2", "RX2", "uart_rx", "in")], P("UART pads with a 5 V pad beside them")),
     port("cam", "Solder pads (camera)", "camera leads, solder", [pin("9V", "VCAM", "power", "power_out"), pin("G", "GND_CAM", "ground", "power_out"), pin("CAM", "VIDEO_IN", "analog", "in")], P("camera pads beside the OSD chip")),
     port("usb", "USB-C", "USB-C cable to a computer (setup only)", [pin("VBUS", "VBUS", "usb", "power_in"), pin("D", "USB_D", "usb", "bidir")], P("for Betaflight / INAV setup"))],
    heat=est(0.8, "MCU, IMU and OSD at about 150 mA"), output=est({"voltage_v": 5.0, "current_a": 2.0}, "on-board 5 V BEC"))
R["elrs_receiver_nano"] = rec(ds([18, 11, 4], RP1), est([], "no holes: heat-shrunk and taped"), "sensor", ds({"min": 4.5, "nom": 5.0, "max": 5.5}, RP1), est({"typical": 0.05, "peak": 0.1}, "ELRS nano receivers draw about 50 mA"),
    [port("main", "4 solder pads", "leads to the flight controller UART", [pin("5V", "5V", "power", "power_in"), pin("G", "GND", "ground", "power_in"), pin("T", "TX", "uart_tx", "out"), pin("R", "RX", "uart_rx", "in")], P("CRSF at 420 kbaud"))], no_holes=True)
R["fpv_camera_micro"] = rec(ds([19, 19, 22], CDX), est([], "side M2 screws only"), "sensor", ds({"min": 5.0, "nom": 9.0, "max": 40.0}, CDX), est({"typical": 0.15, "peak": 0.2}, "about 150 mA at 9 V"),
    [port("main", "3-pin JST-SH 1.0 mm lead (supplied)", "lead soldered to the FC camera pads", [pin("+", "VIN", "power", "power_in"), pin("-", "GND", "ground", "power_in"), pin("V", "VIDEO", "analog", "out")], P("standard FPV camera lead"))], no_holes=True)
R["lipo_4s_1500"] = rec(est([74, 35, 36], "CNHL listing, about 74 x 35 x 36 mm"), est([], "soft pack, strap only"), "battery", est({"min": 12.0, "nom": 14.8, "max": 16.8}, "LiPo 3.0 / 3.7 / 4.2 V per cell"), est({"typical": 150.0, "peak": 300.0}, "100C x 1.5 Ah; the XT60 is rated 60 A continuous, so that is the real limit"),
    [port("main", "XT60", "XT60 mating half, 14 AWG", [pin("+", "BAT+", "power", "power_out"), pin("-", "BAT-", "ground", "power_out")], P("keyed housing")),
     port("balance", "JST-XH 5-pin balance lead", "charger balance board", [pin("1", "B-", "ground", "power_out"), pin("2", "C1", "analog", "power_out"), pin("3", "C2", "analog", "power_out"), pin("4", "C3", "analog", "power_out"), pin("5", "B+", "power", "power_out")], P("pin 1 at pack negative"))],
    output=est({"voltage_v": 14.8, "current_a": 60.0}, "XT60 continuous limit"), no_holes=True)
R["t200_thruster"] = rec(ds([100, 110, 95], T200), ds([{"x": -9.5, "y": -60, "d": 3.0, "thread": "M3"}, {"x": 9.5, "y": -60, "d": 3.0, "thread": "M3"}], T200, "two M3 in the mounting foot; spacing from the drawing is estimated"),
    "actuator", ds({"min": 7.0, "nom": 16.0, "max": 20.0}, T200), ds({"typical": 6.0, "peak": 24.0}, T200, "24 A at 16 V full thrust; typical is cruise"),
    [port("phases", "Three 18 AWG leads in a 1 m potted cable", "ESC motor leads, bullet connectors or solder", [pin("A", "A", "motor_phase", "in"), pin("B", "B", "motor_phase", "in"), pin("C", "C", "motor_phase", "in")], P("swap two to reverse"))],
    heat=est(0.0, "cooled by the water it runs in"))
R["basic_esc_30a"] = rec(ds([40, 22, 8], BESC), est([], "zip-tied"), "driver", ds({"min": 7.0, "nom": 16.0, "max": 26.0}, BESC), ds({"typical": 6.0, "peak": 30.0}, BESC),
    [port("power", "Two 16 AWG leads", "battery bus, solder or bullets", [pin("+", "VBAT+", "power", "power_in"), pin("-", "GND", "ground", "power_in")], P("red / black")),
     port("signal", "3-pin 0.1 in servo plug (signal, ground)", "PWM driver header", [pin("S", "PWM", "pwm", "in"), pin("G", "GND_SIG", "ground", "in"), pin("+", "NC", "power", "power_in")], P("the 5 V pin is not connected on the Basic ESC")),
     port("motor", "Three 16 AWG leads", "thruster leads", [pin("A", "A", "motor_phase", "out"), pin("B", "B", "motor_phase", "out"), pin("C", "C", "motor_phase", "out")], P("three phases"))],
    heat=est(2.0, "about 1 % of 200 W"), output=est({"voltage_v": 16.0, "current_a": 30.0}, "per motor"), no_holes=True)
R["pump_12v_diaphragm"] = rec(est([34, 28, 66], "R385 class"), est([{"x": -6, "y": 0, "d": 2.5, "thread": "M2.5"}, {"x": 6, "y": 0, "d": 2.5, "thread": "M2.5"}], "two M2.5 in the motor end face, typical of 385 motors"), "actuator",
    est({"min": 6.0, "nom": 12.0, "max": 12.0}, E), est({"typical": 0.5, "peak": 0.8}, "R385 pumps draw 0.5-0.8 A at 12 V"),
    [port("motor", "Two solder tabs", "leads to the switch module, solder", [pin("+", "M+", "motor_phase", "in"), pin("-", "M-", "motor_phase", "in")], P("brushed DC motor"))], heat=est(1.5, "brushed motor losses"))
R["mosfet_switch_module"] = rec(est([34, 17, 10.6], "generic AOD4184 board"), est([{"x": 3, "y": 3, "d": 3.0, "thread": "M3"}, {"x": 31, "y": 3, "d": 3.0, "thread": "M3"}], "two M3 holes on common boards"), "driver",
    est({"min": 5.0, "nom": 12.0, "max": 36.0}, E), est({"typical": 0.8, "peak": 15.0}, "rated 15 A; typical is the pump"),
    [port("power", "Screw terminal", "ferrules", [pin("VIN+", "VIN+", "power", "power_in"), pin("VIN-", "GND", "ground", "power_in")], P("screw terminals on the module")),
     port("load", "Screw terminal", "ferrules", [pin("OUT+", "OUT+", "motor_phase", "out"), pin("OUT-", "OUT-", "motor_phase", "out")], P("low-side switched output")),
     port("signal", "0.1 in header (PWM, GND)", "Dupont jumper", [pin("PWM", "PWM", "pwm", "in"), pin("GND", "GND_SIG", "ground", "in")], P("logic input"))],
    heat=est(0.2, "low Rds(on) at under 1 A"), output=est({"voltage_v": 12.0, "current_a": 15.0}, "follows VIN"))
R["blower_5015_12v"] = rec(est([50, 62, 15], "5015 class"), est([], "clamped in a duct"), "actuator", est({"min": 7.0, "nom": 12.0, "max": 13.2}, E), est({"typical": 0.15, "peak": 0.25}, "5015 blowers are rated about 0.15 A at 12 V"),
    [port("main", "2-pin JST-PH 2.0 lead", "lead to the switch module", [pin("+", "V+", "motor_phase", "in"), pin("-", "V-", "motor_phase", "in")], P("brushless fan with built-in driver, polarity matters"))], heat=est(1.0, "fan losses"), no_holes=True)
R["max98357a_amp"] = rec(ds([19.4, 17.8, 2.6], ADA_AMP), est([], "pins only"), "driver", ds({"min": 2.5, "nom": 5.0, "max": 5.5}, ADA_AMP), ds({"typical": 0.3, "peak": 0.8}, ADA_AMP, "3.2 W into 4 ohm at 5 V"),
    [port("power", "0.1 in header", "Dupont jumper", [pin("VIN", "VIN", "power", "power_in"), pin("GND", "GND", "ground", "power_in")], P("header")),
     port("i2s", "0.1 in header", "Dupont jumper", [pin("BCLK", "BCLK", "digital", "in"), pin("LRC", "LRC", "digital", "in"), pin("DIN", "DIN", "digital", "in")], P("I2S input")),
     port("speaker", "Screw terminal", "speaker leads", [pin("+", "SPK+", "analog", "out"), pin("-", "SPK-", "analog", "out")], P("bridge-tied output"))],
    heat=est(0.4, "class-D at 85 % efficiency"), no_holes=True)
R["speaker_40mm_3w"] = rec(est([40, 40, 18], "40 mm speaker"), est([], "clamped by its rim"), "actuator", est({"min": 0.0, "nom": 3.5, "max": 5.0}, "driven by the amplifier, not a supply"), est({"typical": 0.2, "peak": 0.8}, "follows the amplifier"),
    [port("main", "Two solder tabs", "leads to the amplifier", [pin("+", "SPK+", "analog", "in"), pin("-", "SPK-", "analog", "in")], P("polarity sets the phase only"))], no_holes=True)
R["endstop_microswitch"] = rec(est([40, 16, 7.6], "generic 3D-printer end stop board"), est([{"x": 5, "y": 3.5, "d": 3.0, "thread": "M3"}, {"x": 24, "y": 3.5, "d": 3.0, "thread": "M3"}], "two M3 holes"), "sensor",
    est({"min": 3.3, "nom": 5.0, "max": 5.0}, E), est({"typical": 0.005, "peak": 0.02}, "pull-up and LED"),
    [port("main", "3-pin JST-XH", "XH lead to the controller", [pin("V", "VCC", "power", "power_in"), pin("G", "GND", "ground", "power_in"), pin("S", "SIG", "digital", "out")], P("common Makerbot-style board"))])

data = json.loads(OUT.read_text())
data.update(R)
OUT.write_text(json.dumps(dict(sorted(data.items())), indent=1) + "\n")
print(f"{len(R)} records merged; {len(data)} in total")
