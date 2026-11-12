// "I have these parts": reads a parts list (a sentence, a pasted shopping list or kit contents, or picked parts) into
// catalog parts with quantities. Model names ("L298N", "SG90"), loose names ("2 small yellow motors", "a cheap
// ultrasonic sensor"), typos ("ardiuno", "servoo") and Hinglish ("mere paas 2 motor aur ek Arduino hai") all count.
// A part that matches nothing is listed as not recognised with the closest catalog parts; nothing is dropped.
import { CATALOG } from "@ttr/parts";

export type MatchKind = "model" | "name" | "loose" | "typo" | "kit" | "picked";
export interface InventoryItem {
  /** catalog key */
  key: string; qty: number; name: string;
  /** the words it was read from */
  raw: string; match: MatchKind;
  /** a loose name read as the usual part ("motor" as a TT gear motor): say the model if it is something else */
  assumed?: string;
  note?: string;
}
/** something the user has that is not a catalog part but is understood (jumper wires, resistors): kept, not designed with */
export interface InventoryExtra { what: string; qty: number; raw: string; note: string; }
export interface Suggestion { key: string; name: string; score: number; }
export interface UnknownItem { raw: string; qty: number; suggestions: Suggestion[]; }
export interface Inventory { items: InventoryItem[]; extras: InventoryExtra[]; unknown: UnknownItem[]; notes: string[]; }
/** an inventory as an editor holds it: catalog keys with quantities */
export type InventoryInput = string | { key: string; qty?: number }[] | Record<string, number> | Inventory;

// ------------------------------------------------------------------------------------------------ the part words
interface Alias { key: string; rx: RegExp; kind: "model" | "name" | "loose"; assumed?: string; }
const A = (key: string, kind: Alias["kind"], rx: RegExp, assumed?: string): Alias => ({ key, kind, rx, ...(assumed ? { assumed } : {}) });
/**
 * Read in order: the first pattern that matches a chunk wins, so specific models come before families and loose names.
 * Patterns run on the normalised chunk (lower case, "hc sr04" and "hc-sr04" alike) and on its compact form (letters and
 * digits only, for model codes typed without spaces).
 */
