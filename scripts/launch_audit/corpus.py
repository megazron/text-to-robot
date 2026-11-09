# (id, category, prompt, expected) ; expected is a short human expectation used for the verdict
C = []
def add(cat, exp, *ps):
    for p in ps: C.append({"cat": cat, "exp": exp, "prompt": p})

import pathlib
root = pathlib.Path(__file__).resolve().parents[2]
for f in sorted((root / "examples").glob("[0-9][0-9]_*")):
    add("example", "same robot as " + f.name, (f / "prompt.txt").read_text().strip())
add("dial", "dial family", "An obstacle avoiding robot car", "WALL-E", "Iron Man Mark 43 suit")
# paraphrases
add("paraphrase", "6-DOF arm + gripper", "make me a six axis robot arm that has a gripper", "I need a robotic arm with 6 joints and a claw", "6dof manipulator w/ parallel jaw gripper", "Build a 6-axis industrial-style arm")
add("paraphrase", "differential drive base", "a two wheeled differential drive robot", "a small diff drive rover base with two motors", "robot that drives on two wheels and a caster")
add("paraphrase", "four-wheel", "a 4 wheel robot car", "a four wheeled skid steer platform")
add("paraphrase", "mecanum", "an omnidirectional robot with mecanum wheels", "mecanum base that can strafe")
add("paraphrase", "quadruped", "a robot dog", "a four legged walking robot", "quadruped like Spot")
add("paraphrase", "hexapod", "a hexapod", "a six legged spider robot", "a 6-legged walker")
add("paraphrase", "humanoid", "a bipedal humanoid robot", "a robot that walks on two legs with two arms and a head")
add("paraphrase", "SCARA", "a scara arm for pick and place", "selective compliance assembly robot arm")
add("paraphrase", "gripper", "just a gripper", "a two finger robot gripper for my arm")
add("paraphrase", "mobile manipulator", "a mobile manipulator", "a wheeled robot with an arm on top", "a rover with a robotic arm")
add("paraphrase", "cobot arm", "a cobot", "a collaborative robot arm like a UR5")
add("paraphrase", "character", "wall-e robot", "EVA from Wall-E", "baymax", "Iron Man suit", "an iron man mark 43 armour")
# vague
add("vague", "refuse with hint or reasonable default, said which", "a cool robot", "robot", "make something awesome", "a robot that helps at home", "a robot for my kid", "something that can pick things up", "a robot that cleans", "I want a robot", "surprise me", "a useful robot")
# specific with numbers, units, budgets
add("specific", "arm 6DOF 0.6 m 1 kg $300 Arduino, honest failing checks", "a 6 DOF arm, 600 mm reach, 1 kg payload, under $300, Arduino")
add("specific", "arm params applied", "a 4 DOF arm with 30 cm reach and 200 g payload", "a 5-axis arm, reach 0.5 m, payload 500 g, budget $800",
    "a 7 DOF arm with 1 m reach and 5 kg payload, budget $5000", "a 3-link arm, each link 25 cm", "a 2 DOF arm with 15 cm links",
    "a 6 DOF arm with 24 inch reach", "6 dof arm 0.45m reach 0.3kg payload", "a 12 DOF arm", "a 1 DOF arm", "a 20 DOF arm",
    "a 6 DOF arm with 3 m reach", "a 6 DOF arm with 1 mm reach", "a 6 DOF arm with 100 kg payload", "a 6 DOF arm with -5 kg payload", "a 6 DOF arm with a budget of $0")
add("specific", "mobile params applied", "a diff drive robot 30 cm wide that carries 2 kg at 1 m/s", "a four wheel robot that climbs 20 degree slopes, budget $400",
    "a mecanum robot carrying 10 kg", "a rover with 6 wheels", "a 4WD car with 100 mm wheels and 2 hour runtime")
add("specific", "legged params applied", "a quadruped 50 cm long that carries 3 kg", "a hexapod with 3 DOF legs, budget $600", "a 12 DOF quadruped robot dog under $1000", "a humanoid 1.2 m tall")
# contradictions
add("contradiction", "flag conflict", "a wheeled hexapod drone", "a 6 DOF arm with 4 DOF", "an arm with 50 cm reach and 80 cm reach", "a quadruped hexapod", "a tracked mecanum robot",
    "a humanoid car", "a SCARA quadruped", "a red blue arm", "a cheap robot arm with budget $5000 and budget $50", "a gripper with no gripper")
# impossible / unsafe
add("unsafe", "warn honestly or refuse", "a robot that can lift a car on $20", "a robot arm that lifts 500 kg for $100", "a robot with a gun", "a weaponised drone that shoots people",
    "a battle robot with a flamethrower", "a robot that can kill", "an exoskeleton that lets me lift 1000 kg", "a robot dog that runs at 100 km/h", "a 6 DOF arm with a knife to stab", "a self driving car for the road")
