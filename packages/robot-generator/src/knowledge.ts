// What the robot is for, when the prompt does not name a robot type: a function-to-module table.
//
// Each entry turns a task ("waters my plants"), an object that is not a robot ("a toaster"), an animal ("a robot
// fish") or a named or fictional robot ("R2-D2") into a body plan that the rule parser reads (`canonical`), plus the
// task tools the robot carries and the reason, which is shown with the result. Named robots are read as their body
// plan only: no meshes, logos or likeness. The rule parser stays the fast path: this table is read when the prompt
// names no robot type, and a similarity search over the same entries (similarity.ts) is read after that.
import type { ToolKind } from "./tools.ts";

export interface KnowledgeEntry {
  id: string;
  /** fast path: words that select the entry */
  rx: RegExp;
  /** a body plan in words the rule parser reads */
  canonical: string;
  /** task tools the robot carries (tools.ts) */
  tools?: ToolKind[];
  /** why this body does the job: shown with the result */
  why: string;
  /** words describing the entry, for the similarity search when no keyword matches */
  about: string;
  kind: "task" | "object" | "animal" | "named";
}

// ---------------------------------------------------------------- tasks
export const TASKS: KnowledgeEntry[] = [
  { id: "water_plants", kind: "task", rx: /\bwater(?:s|ing)?\b[\w\s]{0,24}\b(?:plants?|garden|flowers?|pots?|lawn|seedlings?|herbs?|vegetables?|crops?|tomato(?:es)?|succulents?|orchids?|ferns?|bonsai|trees?|roses?|basil|balcony|terrace|greenhouse)\b|\b(?:irrigat\w*|sprinkl\w*)\b/,
    canonical: "differential drive robot with a camera", tools: ["water_tank", "pump_hose"], about: "water plants garden flowers pots irrigate hose pump watering can",
    why: "a small wheeled base drives to each pot; a pump pushes water from the tank on its deck through a hose to a nozzle" },
  { id: "clean_solar", kind: "task", rx: /\bsolar\s+panels?\b|\bphotovoltaic\b|\bpv\s+(?:panels?|array)\b/,
    canonical: "four wheel robot with a camera", tools: ["brush", "water_tank", "spray_nozzle"], about: "clean solar panels dust brush wash photovoltaic roof",
    why: "a low skid-steer base drives along the panel row; a motor-driven roller brush in front sweeps the dust and a nozzle wets it" },
  { id: "clean_floor", kind: "task", rx: /\b(?:vacuum(?:s|ing)?|sweep(?:s|ing)?|mop(?:s|ping)?|scrub(?:s|bing)?)\b[\w\s]{0,16}\b(?:floors?|carpets?|rooms?|house|home|kitchen)\b|\b(?:clean(?:s|ing)?|tid(?:y|ies|ying))\s+(?:the\s+|my\s+)?(?:floors?|house|home|room|kitchen|carpet)\b|\brobot(?:ic)?\s+(?:vacuum|mop|sweeper)\b|\bclean(?:s|ing)?\b(?!\s+(?:solar|windows?|pools?|dishes|panels?|pipes?|gutters?|cars?|litter|tables?))/,
    canonical: "differential drive robot", tools: ["vacuum", "brush"], about: "clean vacuum sweep mop floor carpet dust dirt house room",
    why: "a round two-wheel base drives over the floor with a suction fan and a side brush underneath" },
  { id: "clean_windows", kind: "task", rx: /\b(?:clean(?:s|ing)?|wash(?:es|ing)?|wip(?:e|es|ing))\b[\w\s]{0,12}\bwindows?\b|\bwindow[\s-]?clean\w*/,
    canonical: "6 dof robot arm", tools: ["brush"], about: "clean wash wipe windows glass squeegee",
    why: "a bench arm moves a brush over the glass; real window robots cling by a suction fan, which I do not design" },
  { id: "clean_pool", kind: "task", rx: /\b(?:clean(?:s|ing)?|vacuum\w*)\b[\w\s]{0,12}\b(?:pool|aquarium|fish\s*tank|pond)\b|\bpool\s+clean\w*/,
    canonical: "underwater rov with a camera", tools: ["brush"], about: "clean pool aquarium pond underwater algae",
    why: "a small thruster-driven submersible carries a brush to the walls; a sealed hull keeps the electronics dry" },
  { id: "dishes", kind: "task", rx: /\b(?:wash(?:es|ing)?|clean(?:s|ing)?|load(?:s|ing)?)\b[\w\s]{0,12}\b(?:dishes|plates|cups|dishwasher)\b/,
    canonical: "6 dof robot arm with a gripper", tools: ["spray_nozzle"], about: "wash dishes plates cups sink dishwasher kitchen",
    why: "an arm at the sink picks each dish and rinses it under a spray nozzle; loading a dishwasher needs a learned skill (the training scaffold is the start)" },
  { id: "laundry", kind: "task", rx: /\b(?:fold(?:s|ing)?|sort(?:s|ing)?|iron(?:s|ing)?)\b[\w\s]{0,12}\b(?:laundry|clothes|shirts?|towels?|garments?)\b|\blaundry\b/,
    canonical: "dual arm robot", about: "fold laundry clothes shirts towels iron",
    why: "two arms are needed to spread and fold cloth; folding is an open research problem, so the robot is the body and the training scaffold, not a solved skill" },
  { id: "feed_pets", kind: "task", rx: /\bfeed(?:s|ing)?\b[\w\s]{0,12}\b(?:fish|cats?|dogs?|pets?|birds?|chickens?|hamsters?|rabbits?)\b|\b(?:pet|fish|cat|dog)\s+feeder\b/,
    canonical: "arduino robot arm", tools: ["scoop"], about: "feed fish cat dog pet food feeder dispenser",
    why: "a small hobby-servo arm tips a scoop of food from a hopper at set times" },
  { id: "litter", kind: "task", rx: /\blitter\s*(?:box|tray)\b|\bscoop(?:s|ing)?\b[\w\s]{0,12}\b(?:poop|litter|waste)\b/,
    canonical: "4 dof robot arm", tools: ["scoop"], about: "litter box cat scoop waste clean",
    why: "a bench arm sifts the litter with a scoop" },
  { id: "follow_photos", kind: "task", rx: /\bfollow(?:s|ing)?\b[\w\s]{0,16}\b(?:cats?|dogs?|pets?|kids?|children|me|my\s+\w+)\b[\w\s,]{0,30}\b(?:photos?|pictures?|pics|films?|filming|records?|recording|videos?|camera)\b|\b(?:photograph|film)s?\b[\w\s]{0,12}\b(?:my\s+)?(?:cats?|dogs?|pets?)\b|\bpet\s+cam(?:era)?\b/,
    canonical: "differential drive robot with a camera", tools: ["camera_mast"], about: "follow cat dog pet take photos pictures film record video camera",
    why: "a quiet two-wheel base keeps the animal in view; a pan-tilt camera on a mast frames the shots" },
  { id: "pet_play", kind: "task", rx: /\b(?:entertain\w*|play(?:s|ing)?\s+with|amus\w*|exercis\w*|chase\w*\s+by|keeps?\s+(?:my\s+)?(?:cats?|dogs?|pets?)\s+(?:busy|entertained|active))\b[\w\s]{0,16}\b(?:cats?|dogs?|pets?|kittens?|puppies|hamsters?)\b|\b(?:cats?|dogs?|pets?|kittens?|puppies)\s+(?:busy|entertained|active|amused|happy|company)\b|\b(?:cats?|dogs?|pets?)\s+toy\b/,
    canonical: "arduino car", tools: ["led_panel"], about: "entertain play with cat dog pet toy chase busy",
    why: "a small fast car the animal can chase, with lights; no laser pointer (eye safety)" },
  { id: "photos", kind: "task", rx: /\b(?:take(?:s)?|taking)\s+(?:photos?|pictures?|pics|selfies?)\b|\bphotograph\w*\b|\btime[\s-]?lapse\b/,
    canonical: "differential drive robot with a camera", tools: ["camera_mast"], about: "take photos pictures photography camera timelapse",
    why: "a wheeled base carries a pan-tilt camera on a mast" },
  { id: "telepresence", kind: "task", rx: /\btelepresence\b|\bvideo\s+call\w*\b|\bremote\s+(?:visit|presence)\b/,
    canonical: "differential drive robot with a camera", tools: ["camera_mast", "speaker", "led_panel"], about: "telepresence video call remote visit screen talk",
    why: "a two-wheel base carries a camera at head height, a speaker and a light panel" },
  { id: "companion", kind: "task", rx: /\b(?:companion|friend|buddy|talk(?:s|ing)?\s+(?:to|with)\s+(?:me|kids|children)|tell(?:s)?\s+stories|read(?:s)?\s+(?:to|stories)|keep(?:s)?\s+(?:me\s+)?company|teach(?:es|ing)?\s+(?:kids|children)|educational|for\s+(?:my\s+)?kids?)\b/,
    canonical: "differential drive robot with a camera", tools: ["speaker", "led_panel"], about: "companion friend talk kids children stories teach educational play company",
    why: "a small two-wheel robot with a speaker and a light panel for a face; conversation is software, not part of the body" },
  { id: "music", kind: "task", rx: /\b(?:play(?:s|ing)?\s+(?:music|songs?|the\s+(?:drums?|piano|guitar|xylophone))|drummer|dj)\b/,
    canonical: "4 dof robot arm", tools: ["speaker"], about: "play music songs drums piano instrument",
    why: "a bench arm strikes or presses the instrument; a speaker plays back" },
  { id: "light", kind: "task", rx: /\b(?:desk\s+lamp|lamp|lights?\s+(?:up|my)|reading\s+light|spotlight|torch)\b/,
    canonical: "4 dof robot arm", tools: ["led_panel"], about: "lamp light reading desk spotlight illuminate",
    why: "a desk arm aims an LED panel where it is needed" },
  { id: "deliver", kind: "task", rx: /\b(?:deliver(?:s|y|ing)?|carr(?:y|ies|ying)|transport(?:s|ing)?|haul(?:s|ing)?|fetch(?:es|ing)?\s+(?:packages?|parcels?|boxes|groceries|luggage|mail)|luggage|suitcases?|groceries|parcels?|packages?)\b/,
    canonical: "four wheel robot with a camera", tools: ["tray"], about: "deliver carry transport haul packages parcels boxes luggage groceries cargo",
    why: "a skid-steer base carries the load on a tray and covers distance" },
  { id: "serve", kind: "task", rx: /\bserv(?:e|es|ing)\s+(?:drinks?|food|tea|coffee|meals?|snacks?)\b|\bwaiter\b|\brestaurant\b|\bbutler\b/,
    canonical: "differential drive robot with a camera", tools: ["tray"], about: "serve drinks food tea coffee waiter restaurant tray",
    why: "a two-wheel base carries drinks on a level tray" },
  { id: "patrol", kind: "task", rx: /\b(?:patrol(?:s|ling)?|security\s+(?:robot|guard|patrol)|guard(?:s|ing)?\s+(?:my\s+)?(?:house|home|yard|warehouse|office)|night\s+watch|watch(?:es)?\s+(?:my\s+)?(?:house|home))\b/,
    canonical: "four wheel robot with a camera and lidar", tools: ["camera_mast", "led_panel"], about: "patrol security guard watch house warehouse night",
    why: "a skid-steer base with a lidar for mapping and a camera on a mast; it records places, not people without their consent" },
  { id: "inventory", kind: "task", rx: /\b(?:inventory|stock[\s-]?tak\w*|warehouse|shelf\s+scan\w*|barcodes?)\b/,
    canonical: "four wheel robot with a camera and lidar", tools: ["camera_mast"], about: "warehouse inventory shelves barcode scan stock",
    why: "a skid-steer base maps the aisles while a tall camera mast reads the shelves" },
  { id: "mow", kind: "task", rx: /\bmow(?:s|ing|er)?\b|\blawn\s*mower\b|\bcut(?:s|ting)?\s+(?:the\s+)?(?:grass|lawn)\b/,
    canonical: "four wheel robot with a camera", tools: ["mower_blade"], about: "mow lawn grass cut mower yard garden",
    why: "a skid-steer base carries a guarded cutting disc under the deck" },
  { id: "snow", kind: "task", rx: /\b(?:shovel(?:s|ing)?|plough(?:s|ing)?|plow(?:s|ing)?|clear(?:s|ing)?)\s+(?:the\s+)?snow\b|\bsnow\s*(?:plough|plow|blower)\b/,
    canonical: "four wheel robot with a camera", tools: ["scoop"], about: "snow shovel plow clear driveway winter",
    why: "a skid-steer base pushes a front blade; heavy snow needs far bigger motors than these bases" },
  { id: "harvest", kind: "task", rx: /\b(?:garden(?:ing|er)?|weed(?:s|ing)?|harvest(?:s|ing)?|fruit[\s-]?pick\w*|pick(?:s|ing)?\s+(?:fruit|apples|strawberries|tomatoes|vegetables)|plant(?:s|ing)?\s+(?:seeds|trees|bulbs)|farm(?:ing|er)?|agricultur\w*|greenhouse|crops?)\b/,
    canonical: "mobile manipulator rover with an arm", about: "garden weed harvest pick fruit plant seeds farm agriculture greenhouse crops",
    why: "a rover drives along the rows and an arm on its deck reaches each plant" },
  { id: "spray_crops", kind: "task", rx: /\bspray(?:s|ing)?\s+(?:crops?|fields?|weeds?|fertili[sz]er|pesticides?)\b/,
    canonical: "four wheel robot with a camera", tools: ["water_tank", "spray_nozzle"], about: "spray crops field fertilizer weeds",
    why: "a skid-steer base carries a tank and a pump-fed spray nozzle along the rows" },
  { id: "paint_walls", kind: "task", rx: /\bpaint(?:s|ing)?\s+(?:the\s+|my\s+)?(?:walls?|house|fences?|rooms?|murals?|ceilings?)\b/,
    canonical: "mobile manipulator rover with an arm", tools: ["spray_nozzle"], about: "paint walls house fence room mural spray",
    why: "a rover moves along the wall and its arm sweeps a spray nozzle; a full wall needs a tall lift, which I do not design" },
  { id: "draw", kind: "task", rx: /\b(?:draw(?:s|ing)?|sketch(?:es|ing)?|writ(?:e|es|ing)|handwrit\w*|plot(?:s|ting)?|pen\s+plotter|calligraph\w*|homework)\b/,
    canonical: "cartesian gantry robot", tools: ["pen"], about: "draw write sketch pen plotter handwriting calligraphy homework paper",
    why: "a flat two-axis frame moves a pen over paper; the pen lift is the third axis" },
  { id: "print3d", kind: "task", rx: /\b3d[\s-]?print\w*|\blaser\s+(?:engrav|cut)\w*|\bcnc\b|\bengrav\w*|\bmill(?:s|ing)?\b/,
    canonical: "cartesian gantry robot", about: "3d printer laser engraver cnc mill machine tool",
    why: "machine tools are Cartesian: three linear axes on rods and belts; the tool head itself (hot end, laser, spindle) is not designed here" },
  { id: "sort_fast", kind: "task", rx: /\b(?:high[\s-]?speed|fast)\s+(?:pick(?:ing)?|sort(?:ing)?)\b|\bsort(?:s|ing)?\s+(?:candy|sweets|parts|coins|lego|beads|screws|items|objects|things)\b|\bconveyor\b/,
    canonical: "delta robot with a suction gripper", about: "sort pick fast conveyor candy parts coins lego",
    why: "a delta robot moves light parts fastest: three motors stay on the frame and only thin rods move" },
  { id: "pick_place", kind: "task", rx: /\b(?:pick(?:s|ing)?(?:[\s-]+(?:and|&|n)[\s-]+place)?|stack(?:s|ing)?|assembl(?:e|es|y|ing)|pack(?:s|ing)?|solder(?:s|ing)?|pour(?:s|ing)?|cook(?:s|ing)?|grab(?:s|bing)?|lift(?:s|ing)?|weld(?:s|ing)?|play(?:s|ing)?\s+chess|make(?:s)?\s+(?:coffee|tea|cocktails|drinks|sandwiches|pancakes)|bartend\w*|barista|stir(?:s|ring)?|flip(?:s|ping)?\s+(?:burgers|pancakes)|solve(?:s)?\s+(?:a\s+)?rubik\w*|chopping|cut(?:s|ting)?\s+vegetables)\b/,
    canonical: "6 dof robot arm with a gripper", about: "pick place stack assemble pack solder pour cook grab lift weld chess coffee bartender",
    why: "a fixed arm does precise work at a bench" },
  { id: "fetch", kind: "task", rx: /\b(?:fetch(?:es|ing)?|bring(?:s)?\s+(?:me|things)|tidy|tidies|tidying|clean(?:s|ing)?\s+up|pick(?:s|ing)?\s+up\s+(?:toys|things|stuff|clothes|trash|litter|socks)|open(?:s)?\s+doors?|load(?:s)?\s+the\s+(?:washing|dryer)|help(?:s)?\s+(?:the\s+)?(?:elderly|old\s+people|disabled)|assist(?:s|ive)?|caregiv\w*)\b/,
    canonical: "mobile manipulator rover with an arm", about: "fetch bring tidy pick up toys clothes trash open doors help elderly assist home",
    why: "a wheeled base moves around the room and an arm on it picks things up" },
  { id: "inspect_pipes", kind: "task", rx: /\b(?:inspect(?:s|ing|ion)?|crawl(?:s|ing)?\s+(?:through|in)|explor(?:e|es|ing))\b[\w\s]{0,16}\b(?:pipes?|ducts?|tunnels?|drains?|sewers?|vents?|rubble|tight\s+spaces?|crawl\s*spaces?)\b|\bsearch\s+and\s+rescue\b|\bpipe\s+inspect\w*/,
    canonical: "snake robot with a camera", about: "inspect pipes ducts tunnels drains rubble rescue tight spaces crawl",
    why: "a chain of servo segments slides through gaps a wheeled base cannot enter, with a camera on its head" },
  { id: "underwater", kind: "task", rx: /\b(?:swim(?:s|ming)?|dive(?:s)?|diving|underwater|under\s+water|explore(?:s)?\s+(?:the\s+)?(?:lake|sea|ocean|reef|river)|inspect(?:s)?\s+(?:the\s+)?(?:hull|dock|boat|reef))\b/,
    canonical: "underwater rov with a camera", about: "swim dive underwater lake sea ocean reef hull dock explore",
    why: "a tethered submersible with thrusters, a sealed hull for the electronics and a camera" },
  { id: "aerial", kind: "task", rx: /\b(?:fl(?:y|ies|ying)|aerial|from\s+the\s+(?:air|sky)|bird'?s?[\s-]eye|survey(?:s|ing)?\s+(?:my\s+|the\s+)?(?:fields?|land|roofs?|farms?|crops?)|inspect(?:s)?\s+(?:the\s+)?(?:roof|chimney|gutters?|bridge|tower))\b/,
    canonical: "quadcopter drone with a camera", about: "fly flying aerial sky survey fields roof chimney gutters bird's eye",
    why: "a quadcopter is the simplest machine that flies and hovers" },
  { id: "stairs", kind: "task", rx: /\b(?:climb(?:s|ing)?\s+stairs|stairs|steps|rough\s+terrain|hik(?:e|es|ing)|off[\s-]?road|rocky|uneven\s+ground|trails?|mountains?)\b/,
    canonical: "quadruped", about: "climb stairs steps rough terrain hike off-road rocky uneven",
    why: "legs handle steps and rough ground" },
  { id: "walk", kind: "task", rx: /\b(?:walk(?:s|ing)?|run(?:s|ning)?|jump(?:s|ing)?|trot(?:s|ting)?)\b/,
    canonical: "quadruped", about: "walk run jump trot legs",
    why: "legged robots walk; a quadruped is the most stable" },
  { id: "dance", kind: "task", rx: /\bdanc(?:e|es|ing|er)\b|\bwave(?:s)?\s+(?:hello|at)\b|\bhug(?:s|ging)?\b/,
    canonical: "humanoid robot", about: "dance wave hug gesture human",
    why: "a humanoid has the arms, legs and head to dance or gesture" },
  { id: "explore", kind: "task", rx: /\b(?:explor(?:e|es|ing|er)|map(?:s|ping)?\s+(?:the\s+|my\s+)?(?:house|room|office|area|building)|slam)\b/,
    canonical: "four wheel robot with a camera and lidar", about: "explore map house room office building slam navigate",
    why: "a skid-steer base with a lidar maps the space as it drives" },
  { id: "follow", kind: "task", rx: /\bfollow(?:s|ing)?\s+(?:me|my\s+\w+|people|the\s+line)\b|\bshopping\s+(?:cart|trolley)\b|\bcaddy\b|\bgolf\b/,
    canonical: "four wheel robot with a camera", tools: ["tray"], about: "follow me carry golf caddy shopping cart",
    why: "a skid-steer base follows at walking pace with the load on a tray" },
  { id: "massage", kind: "task", rx: /\bmassag\w*\b/,
    canonical: "6 dof robot arm", about: "massage back shoulders",
    why: "a bench arm with a padded tool; force limits on a body are safety-critical and not certified by this design" },
];

// ---------------------------------------------------------------- objects that are not robots
export const OBJECTS: KnowledgeEntry[] = [
  { id: "toaster", kind: "object", rx: /\btoasters?\b|\bkettles?\b|\bmicrowaves?\b|\bblenders?\b|\bcoffee\s+(?:machine|maker)\b|\bovens?\b|\bstoves?\b/, canonical: "4 dof robot arm with a gripper",
    about: "toaster kettle microwave blender oven appliance kitchen", why: "is a kitchen appliance, not a robot; the closest robot is a bench arm that works it (pushes the lever, lifts the toast)" },
  { id: "fridge", kind: "object", rx: /\b(?:fridge|refrigerator|freezer|cooler|mini[\s-]?bar)s?\b/, canonical: "four wheel robot with a camera", tools: ["tray"],
    about: "fridge refrigerator cooler drinks cold", why: "is an appliance; the closest robot is a skid-steer base that brings a cooler to you" },
  { id: "car", kind: "object", rx: /\b(?:trucks?|lorr(?:y|ies)|bus(?:es)?|vans?|jeeps?|tractors?|go[\s-]?karts?|forklifts?)\b/, canonical: "four wheel robot with a camera",
    about: "truck bus van tractor forklift vehicle drive", why: "is a vehicle; the closest robot I design is a small skid-steer base" },
  { id: "bicycle", kind: "object", rx: /\b(?:bicycles?|bikes?|motorcycles?|motorbikes?|scooters?|skateboards?|segways?|hoverboards?|unicycles?)\b/, canonical: "differential drive robot",
    about: "bicycle bike motorcycle scooter skateboard segway balance", why: "balances on two wheels in line or rides with a person; I do not design self-balancing vehicles, so this is a two-wheel base with a caster" },
  { id: "aircraft", kind: "object", rx: /\b(?:aeroplanes?|airplanes?|planes?|jets?|helicopters?|gliders?|kites?|blimps?|balloons?|rockets?|spaceships?|satellites?)\b/, canonical: "quadcopter drone with a camera",
    about: "airplane plane jet helicopter glider rocket satellite fly", why: "fixed wings, rockets and satellites are not designed here; the flying machine I design is a quadcopter" },
  { id: "boat", kind: "object", rx: /\b(?:boats?|ships?|yachts?|kayaks?|canoes?|ferr(?:y|ies)|submarines?|jet\s*skis?)\b/, canonical: "underwater rov with a camera",
    about: "boat ship yacht kayak submarine water", why: "surface boats are not designed here; the water robot I design is a tethered thruster ROV" },
  { id: "lamp", kind: "object", rx: /\blamps?\b/, canonical: "4 dof robot arm", tools: ["led_panel"], about: "lamp light", why: "is a light; the robotic version is a desk arm that aims an LED panel" },
  { id: "camera", kind: "object", rx: /^(?:an?\s+)?(?:security\s+|web\s*|video\s+)?cam(?:era)?s?\s*$|\bcctv\b|\bdashcam\b|\bgimbal\b/, canonical: "differential drive robot with a camera", tools: ["camera_mast"],
    about: "camera cctv gimbal video", why: "on its own is a sensor; the robotic version is a pan-tilt camera on a wheeled base" },
  { id: "speaker", kind: "object", rx: /\b(?:smart\s+)?speakers?\b|\balexa\b|\bradios?\b|\bjukebox\b/, canonical: "differential drive robot", tools: ["speaker", "led_panel"],
    about: "speaker radio alexa music sound", why: "is a speaker; the robotic version is a small wheeled robot that carries one" },
  { id: "furniture", kind: "object", rx: /\b(?:chairs?|tables?|desks?|sofas?|couch(?:es)?|beds?|stools?|shel(?:f|ves)|cabinets?|wardrobes?)\b/, canonical: "four wheel robot with a camera", tools: ["tray"],
    about: "chair table desk sofa bed shelf furniture", why: "is furniture; the closest robot is a skid-steer base carrying a flat tray on its deck" },
  { id: "bin", kind: "object", rx: /\b(?:trash|rubbish|garbage|waste|recycling)\s+(?:cans?|bins?)\b|\bdustbins?\b|\bbins?\b/, canonical: "differential drive robot", tools: ["tray"],
    about: "trash can bin rubbish garbage recycling", why: "is a container; the closest robot is a two-wheel base that carries the bin to you" },
  { id: "fan", kind: "object", rx: /\b(?:electric\s+)?fans?\b|\bair\s+(?:conditioner|purifier)s?\b|\bheaters?\b|\bhumidifiers?\b/, canonical: "differential drive robot", tools: ["vacuum"],
    about: "fan heater air purifier humidifier", why: "is an appliance; the closest robot is a two-wheel base carrying a fan" },
  { id: "screen", kind: "object", rx: /\b(?:phones?|smartphones?|tablets?|laptops?|computers?|pcs?|tvs?|televisions?|monitors?|screens?|ipads?)\b/, canonical: "differential drive robot with a camera", tools: ["camera_mast"],
    about: "phone tablet laptop computer tv monitor screen", why: "is a computer; the closest robot is a telepresence base that carries a screen and camera at head height" },
  { id: "clock", kind: "object", rx: /\b(?:clocks?|watch(?:es)?|alarm\s+clocks?|calendars?)\b/, canonical: "4 dof robot arm", tools: ["led_panel"],
    about: "clock watch alarm time", why: "keeps time; the closest robot is a desk arm with an LED panel (an alarm that comes to you would be a wheeled base)" },
  { id: "house", kind: "object", rx: /\b(?:houses?|buildings?|bridges?|towers?|castles?|skyscrapers?|cit(?:y|ies))\b/, canonical: "mobile manipulator rover with an arm",
    about: "house building bridge tower castle construction", why: "is a structure, not a machine; the closest robot is a mobile arm that lays blocks" },
  { id: "tool", kind: "object", rx: /\b(?:hammers?|screwdrivers?|wrench(?:es)?|drills?|saws?|scissors|pliers|brooms?|mops?|buckets?)\b/, canonical: "6 dof robot arm with a gripper",
    about: "hammer screwdriver wrench drill saw scissors tool", why: "is a hand tool; the closest robot is an arm that holds and uses it" },
  { id: "instrument", kind: "object", rx: /\b(?:guitars?|pianos?|violins?|drums?|flutes?|trumpets?|keyboards?|xylophones?)\b/, canonical: "4 dof robot arm", tools: ["speaker"],
    about: "guitar piano violin drums instrument music", why: "is an instrument; the closest robot is a bench arm that plays it" },
  { id: "food", kind: "object", rx: /\b(?:sandwich(?:es)?|pizzas?|burgers?|cakes?|cookies?|bread|soup|salad|ice\s+cream|hot\s*dogs?|tacos?|sushi|coffee|tea)\b(?!\s+(?:machine|maker))/, canonical: "6 dof robot arm with a gripper",
    about: "sandwich pizza burger cake food cooking", why: "is food; the closest robot is a bench arm that assembles it" },
  { id: "toy", kind: "object", rx: /\b(?:toys?|lego|teddy\s+bears?|dolls?|action\s+figures?|rc\s+toys?|puppets?)\b/, canonical: "arduino car",
    about: "toy lego teddy doll kids play", why: "is a toy; the closest robot is a small Arduino car a child can build" },
  { id: "wheelchair", kind: "object", rx: /\b(?:wheelchairs?|stretchers?|strollers?|prams?|walkers?\s+for)\b/, canonical: "four wheel robot with a camera", tools: ["tray"],
    about: "wheelchair stroller pram mobility", why: "carries a person, which is a safety-critical device I do not design; the closest robot is a skid-steer base that carries objects" },
];

// ---------------------------------------------------------------- animals as body plans
export const ANIMALS: KnowledgeEntry[] = [
  { id: "fish", kind: "animal", rx: /\b(?:robo(?:t(?:ic)?)?[\s-]?)?(?:fish|sharks?|whales?|dolphins?|jellyfish|octop(?:us|i)|squid|turtles?|seals?|manta)\b/, canonical: "underwater rov with a camera",
    about: "fish shark whale dolphin octopus turtle swim water", why: "swims; a thruster ROV is the buildable version (no flapping fins)" },
  { id: "bird", kind: "animal", rx: /\b(?:birds?|eagles?|owls?|parrots?|pigeons?|bats?|butterfl(?:y|ies)|bees?|dragonfl(?:y|ies)|insects?\s+that\s+fl(?:y|ies)|flying\s+\w+)\b/, canonical: "quadcopter drone with a camera",
    about: "bird eagle owl parrot bat bee butterfly fly wings", why: "flies; a quadcopter is the buildable version (no flapping wings)" },
  { id: "snake", kind: "animal", rx: /\b(?:snakes?|serpents?|worms?|caterpillars?|eels?|centipedes?|millipedes?|lizards?|dragons?)\b/, canonical: "snake robot with a camera",
    about: "snake serpent worm eel caterpillar slither", why: "slithers; a chain of servo segments on passive wheels is the buildable version" },
  { id: "four_legs", kind: "animal", rx: /\b(?:cats?|kittens?|horses?|pon(?:y|ies)|cows?|goats?|sheep|deer|elephants?|lions?|tigers?|wol(?:f|ves)|foxes?|bears?|pigs?|rabbits?|bunn(?:y|ies)|mice|mouse|rats?|hamsters?|frogs?|dinosaurs?|t[\s-]?rex|raptors?|animals?|pets?|puppy|puppies|kangaroos?|camels?|giraffes?|cheetahs?|panthers?)\b/, canonical: "quadruped with a camera",
    about: "cat horse cow deer elephant lion tiger wolf bear pig rabbit mouse dinosaur animal pet four legs", why: "walks on legs; a quadruped is the buildable version" },
  { id: "crab", kind: "animal", rx: /\b(?:crabs?|lobsters?|scorpions?|ants?|beetles?|cockroach(?:es)?|insects?|bugs?)\b/, canonical: "hexapod",
    about: "crab lobster scorpion ant beetle insect bug six legs", why: "walks on many legs; a hexapod is the buildable version" },
  { id: "monkey", kind: "animal", rx: /\b(?:monkeys?|apes?|gorillas?|chimp(?:anzee)?s?|orangutans?|people|person|humans?|man|woman|child|boy|girl)\b/, canonical: "humanoid robot",
    about: "monkey ape gorilla person human man woman child", why: "has arms, legs and a head; a small servo humanoid is the buildable version" },
];

// ---------------------------------------------------------------- named and fictional robots (body plan only)
const N = (id: string, rx: RegExp, canonical: string, why: string, tools?: ToolKind[]): KnowledgeEntry => ({ id, kind: "named", rx, canonical, why, about: id.replace(/_/g, " "), ...(tools ? { tools } : {}) });
export const NAMED: KnowledgeEntry[] = [
  N("r2_d2", /\br2[\s-]?d2\b|\bastromech\b/, "differential drive robot with a camera", "a short dome-topped droid on wheels", ["speaker", "led_panel"]),
  N("bb_8", /\bbb[\s-]?8\b|\bsphero\b/, "differential drive robot with a camera", "a rolling ball droid; a self-balancing sphere is not designed here, so it is a two-wheel base"),
  N("c_3po", /\bc[\s-]?3po\b|\bprotocol\s+droid\b/, "humanoid robot with a camera", "a walking humanoid"),
  N("terminator", /\bterminator\b|\bt[\s-]?800\b|\bt[\s-]?1000\b/, "humanoid robot with a camera", "a full-size humanoid body plan; no weapons"),
  N("optimus_prime", /\boptimus\s+prime\b|\btransformers?\s+(?:robot|toy|from)\b|\bautobots?\b|\bdecepticons?\b|\bmegatron\b/, "humanoid robot", "a humanoid; changing into a vehicle is not designed (the joints and shells to fold a car body are far beyond these parts)"),
  N("tesla_optimus", /\btesla\s+(?:bot|optimus)\b|\boptimus\b|\bfigure\s+0?[12]\b|\bagility\s+digit\b|\bapptronik\s+apollo\b|\bunitree\s+(?:g1|h1)\b/, "humanoid robot with a camera", "a walking humanoid"),
  N("atlas", /\b(?:boston\s+dynamics\s+)?atlas\s+(?:robot|humanoid)\b|\basimo\b|\bnao\s+robot\b|\bicub\b|\brobby\s+the\s+robot\b|\bastro\s*boy\b|\bbender\s+(?:robot|from\s+futurama)\b|\bmarvin\s+the\s+paranoid\b|\bchappie\b|\bdata\s+from\s+star\s+trek\b|\bandroids?\b|\bcyborgs?\b/, "humanoid robot with a camera", "a walking humanoid"),
  N("spot", /\bspot\s+(?:robot|dog|mini)\b|\b(?:like|build|make)\s+spot\b|^\s*spot\s*$|\bboston\s+dynamics\b(?!\s+atlas)|\bunitree\s+go[12]\b|\bunitree\b(?!\s+[gh]1)|\bmini\s+cheetah\b|\baibo\b|\bk[\s-]?9\b/, "quadruped with a camera", "a four-legged robot dog"),
  N("spot_arm", /\bspot\s+(?:with\s+(?:an?\s+)?(?:\d\s*-?\s*(?:dof|axis)\s+)?)?arm\b|\bspot\s+arm\b/, "quadruped with an arm and a camera", "a robot dog with an arm on its back"),
  N("roomba", /\broomba\b|\broborock\b|\bdeebot\b|\beufy\b/, "differential drive robot", "a round floor cleaner on two wheels", ["vacuum", "brush"]),
  N("dalek", /\bdaleks?\b/, "mecanum robot with a camera", "a gliding base (mecanum wheels under a skirt); no weapons", ["led_panel", "speaker"]),
  N("johnny_5", /\bjohnny[\s-]?5\b|\bnumber\s+5\b|\bshort\s+circuit\b/, "tracked robot with an arm and a camera", "a tracked base with an arm"),
  N("curiosity", /\bcuriosity\b|\bperseverance\b|\bopportunity\s+rover\b|\bspirit\s+rover\b|\bsojourner\b|\blunokhod\b|\byutu\b|\bpragyan\b/, "mars rover with an arm and a camera", "a six-wheel planetary rover with a sampling arm"),
  N("ingenuity", /\bingenuity\b|\bdji\b|\bmavic\b|\bphantom\s+drone\b/, "quadcopter drone with a camera", "a small rotorcraft"),
  N("canadarm", /\bcanadarm\b|\bdextre\b/, "7 dof robot arm with a gripper", "a long seven-joint arm"),
  N("industrial_arms", /\bur[3-9]e?\b|\bur1[06]e?\b|\buniversal\s+robots?\b|\bkuka\b|\bfanuc\b|\babb\s+(?:irb|yumi)\b|\bfranka\b|\bpanda\s+arm\b|\bkinova\b|\bxarm\b|\bso[\s-]?10[01]\b|\bkoch\s+arm\b|\bdobot\b|\bda\s*vinci\b/, "6 dof robot arm with a gripper", "an industrial or research arm"),
  N("pepper", /\bpepper\s+(?:robot|humanoid)\b|\btemi\s+robot\b|\bamazon\s+astro\b|\bjibo\b|\banki\s+vector\b|\bvector\s+robot\b|\bcozmo\b|\bemo\s+robot\b|\bloona\b/, "differential drive robot with a camera", "a small home robot on wheels", ["speaker", "led_panel"]),
  N("stretch", /\bhello\s+robot\s+stretch\b|\bstretch\s+(?:re\d|robot)\b|\bpr2\b|\bfetch\s+robot\b|\btiago\b|\bmobile\s+aloha\b/, "mobile manipulator rover with an arm", "a mobile manipulator"),
  N("gundam", /\bgundams?\b|\bmechas?\b|\bjaegers?\b|\bpacific\s+rim\b|\bevangelion\b|\bmegazord\b|\bvoltron\b|\biron\s+giant\b/, "humanoid battle mech with a camera", "a giant piloted humanoid in the films; built as the walking QDD humanoid at buildable size"),
  N("hexbug", /\bhexbugs?\b/, "hexapod", "a six-legged walker"),
  N("snakebot", /\bsnakebot\b|\bomnitread\b/, "snake robot with a camera", "a segmented snake"),
  N("big_dog", /\bbig\s*dog\b|\bwildcat\b|\banymal\b/, "quadruped with a camera", "a legged robot"),
  N("robot_lawn", /\bautomower\b|\bworx\s+landroid\b/, "four wheel robot", "a robot mower", ["mower_blade"]),
  N("starship", /\bstarship\s+(?:robot|delivery)\b|\bkiwibot\b|\bserve\s+robotics\b/, "four wheel robot with a camera", "a sidewalk delivery robot", ["tray"]),
  N("rosie", /\brosie\b(?:\s+the\s+robot)?|\bjetsons\b/, "mecanum robot with a camera", "a maid robot on a gliding base", ["tray", "brush"]),
  N("ultron", /\bultron\s+(?:robot|drone|body)\b|\bultron\s+sentr(?:y|ies)\b|\bvision\s+from\s+marvel\b/, "humanoid robot with a camera", "a humanoid body plan"),
  N("hal", /\bhal[\s-]?9000\b|\bskynet\b|\bglados\b|\bmother\s+from\b/, "6 dof robot arm with a camera", "an AI, not a body; the closest buildable body is an arm with a camera", ["speaker", "led_panel"]),
  N("baby_yoda", /\bgrogu\b|\bbaby\s+yoda\b|\bfurb(?:y|ies)\b|\btamagotchi\b|\bminions?\b/, "differential drive robot with a camera", "a small companion on wheels", ["speaker", "led_panel"]),
];

/** Every table, most specific first: named robots, tasks, objects, animals. */
export const KNOWLEDGE: KnowledgeEntry[] = [...NAMED, ...TASKS, ...OBJECTS, ...ANIMALS];

/** First entry whose keywords appear, with the matched words. */
export function lookup(t: string, tables: KnowledgeEntry[] = KNOWLEDGE): { entry: KnowledgeEntry; matched: string } | undefined {
  for (const entry of tables) { const m = t.match(entry.rx); if (m) return { entry, matched: m[0].trim() }; }
  return undefined;
}