const ALIASES: Alias[] = [
  // ---- controllers
  A("esp32_cam", "model", /\besp32[\s-]?cam\b|\bai[\s-]?thinker\b/),
  A("esp32_s3_devkitc1", "model", /\besp32[\s-]?s3\b/),
  A("esp32_devkit_v1", "model", /\besp[\s-]?32\b|\besp32\b|\bwroom\b/),
  A("arduino_uno_r3", "model", /\b(?:genuine|original|official|real)\s+arduino\s+uno\b|\barduino\s+uno\s+(?:r3\s+)?\((?:genuine|original|official)\)/),
  A("arduino_mega_clone", "model", /\b(?:arduino\s+)?mega(?:\s*2560)?\b/),
  A("arduino_nano_v3", "model", /\b(?:genuine|original|official)\s+arduino\s+nano\b/),
  A("arduino_nano_clone", "model", /\b(?:arduino\s+)?nano\b/),
  A("arduino_uno_clone", "model", /\b(?:arduino\s+)?uno\b/),
  A("arduino_uno_clone", "loose", /\barduino\b|\bardu?ino\b/, "an Arduino Uno compatible board"),
  A("rpi_zero_2w", "model", /\b(?:raspberry\s+)?pi\s+zero\b|\brpi\s*zero\b/),
  A("rpi5", "model", /\b(?:raspberry\s+)?pi\s*5\b|\brpi\s*5\b/),
  A("rpi4_4gb", "model", /\b(?:raspberry\s+)?pi\s*4(?:\s*b)?\b|\brpi\s*4\b/),
  A("rpi_camera_module_3", "model", /\b(?:raspberry\s+)?pi\s+cam(?:era)?\b|\bcamera\s+module\s*(?:3|v[23])\b|\bcsi\s+camera\b|\brpi\s+cam/),
  A("rpi4_4gb", "loose", /\braspberry\s*pi\b|\brpi\b|\braspi\b/, "a Raspberry Pi 4"),
  A("jetson_orin_nano_super", "model", /\bjetson\b/),
  // ---- motors and drivers
  A("tt_gearmotor_1to48", "model", /\btt\s*(?:gear(?:ed)?\s*)?motors?\b|\bbo\s+motors?\b|\byellow\s+(?:gear(?:ed)?\s+|dc\s+)?motors?\b|\b(?:small|cheap|plastic)\s+yellow\s+\w*\s*motors?\b|\bgear\s*motors?\s+(?:3-6|3\s*-\s*6)\s*v\b|\b1\s*:\s*48\b/),
  A("n20_gearmotor_100to1", "model", /\bn20\b|\bmicro\s+metal\s+gear\s*motors?\b/),
  A("pololu_37d_50to1_64cpr", "model", /\b37\s*d\b|\b37\s*mm\s+gear\s*motors?\b/),
  A("nema17_42x40", "model", /\bnema\s*17\b|\b42\s*mm\s+stepper\b/),
  A("stepper_28byj48", "model", /\b28\s*byj(?:\s*-?\s*48)?\b|\b5\s*v\s+stepper\b/),
  A("uln2003_module", "model", /\buln\s*2003\b/),
  A("tmc2209_stepstick", "model", /\btmc\s*2209\b/),
  A("l298n_module", "model", /\bl\s*298\s*n?\b|\bred\s+(?:motor\s+)?driver\b|\bdriver\s+(?:board\s+)?with\s+(?:a\s+)?heat\s*sink\b/),
  A("tb6612fng_module", "model", /\btb\s*6612(?:\s*fng)?\b/),
  A("drv8833_module", "model", /\bdrv\s*8833\b/),
  A("l9110s_module", "model", /\bl\s*9110s?\b|\bhg\s*7881\b/),
  A("pca9685_clone", "model", /\bpca\s*9685\b|\b16[\s-]*(?:ch|channel)\s+(?:servo|pwm)\s+(?:driver|board|controller)\b|\bservo\s+(?:driver|shield)\s+(?:board\s+)?(?:16|sixteen)\b/),
  A("l298n_module", "loose", /\b(?:dc\s+)?motor\s+driver\b|\bh[\s-]?bridge\b|\bmotor\s+controller\b/, "an L298N motor driver (the usual one in kits)"),
  A("pca9685_clone", "loose", /\bservo\s+(?:driver|controller|shield)\b/, "a PCA9685 16-channel servo driver"),
  // ---- servos
  A("hobby_mg90s", "model", /\bmg\s*90\s*s?\b|\bmetal\s+gear(?:ed)?\s+micro\s+servos?\b|\bmicro\s+servos?\s+(?:with\s+)?metal\s+gears?\b/),
  A("hobby_sg90", "model", /\bsg\s*-?\s*90\b|\b9\s*g(?:ram)?\s+(?:micro\s+)?servos?\b|\bmicro\s+servos?\b|\bblue\s+servos?\b|\btower\s*pro\s+servos?\b/),
  A("hobby_mg996r", "model", /\bmg\s*996\s*r?\b|\b(?:big|large|standard|high\s+torque|metal\s+gear(?:ed)?)\s+servos?\b/),
  A("hobby_mg995", "model", /\bmg\s*995\b/),
  A("hobby_ds3218", "model", /\bds\s*3218\b|\b20\s*kg\s+servos?\b/),
  A("feetech_sts3215_c001", "model", /\bsts\s*3215\b/),
  A("dxl_xl430_w250", "model", /\bxl\s*430\b|\bdynamixel\b/),
  A("hobby_sg90", "loose", /\bservos?\b|\bservo\s*motors?\b|\bservomotors?\b/, "SG90 micro servos (the usual kit servo)"),
  A("stepper_28byj48", "loose", /\bstepper(?:\s+motors?)?s?\b/, "a 28BYJ-48 geared stepper (the usual kit stepper)"),
  A("tt_gearmotor_1to48", "loose", /\b(?:dc\s+|gear(?:ed)?\s+|toy\s+|hobby\s+|robot\s+|car\s+)?(?:gear\s*)?motors?\b/, "TT gear motors (the usual kit motor)"),
  // ---- sensors
  A("hc_sr04", "model", /\bhc\s*-?\s*sr\s*-?\s*04\b|\bsr\s*04\b|\bhcsr04\b/),
  A("hc_sr04", "loose", /\bultra\s*-?\s*sonic\b|\bultrasound\b|\bsonar\b|\b(?:ultrasonic\s+)?distance\s+sensors?\b|\bpanchi\s+aankh\b/, "an HC-SR04 ultrasonic sensor"),
  A("vl53l0x_breakout", "model", /\bvl\s*53\s*l0x\b|\bvl53l0x\b|\btime[\s-]of[\s-]flight\b|\btof\s+(?:distance\s+)?sensor\b/),
  A("line_sensor_3ch", "model", /\b(?:3|three)[\s-]*(?:ch|channel|way|eye)s?\s+(?:ir\s+)?(?:line|tracking|tracker)\b|\b(?:line|tracking)\s+(?:sensor\s+)?(?:module\s+)?(?:with\s+)?(?:3|three)\s+(?:sensors|channels|eyes)\b/),
  A("tcrt5000_module", "model", /\btcrt\s*5000\b|\bline\s+(?:follow(?:er|ing)?\s+|track(?:er|ing)\s+)?sensors?\b|\bline\s+tracking\b|\bir\s+line\b|\btracking\s+(?:sensor|module)s?\b/),
  A("ir_obstacle_fc51", "model", /\bfc\s*-?\s*51\b|\bir\s+(?:obstacle|proximity|avoidance)\b|\bobstacle\s+(?:avoidance\s+)?(?:ir\s+)?sensors?\b|\binfrared\s+(?:obstacle\s+)?sensors?\b|\bir\s+sensors?\b/),
  A("mpu6050_gy521", "model", /\bmpu\s*-?\s*6050\b|\bgy\s*-?\s*521\b|\bgyro(?:scope)?\b|\baccelerometer\b|\bimu\b/),
  A("bno085_breakout", "model", /\bbno\s*0?8[05]\b/),
  A("oled_ssd1306_128x64", "model", /\bssd\s*1306\b|\boled\b/),
  A("lcd_2in_st7789", "model", /\bst\s*7789\b|\btft\b/),
  A("hc05_bluetooth", "model", /\bhc\s*-?\s*0[56]\b|\bbluetooth\b|\bbt\s+module\b/),
  A("pir_hc_sr501", "model", /\bhc\s*-?\s*sr\s*-?\s*501\b|\bpir\b|\bmotion\s+sensor\b/),
  A("rplidar_a1m8", "model", /\brplidar\s*a1\b|\ba1m8\b/),
  A("rplidar_c1", "model", /\brplidar(?:\s*c1)?\b|\blidar\b/),
  A("realsense_d435i", "model", /\brealsense\b|\bd435i?\b/),
  A("rpi_camera_module_3", "loose", /\bcamera\b|\bcam\b/, "a Raspberry Pi camera module"),
  A("buzzer_active_5v", "model", /\bbuzzers?\b|\bpiezo\b|\bbeeper\b/),
  A("ws2812_ring_12", "model", /\bws\s*2812\b|\bneopixel\b|\brgb\s+(?:led\s+)?ring\b/),
  A("led_5mm_white", "model", /\bleds?\b/),
  // ---- power
  A("pack_2s_18650", "model", /\b(?:2|two|do)\s*x?\s*18650\b|\b18650\s+(?:battery\s+)?(?:holder|pack|case|box)\b|\b2s\s+18650\b|\b18650s?\b/),
  A("lipo_3s_2200", "model", /\b3s\s+(?:lipo\s+)?2200\b|\b(?:lipo\s+)?3s\b|\b11\.1\s*v\s+lipo\b/),
  A("lipo_4s_5000", "model", /\b4s\s+lipo\b|\blipo\s+4s\b/),
  A("battery_9v_pp3", "model", /\b9\s*v(?:olt)?\s+(?:battery|batteries|cell|pp3)\b|\bpp3\b|\b9\s*v\s+snap\b/),
  A("battery_holder_6aa", "model", /\b6\s*x?\s*aa\b|\bsix\s+aa\b|\b(?:6|six)[\s-]*(?:cell\s+)?aa\s+(?:battery\s+)?holder\b/),
  A("battery_holder_4aa", "model", /\b4\s*x?\s*aa\b|\bfour\s+aa\b|\baa\s+(?:battery\s+)?holder\b|\baa\s+batter(?:y|ies)\b|\baa\s+cells?\b|\bpencil\s+cells?\b|^aas?$|\baa\s*s\b/),
  A("powerbank_5v_2a", "model", /\bpower\s*bank\b|\busb\s+battery\b/),
  A("buck_lm2596", "model", /\blm\s*2596\b|\bbuck(?:\s+converter)?\b|\bstep[\s-]?down\b|\bdc[\s-]dc\b/),
  A("psu_5v4a_adapter", "model", /\b5\s*v\s+(?:\d+\s*a\s+)?(?:power\s+)?(?:adapter|supply|charger)\b|\bwall\s+(?:adapter|plug|wart)\b/),
  A("psu_12v_lrs75", "model", /\b12\s*v\s+(?:power\s+)?(?:supply|psu|adapter)\b/),
  A("switch_kcd1", "model", /\brocker\s+switch\b|\bpower\s+switch\b|\bon[\s/-]off\s+switch\b|\bkcd1\b/),
  // ---- mechanical
  A("wheel_65mm_tt", "model", /\b65\s*mm\s+wheels?\b|\b(?:tt|rubber|robot|car)\s+wheels?\b|\bwheels?\b/),
  A("ball_caster_pololu_2692", "model", /\b(?:ball\s+)?casters?\b|\bcastor\b|\bcaster\s+wheels?\b|\bomni\s*wheel\b/),
  A("breadboard_400", "model", /\bbread\s*-?\s*boards?\b|\bbb\s*400\b/),
  A("bearing_608zz", "model", /\b608\s*(?:zz|2rs)?\b|\bskate(?:board)?\s+bearings?\b/),
];