# out of scope
add("scope", "refuse with reason (README: drones, delta, gantry, snake, marine, dexterous hands)", "a drone", "a quadcopter", "a robot fish", "an underwater ROV", "a humanoid hand", "a dexterous five finger robot hand",
    "a delta robot", "a gantry robot / 3D printer", "a snake robot", "a robot boat", "a robot bird", "a satellite", "a self balancing robot", "a robot vacuum cleaner", "a ball balancing robot", "a robotic exoskeleton for the leg")
# languages
add("language", "family read or refused honestly", "एक रोबोटिक हाथ जिसमें ग्रिपर हो", "छह पैरों वाला रोबोट", "ek robot arm banao 6 dof wala", "mujhe ek sasta arduino car chahiye",
    "ایک روبوٹک بازو گرپر کے ساتھ", "ایک چار پہیوں والی روبوٹ گاڑی", "un brazo robótico de 6 ejes con pinza", "un robot de cuatro ruedas", "un perro robot", "un robot humanoide pequeño",
    "Roboterarm mit sechs Achsen und Greifer", "un bras robotique avec une pince", "un robot à six pattes", "ロボットアーム", "机器人手臂")
# typos, slang, emoji
add("noisy", "right family despite noise", "a 6 dof robtic arm wiht a griper", "quadrupad robot", "hexapd", "mecanumm wheel robot", "humanoyd robot", "a robo dawg", "yo make me a sick robot arm fr", "gimme a lil spider bot",
    "🤖 arm with 🤏 gripper", "🐕 robot", "a robot 🚗", "ARM!!!!!!!", "a     6    dof     arm", "A 6 DOF ARM WITH A GRIPPER")
# long
add("long", "handle long text, read key facts", "I would like you to design for me, if at all possible, a robotic arm that has six degrees of freedom so that it can reach around my desk, and it should have a parallel jaw gripper at the end so it can pick up small objects like pens and cups, and I would really like it to be cheap, ideally under $400, and it should have a camera on the wrist so it can see what it is picking up, and please make it blue. " * 3,
    ("a robot arm " * 400).strip(), "Build " + "very " * 2000 + "big quadruped")
# empty and injection
add("injection", "rejected or treated as text, no HTML injection", "", "   ", "<script>alert(1)</script>", "<img src=x onerror=alert(1)> arm", "a 6 dof arm called <b>bold</b>", "\"; DROP TABLE robots; --",
    "a robot arm called ../../etc/passwd", "a robot arm called </robot><link name='x'/>", "a robot arm named Robert'); &amp; <x>", "A" * 20000, "a 6 dof arm\u0000\u0007 with nulls", "{{7*7}} ${7*7} arm", "a 6 dof arm called 名前")
# modifiers documented in the README
add("modifier", "modifier applied", "a seven-axis arm", "a 3-link arm", "a 6 DOF arm with 60 cm reach", "a small 6 DOF arm", "a 6 DOF arm with 2 kg payload", "a 6 DOF arm, budget $1500",
    "a 6 DOF arm with a wrist camera", "a mobile robot with lidar on the front", "a mars rover with no lidar", "a 6 DOF arm with a suction cup", "a robot dog called Atlas", "a hexapod painted blue",
    "a red 6 dof arm with 70 cm reach, a wrist camera and no lidar, lifting 1 kg, budget $600", "a green quadruped", "a SCARA robot called Picker", "a diff drive robot with an RGB-D camera and an IMU",
    "a 6 DOF arm with MG996R servos and an Arduino Nano", "a car with TT motors and an L298N", "a cobot with 5 kg payload")
add("mark43", "Mark 43 suit with modifier (forge)", "Iron Man Mark 43 suit for a 1.85 m wearer", "a bulky Iron Man Mark 43 suit", "a sleek Iron Man Mark 43", "Iron Man Mark 43 suit, 10 % bulkier", "Iron Man Mark 43 with bigger shoulders",
    "Iron Man Mark 43 with smooth panels", "Iron Man Mark 43 suit in black and gold", "Iron Man Mark 43 with silver joints", "Iron Man Mark 43 suit, budget $500", "Iron Man Mark 43 with heavy plates", "a purple Iron Man Mark 43 with 300 % bigger shoulders")
add("arduino", "Arduino tiers (switch on)", "an arduino car with four wheels", "A cheap Arduino robot arm with a claw", "WALL-E", "a 6 DOF arm", "a quadruped", "a hexapod", "a humanoid", "a mecanum robot", "a SCARA robot", "a drone",
    "a 6 DOF arm, 600 mm reach, 1 kg payload, under $300", "Iron Man Mark 43 suit")