/** Understood but not catalog parts: kept in the inventory, not designed with. */
const EXTRAS: { rx: RegExp; what: string; note: string }[] = [
  { rx: /\bjumpers?\b|\bdupont\b|\bwires?\b|\bcables?\b/, what: "jumper wires", note: "used for the wiring; the cut list says which lengths" },
  { rx: /\bresistors?\b|\bohm\b/, what: "resistors", note: "a 1k + 2k pair makes the divider a 5 V echo needs on a 3.3 V board" },
  { rx: /\bcapacitors?\b|\buf\b/, what: "capacitors", note: "a 470-1000 uF across the servo supply helps against brown-outs" },
  { rx: /\bpush\s*buttons?\b|\btactile\b|\bbuttons?\b/, what: "push buttons", note: "not used by the designs" },
  { rx: /\bpot(?:entiometer)?s?\b|\bknobs?\b/, what: "potentiometers", note: "not used by the designs" },
  { rx: /\bldr\b|\bphoto\s*(?:resistor|cell)s?\b|\blight\s+sensors?\b/, what: "light sensors", note: "not used by the designs" },
  { rx: /\bthermistor\b|\btmp36\b|\bdht\s*1[1-2]\b|\btemperature\b|\bhumidity\b/, what: "temperature sensors", note: "not used by the designs" },
  { rx: /\busb\s+cables?\b|\bprogramming\s+cable\b/, what: "USB cable", note: "for uploading the sketch" },
  { rx: /\bscrews?\b|\bnuts?\b|\bstandoffs?\b|\bbolts?\b|\bspacers?\b/, what: "screws and standoffs", note: "the build record lists the screws each part needs" },
  { rx: /\bchassis\b|\bacrylic\s+(?:plate|base|deck)\b/, what: "kit chassis plate", note: "the designs print their own chassis; a kit plate can stand in if the holes line up" },
  { rx: /\brelays?\b/, what: "relay module", note: "not used by the designs" },
  { rx: /\bkeypad\b|\bjoystick\b|\bremote\b|\bir\s+receiver\b|\bir\s+remote\b/, what: "remote control parts", note: "not used by the designs" },
  { rx: /\blcd\s*16\s*x?\s*2\b|\b1602\b/, what: "16x2 LCD", note: "not used by the designs" },
];

/** Starter kits: what is in the box (from the makers' contents lists). */
export const KITS: { rx: RegExp; name: string; url: string; parts: [string, number][]; extras?: string[] }[] = [
  { rx: /\belegoo\b[^,;\n]*\bcar\b[^,;\n]*\bv\s?4(?:\.0)?\b|\bsmart\s+robot\s+car\s+(?:kit\s+)?v?4(?:\.0)?\b/, name: "ELEGOO Smart Robot Car Kit V4.0", url: "https://www.elegoo.com/products/elegoo-smart-robot-car-kit-v-4-0",
    parts: [["arduino_uno_clone", 1], ["tb6612fng_module", 1], ["tt_gearmotor_1to48", 4], ["wheel_65mm_tt", 4], ["hc_sr04", 1], ["hobby_sg90", 1], ["line_sensor_3ch", 1], ["mpu6050_gy521", 1], ["pack_2s_18650", 1], ["esp32_cam", 1]],
    extras: ["IR receiver and remote", "acrylic chassis plates", "jumper wires"] },
  { rx: /\belegoo\b[^,;\n]*\bcar\b|\bsmart\s+robot\s+car\s+kit\b/, name: "ELEGOO Smart Robot Car Kit V3.0 Plus", url: "https://www.elegoo.com/products/elegoo-smart-robot-car-kit-v-3-0-plus",
    parts: [["arduino_uno_clone", 1], ["l298n_module", 1], ["tt_gearmotor_1to48", 4], ["wheel_65mm_tt", 4], ["hc_sr04", 1], ["hobby_sg90", 1], ["line_sensor_3ch", 1], ["hc05_bluetooth", 1], ["pack_2s_18650", 1]],
    extras: ["IR receiver and remote", "acrylic chassis plates", "jumper wires"] },
  { rx: /\belegoo\b[^,;\n]*\bstarter\s+kit\b|\bsuper\s+starter\s+kit\b/, name: "ELEGOO UNO R3 Super Starter Kit", url: "https://www.elegoo.com/products/elegoo-uno-project-super-starter-kit",
    parts: [["arduino_uno_clone", 1], ["hc_sr04", 1], ["hobby_sg90", 1], ["stepper_28byj48", 1], ["uln2003_module", 1], ["breadboard_400", 1], ["battery_9v_pp3", 1], ["buzzer_active_5v", 1], ["led_5mm_white", 5]],
    extras: ["small DC motor and fan blade", "L293D chip", "LEDs, resistors, buttons, potentiometer", "jumper wires"] },
  { rx: /\barduino\s+starter\s+kit\b|\bstarter\s+kit\b/, name: "Arduino Starter Kit (K000007)", url: "https://store.arduino.cc/products/arduino-starter-kit-multi-language",
    parts: [["arduino_uno_r3", 1], ["hobby_sg90", 1], ["breadboard_400", 1], ["battery_9v_pp3", 1], ["buzzer_active_5v", 1], ["led_5mm_white", 6]],
    extras: ["small 6/9 V DC motor", "L293D H-bridge chip", "phototransistors, TMP36, potentiometers, buttons, resistors", "jumper wires"] },
];

// ------------------------------------------------------------------------------------------------ quantities
const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, two: 2, pair: 2, couple: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, dozen: 12, fifteen: 15, sixteen: 16, twenty: 20,
  // Hinglish
  ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, panch: 5, paanch: 5, chhe: 6, chhah: 6, che: 6, saat: 7, sat: 7, aath: 8, ath: 8, nau: 9, das: 10, dus: 10, barah: 12,
  // Devanagari
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
};
/** Hindi / Hinglish words in a parts list mapped to English, or to nothing */
const HINGLISH: [RegExp, string][] = [
  [/मेरे\s+पास|मेरे\s+पास\s+है/g, " "], [/\bमोटर\b|मोटर/g, " motor "], [/सर्वो/g, " servo "], [/बैटरी/g, " battery "], [/सेंसर/g, " sensor "], [/पहिये|पहिया/g, " wheels "],
  [/\s*और\s*/g, ", "], [/\s*है\s*|\s*हैं\s*/g, " "], [/आर्डुइनो|अर्डुइनो|अरडुइनो/g, " arduino "],
  [/\bmere\s+(?:paas|pass|pas)\b|\bmere\s+ko\b|\bhamare\s+paas\b|\bmeri\s+(?:kit|kit\s+mein)\b|\bmere\s+kit\s+(?:mein|me)\b/g, " "],
  [/\b(?:hai|hain|hai\.)\b/g, " "], [/\b(?:aur|or|tatha)\b/g, ", "], [/\b(?:wala|wali|wale|vala|vali)\b/g, " "],
  [/\b(?:se|ke\s+saath|ke\s+sath|ke|ki|ka|kuch|bhi)\b/g, " "], [/\b(?:batteriyan|batteriyaan|bataria)\b/g, " batteries "], [/\b(?:pahiye|pahiya|tyre|tyres|tires?)\b/g, " wheels "],
  [/\b(?:chota|chhota|chhote|chote|chhoti|choti)\b/g, " small "], [/\b(?:peela|peeli|peele|pila|pili)\b/g, " yellow "], [/\b(?:sasta|sasti|saste)\b/g, " cheap "],
  [/\b(?:banao|bana\s+do|banana\s+hai|chahiye|chaiye)\b/g, " "],
];
const LEAD_IN = /^(?:\s*(?:and|also|plus|then|aur)\s+)?(?:i\s+(?:have|got|own|bought|ordered)|i've\s+got|i've|ive\s+got|i\s+already\s+have|i'?ve\s+(?:already\s+)?(?:got|bought)|we\s+have|my\s+(?:kit|box|parts?\s+bin|parts?)\s+(?:has|have|contains?|includes?)|(?:the\s+)?kit\s+(?:has|contains?|includes?|comes\s+with)|in\s+the\s+box(?:\s+is|:)?|parts?(?:\s+list)?\s*:|contents?\s*:|inventory\s*:|shopping\s+list\s*:|order\s*(?:summary)?\s*:|with|using|from)\s*:?\s+/;
const TAIL = /\s*(?:,?\s*(?:make|build|design|create)\s+(?:a|me|something|what|me\s+a)\b.*|\bwhat\s+(?:can|robot|should)\b.*|\bcan\s+you\b.*|\bfor\s+(?:a|my)\s+robot\b.*|\bto\s+(?:make|build)\b.*|\brobot\s+(?:bana|banao)\b.*)$/;
const FILLER = /\b(?:some|of|the|my|x|pcs?|pieces?|units?|nos?|qty|quantity|piece|set|sets|kit|module|modules|board|boards|sensor|sensors|type|types|generic|clone|compatible|cheap|small|little|tiny|new|old|spare|extra|working|used|brand|loose|pack|packs|bag|bags|lot|one|ones|just|only|also)\b/g;

/** chunks that name no part: "these components", "that's it", "a robot" */
const SKIP = /^(?:hai|i|me|and|also|also have|have|got|that's it|thats all|that is all|thanks?|thank you|please|pls|plz|robot|a robot|something|lots|stuff|things|(?:these|the following|following|this|those|some|my|a few)\s+(?:components?|parts?|things|items|bits|stuff)|components?|parts?|items?|kit|following|the|a|an|kit\s+v?\d(?:\.\d)?|kit\s+contents|(?:the\s+)?box)$/;
const clean = (s: string) => s.toLowerCase().replace(/[‐-―−]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\r/g, "").replace(/[^\S\n]+/g, " ").replace(/ *\n */g, "\n").trim();
const compact = (s: string) => s.replace(/[^a-z0-9]/g, "");

/** Split a text into one chunk per part: lines, commas, "and", "plus", bullets. Kit names stay whole. */
function chunks(text: string): string[] {
  let t = clean(text);
  for (const [rx, to] of HINGLISH) t = t.replace(rx, to);
  t = t.replace(/[^\S\n]+/g, " ");
  // prices, currencies and order ids carry no part information
  t = t.replace(/(?:us\s*)?\$\s?\d+(?:[.,]\d+)?|₹\s?\d+(?:[.,]\d+)?|\brs\.?\s?\d+(?:[.,]\d+)?|\b(?:usd|inr|eur)\s?\d+(?:[.,]\d+)?|€\s?\d+(?:[.,]\d+)?|£\s?\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s?(?:usd|inr|eur|dollars?|rupees?)\b/g, " ");
  t = t.replace(/\b(?:sku|asin|item|order)\s*#?\s*[:#]?\s*[a-z0-9-]{5,}\b/g, " ");
  const out: string[] = [];
  for (let line of t.split(/\n/)) {
    line = line.replace(/^\s*(?:[-*•·>]+|\d+[.)]\s+(?=[a-z]))\s*/, "").trim();
    // "1 x Arduino Uno R3 - $23.00" keeps its leading count; "SKU 1234" removed above
    for (const piece of line.split(/\s*(?:[,;|+&]|\s(?:and|plus|n|with)\s|\.\s)\s*/)) {
      let p = piece.replace(LEAD_IN, "").replace(TAIL, "").replace(/[.!?:"']+$/g, "").replace(/^[.:"'\s]+/, "").trim();
      p = p.replace(LEAD_IN, "").trim();
      if (p && !SKIP.test(p)) out.push(p);
    }
  }
  return out;
}

/** The count in a chunk ("2", "2x", "x2", "two", "a pair of", "pack of 4", "qty: 3"); the chunk without it. */
export function quantity(chunk: string): { qty: number; rest: string; explicit: boolean } {
  let c = chunk, qty: number | undefined, per = 1;
  const take = (rx: RegExp, f: (m: RegExpExecArray) => number) => { const m = rx.exec(c); if (m && qty === undefined) { qty = f(m); c = (c.slice(0, m.index) + " " + c.slice(m.index + m[0].length)).trim(); } };
  // "2 x SG90 (pack of 4)": a pack size multiplies the count in front of it
  const pack = /\(?\b(?:pack|set|bag|box|lot)\s+of\s+(\d+)\b\)?|\b(\d+)\s*(?:pcs?|pieces?)\s+(?:pack|set)\b/.exec(c);
  if (pack) { per = +(pack[1] ?? pack[2]); c = (c.slice(0, pack.index) + " " + c.slice(pack.index + pack[0].length)).trim(); }
  take(/\((?:x\s*)?(\d+)\s*(?:pcs?|pieces?|x)?\)/, (m) => +m[1]);
  take(/\b(?:qty|quantity|count|nos?)\s*[:.=]?\s*(\d+)\b/, (m) => +m[1]);
  // "3-channel", "2S", "9V", "65 mm" are part of the name, not a count
  take(/^(\d+)(?![\d.]|-|\s*(?:ch\b|channel|way\b|s\b|v\b|volt|mm\b|cm\b|kg|g\b|a\b|ah\b|mah|cell|dof\b|rpm\b))\s*(?:x|×|\*|pcs?\b|pieces?\b|nos?\b|units?\b)?\s*/, (m) => +m[1]);
  take(/\s(?:x|×|\*)\s?(\d+)\s*$/, (m) => +m[1]);
  take(/\s(\d+)\s*(?:pcs?|pieces?|nos?|units?)\b/, (m) => +m[1]);
  take(/^(?:a\s+)?(?:pair|couple)\s+of\s+/, () => 2);
  take(/^(?:a\s+)?dozen\s+/, () => 12);
  take(/^(?:a\s+few|several|some)\s+/, () => 3);
  if (qty === undefined) {
    const m = /^(\S+)\s+/.exec(c);
    if (m && NUMBER_WORDS[m[1]] !== undefined) { qty = NUMBER_WORDS[m[1]]; c = c.slice(m[0].length); }
  }
  return { qty: (qty ?? 1) * per, rest: c.trim(), explicit: qty !== undefined || per > 1 };
}

// ------------------------------------------------------------------------------------------------ fuzzy matching
function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length; if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? prev[j - 2] + 1 : Infinity);
    prev = cur;
  }
  return prev[n];
}
/** words a typo is corrected to before matching */
const VOCAB = ["arduino", "servo", "servos", "motor", "motors", "ultrasonic", "sensor", "sensors", "battery", "batteries", "raspberry", "breadboard", "driver", "wheels", "wheel", "bluetooth",
  "camera", "stepper", "caster", "buzzer", "gyroscope", "accelerometer", "infrared", "obstacle", "tracking", "holder", "esp32", "nano", "mega", "l298n", "sg90", "mg996r", "mg90s", "hcsr04", "tb6612", "pca9685", "mpu6050", "tcrt5000", "uln2003", "28byj48", "drv8833", "lm2596", "18650", "lipo", "power", "bank", "jumper", "wires", "yellow", "micro"];
function correctTypos(s: string): { text: string; fixed: boolean } {
  let fixed = false;
  const text = s.split(" ").map((w) => {
    if (w.length < 4 || VOCAB.includes(w) || /^\d+$/.test(w)) return w;
    const tol = w.length >= 7 ? 2 : 1;
    let best: string | undefined, bd = Infinity;
    for (const v of VOCAB) { if (Math.abs(v.length - w.length) > tol) continue; const d = lev(w, v); if (d < bd) { bd = d; best = v; } }
    if (best && bd <= tol) { fixed = true; return best; }
    return w;
  }).join(" ");
  return { text, fixed };
}
const name = (key: string) => CATALOG[key]?.name ?? key;

/** Catalog parts closest to an unrecognised name: shared words and model codes, then edit distance. */
export function suggest(raw: string, n = 3): Suggestion[] {
  const words = clean(raw).replace(FILLER, " ").split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  const scored: Suggestion[] = [];
  for (const c of Object.values(CATALOG)) {
    if (/^(?:fastener|insert)$/.test(c.category)) continue;
    const hay = clean(`${c.key.replace(/_/g, " ")} ${c.name}`), hw = hay.split(/[^a-z0-9]+/).filter(Boolean), hc = compact(hay);
    let s = 0;
    for (const w of words) {
      if (hw.includes(w)) s += w.length >= 4 ? 3 : 1.5;
      else if (w.length >= 4 && hc.includes(w)) s += 2;
      else if (w.length >= 4) { const d = Math.min(...hw.map((h) => lev(w, h))); if (d <= 1) s += 1.5; else if (d <= 2 && w.length >= 6) s += 0.8; }
    }
    if (s > 0) scored.push({ key: c.key, name: c.name, score: +s.toFixed(2) });
  }
  // nothing in common: the parts people most often mean by a category word
  if (!scored.length) for (const k of ["arduino_uno_clone", "tt_gearmotor_1to48", "hobby_sg90", "hc_sr04", "l298n_module"]) if (CATALOG[k]) scored.push({ key: k, name: name(k), score: 0 });
  return scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, n);
}

function matchChunk(rest: string): { alias: Alias; via: MatchKind } | undefined {
  const tryAll = (s: string) => {
    const c = compact(s);
    for (const a of ALIASES) if (CATALOG[a.key] && a.rx.test(s)) return a;
    // model codes typed without spaces or with odd punctuation: "hcsr04", "l298-n", "sg-90"
    for (const [code, key] of COMPACT_CODES) if (c.includes(code) && CATALOG[key]) return ALIASES.find((a) => a.key === key && a.kind === "model") ?? { key, rx: /$^/, kind: "model" as const };
    return undefined;
  };
  const direct = tryAll(rest);
  if (direct) return { alias: direct, via: direct.kind === "loose" ? "loose" : direct.kind === "name" ? "name" : "model" };
  const { text, fixed } = correctTypos(rest);
  if (fixed) { const a = tryAll(text); if (a) return { alias: a, via: "typo" }; }
  return undefined;
}
/** model codes found in the compact form of a chunk */
const COMPACT_CODES: [string, string][] = [
  ["hcsr04", "hc_sr04"], ["sr04", "hc_sr04"], ["hcsr501", "pir_hc_sr501"], ["l298n", "l298n_module"], ["l298", "l298n_module"], ["tb6612", "tb6612fng_module"], ["drv8833", "drv8833_module"], ["l9110", "l9110s_module"],
  ["sg90", "hobby_sg90"], ["mg90s", "hobby_mg90s"], ["mg996", "hobby_mg996r"], ["mg995", "hobby_mg995"], ["ds3218", "hobby_ds3218"], ["pca9685", "pca9685_clone"], ["mpu6050", "mpu6050_gy521"], ["gy521", "mpu6050_gy521"],
  ["vl53l0x", "vl53l0x_breakout"], ["ssd1306", "oled_ssd1306_128x64"], ["tcrt5000", "tcrt5000_module"], ["uln2003", "uln2003_module"], ["28byj48", "stepper_28byj48"], ["lm2596", "buck_lm2596"], ["hc05", "hc05_bluetooth"], ["hc06", "hc05_bluetooth"],
  ["esp32cam", "esp32_cam"], ["esp32s3", "esp32_s3_devkitc1"], ["esp32", "esp32_devkit_v1"], ["nema17", "nema17_42x40"], ["tmc2209", "tmc2209_stepstick"], ["fc51", "ir_obstacle_fc51"], ["rplidar", "rplidar_c1"],
];

// ------------------------------------------------------------------------------------------------ AA cells and 18650 cells
/** "4 AA batteries" is one 4-cell holder; 8 is two; 6 is a 6-cell holder. */
function cellsToHolders(key: string, qty: number, rest: string, raw: string): { key: string; qty: number; note?: string } {
  const r = clean(raw), holderWord = /\bholders?\b|\bcase\b|\bbox\b/.test(r);
  // "4xAA battery holder", "2 x 4AA holders": the number before AA is cells per holder
  const per = /\b([46])\s*x?\s*aa\b/.exec(rest)?.[1] ?? (holderWord ? /^([46])\s*x?\s*aa\b/.exec(r)?.[1] : undefined);
  if ((key === "battery_holder_4aa" || key === "battery_holder_6aa") && holderWord && per) return { key: per === "6" ? "battery_holder_6aa" : "battery_holder_4aa", qty: /^([46])\s*x?\s*aa\b/.test(r) ? 1 : qty };
  if ((key === "battery_holder_4aa" || key === "battery_holder_6aa") && /(?<![a-z])aa\b|\dx?aa\b/.test(r) && !holderWord) {
    if (/\b(?:4|four)\s*x?\s*aa\b|\b6\s*x?\s*aa\b/.test(r) && qty === 1) return { key, qty: 1 };
    if (qty === 6) return { key: "battery_holder_6aa", qty: 1, note: "6 AA cells read as one 6-cell holder (9 V)" };
    if (qty % 4 === 0 && qty > 0) return { key: "battery_holder_4aa", qty: qty / 4, note: `${qty} AA cells read as ${qty / 4} four-cell holder${qty > 4 ? "s" : ""} (6 V each)` };
    if (qty === 1 || qty === 3) return { key: "battery_holder_4aa", qty: 1, note: `${qty === 1 ? "AA cells" : "3 AA cells"} read as one four-cell holder: a 4-cell holder makes 6 V` };
    return { key: "battery_holder_4aa", qty: Math.max(1, Math.round(qty / 4)), note: `${qty} AA cells read as four-cell holders` };
  }
  if (key === "pack_2s_18650" && /18650/.test(r)) {
    if (/\b(?:2|two|do)\s*x?\s*18650\b|\b2s\b/.test(r) && qty === 1) return { key, qty: 1 };
    if (/\bholder|\bpack\b|\bcase|\bbox/.test(r)) return { key, qty: /^(?:2|two|do)\s*x?\s*18650\b/.test(r) ? 1 : qty };
    if (qty >= 2) return { key, qty: Math.floor(qty / 2), note: `${qty} 18650 cells read as ${Math.floor(qty / 2)} two-cell pack${qty >= 4 ? "s" : ""} (7.4 V)` };
    return { key, qty: 1, note: "one 18650 cell: the designs use two in series (7.4 V), so add a second cell" };
  }
  return { key, qty };
}

// ------------------------------------------------------------------------------------------------ the parser
/** Read a parts list. Every chunk ends up as a catalog part, an understood extra, or a not-recognised line with suggestions. */
export function parseInventory(text: string): Inventory {
  const items: InventoryItem[] = [], extras: InventoryExtra[] = [], unknown: UnknownItem[] = [], notes: string[] = [];
  const add = (it: InventoryItem) => {
    const same = items.find((x) => x.key === it.key);
    if (same) { same.qty += it.qty; same.raw += `; ${it.raw}`; if (it.note) same.note = [same.note, it.note].filter(Boolean).join("; "); }
    else items.push(it);
  };
  let t = clean(text);
  // kit names: the whole kit's contents
  for (const kit of KITS) {
    const m = kit.rx.exec(t); if (!m) continue;
    const count = kit.name.startsWith("pack of") && m[1] ? +m[1] : undefined;
    for (const [key, qty] of kit.parts) if (CATALOG[key]) add({ key, qty: count ?? qty, name: name(key), raw: m[0], match: "kit" });
    for (const e of kit.extras ?? []) extras.push({ what: e, qty: 1, raw: m[0], note: `in the ${kit.name}; not used by the designs` });
    notes.push(`read "${m[0]}" as the ${kit.name}: ${kit.parts.filter(([k]) => CATALOG[k]).map(([k, q]) => `${count ?? q}x ${name(k).split(" (")[0]}`).join(", ")} (${kit.url})`);
    t = t.replace(m[0], " ");
  }
  for (const raw of chunks(t)) {
    const { qty, rest } = quantity(raw);
    const bare = rest.replace(/\s+/g, " ").trim();
    if (!bare) continue;
    const hit = matchChunk(bare);
    if (hit) {
      const fix = cellsToHolders(hit.alias.key, qty, bare, raw);
      add({ key: fix.key, qty: fix.qty, name: name(fix.key), raw, match: hit.via, ...(hit.alias.assumed ? { assumed: hit.alias.assumed } : {}), ...(fix.note ? { note: fix.note } : {}) });
      continue;
    }
    const ex = EXTRAS.find((e) => e.rx.test(bare));
    if (ex) { extras.push({ what: ex.what, qty, raw, note: ex.note }); continue; }
    // a lone generic word ("battery", "sensor", "motor driver board") is a part I cannot pin down
    unknown.push({ raw, qty, suggestions: suggest(bare) });
  }
  for (const u of unknown) if (/^batter(?:y|ies)$|^cells?$/.test(quantity(u.raw).rest)) notes.push(`"${u.raw}": which battery? say "4 AA", "6 AA", "9 V", "2x 18650" or "3S LiPo"`);
  return { items, extras, unknown, notes };
}

/** Any inventory form (text, keys with quantities, a parsed inventory) as a parsed inventory. Unknown keys are not dropped. */
export function toInventory(input: InventoryInput): Inventory {
  if (typeof input === "string") return parseInventory(input);
  if (!Array.isArray(input) && "items" in input && Array.isArray((input as Inventory).items)) return input as Inventory;
  const pairs: [string, number][] = Array.isArray(input) ? input.map((x) => [x.key, x.qty ?? 1]) : Object.entries(input as Record<string, number>);
  const inv: Inventory = { items: [], extras: [], unknown: [], notes: [] };
  for (const [key, qty] of pairs) {
    if (!(qty > 0)) continue;
    if (CATALOG[key]) { const same = inv.items.find((i) => i.key === key); if (same) same.qty += qty; else inv.items.push({ key, qty, name: name(key), raw: key, match: "picked" }); }
    else inv.unknown.push({ raw: key, qty, suggestions: suggest(key.replace(/_/g, " ")) });
  }
  return inv;
}

/** Looks like a parts list rather than a robot description: "I have ...", "mere paas ... hai", a pasted list. */
export function isInventoryPrompt(text: string): boolean {
  const t = clean(text);
  if (/^(?:i\s+(?:have|got|own|bought)|i've\s+got|i\s+already\s+have|mere\s+(?:paas|pass|pas)|मेरे\s+पास|my\s+(?:parts|kit|parts\s+bin)\s+(?:has|have|contains?|is)|(?:parts|inventory|kit\s+contents|shopping\s+list|contents)\s*:)/.test(t)) return true;
  if (/\b(?:using|with|from)\s+(?:only\s+)?(?:these|my|the\s+following)\s+parts\b|\bmake\s+(?:a\s+robot|something)\s+(?:from|with|out\s+of)\b|\bbuild\s+(?:from|with)\s+my\s+parts\b/.test(t)) return true;
  return text.split(/\n/).filter((l) => /^\s*(?:[-*•]|\d+\s*x?\s)/.test(l)).length >= 3;
}

/** The inventory as catalog key -> quantity. */
export const counts = (inv: Inventory): Record<string, number> => Object.fromEntries(inv.items.map((i) => [i.key, i.qty]));

/** Search the catalog for the parts picker: name, key, category or model code. */
export function searchParts(query: string, limit = 12): { key: string; name: string; category: string; price_usd: number }[] {
  const q = clean(query);
  if (!q) return [];
  const hit = matchChunk(quantity(q).rest);
  const ranked = suggest(q, limit + 4).filter((s) => s.score > 0);
  const keys = [...new Set([...(hit ? [hit.alias.key] : []), ...ranked.map((s) => s.key)])];
  return keys.filter((k) => CATALOG[k] && !/^(?:fastener|insert)$/.test(CATALOG[k].category)).slice(0, limit)
    .map((k) => ({ key: k, name: CATALOG[k].name, category: CATALOG[k].category, price_usd: CATALOG[k].price_usd }));
}
